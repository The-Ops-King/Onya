import 'server-only';
import { BASE, MEMBERS, EOD, F, N } from '../schema';
import { defconFromOption, STEPS } from '../config';

// AIRTABLE_API_BASE only exists to point local tests at a fake server.
const API = process.env.AIRTABLE_API_BASE || 'https://api.airtable.com/v0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AirtableError extends Error {
  constructor(status, body) {
    super(`Airtable ${status}: ${body?.error?.message || body?.error?.type || JSON.stringify(body)}`);
    this.status = status;
    this.type = body?.error?.type;
  }
}

function token() {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new Error('AIRTABLE_TOKEN is not set');
  return t;
}

// Airtable allows 5 requests/second per base. Calls are serialised with a small gap,
// and a 429 waits out Airtable's 30-second penalty before one retry.
let last = 0;
async function at(path, { method = 'GET', query, body } = {}) {
  const wait = last + 220 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else if (v != null) url.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (res.status === 429 && attempt === 0) {
      await sleep(30_000);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new AirtableError(res.status, json);
    return json;
  }
}

const READ_FIELDS = [F.name, F.business, F.csm, F.email, F.lifecycleStatus, F.clientPhase, F.defcon, F.nextStep, F.nextDue, F.lastContact, ...Object.values(STEPS).map((s) => s.id)];

export function toMember(rec) {
  const f = rec.fields || {};
  const journey = {};
  for (const [k, s] of Object.entries(STEPS)) if (f[s.id]) journey[k] = f[s.id];
  return {
    id: rec.id,
    name: f[F.name] || '(no name)',
    business: f[F.business] || '',
    csm: f[F.csm] || '',
    email: f[F.email] || '',
    lifecycle: f[F.lifecycleStatus] || '',
    phase: f[F.clientPhase] || '',
    defconOption: f[F.defcon] || '',
    health: defconFromOption(f[F.defcon]),
    nextStep: f[F.nextStep] || '',
    nextDue: f[F.nextDue] || '',
    lastContact: f[F.lastContact] || '',
    journey,
  };
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Members assigned to a CSM, minus churned / refunded / completed.
export async function listMembers(csm) {
  const formula = `AND({${N.csm}}='${esc(csm)}', NOT(OR({${N.lifecycleStatus}}='Churned',{${N.lifecycleStatus}}='Refunded',{${N.lifecycleStatus}}='Completed',{${N.clientStage}}='Churned')))`;
  const out = [];
  let offset;
  do {
    const page = await at(`/${BASE}/${MEMBERS}`, { query: { filterByFormula: formula, 'fields[]': READ_FIELDS, returnFieldsByFieldId: 'true', pageSize: '100', offset } });
    out.push(...page.records.map(toMember));
    offset = page.offset;
  } while (offset);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMember(id) {
  const rec = await at(`/${BASE}/${MEMBERS}/${id}`, { query: { returnFieldsByFieldId: 'true' } });
  return toMember(rec);
}

// fields keyed by field ID. typecast stays off so a bad select option fails loudly instead of creating a new option.
export async function updateMember(id, fields) {
  return at(`/${BASE}/${MEMBERS}/${id}`, { method: 'PATCH', body: { fields, returnFieldsByFieldId: true } });
}

export async function addComment(id, text) {
  return at(`/${BASE}/${MEMBERS}/${id}/comments`, { method: 'POST', body: { text } });
}

export async function findEodRow(reference) {
  const page = await at(`/${BASE}/${EOD}`, { query: { filterByFormula: `{Submission reference}='${esc(reference)}'`, maxRecords: '1', returnFieldsByFieldId: 'true' } });
  return page.records[0] || null;
}

export async function createEodRow(fields) {
  return at(`/${BASE}/${EOD}`, { method: 'POST', body: { fields } });
}

export async function updateEodRow(id, fields) {
  return at(`/${BASE}/${EOD}/${id}`, { method: 'PATCH', body: { fields } });
}

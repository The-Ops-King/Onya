import { NextResponse } from 'next/server';
import { getMember, updateMember, addComment, findEodRow, createEodRow, updateEodRow, AirtableError } from '@/lib/server/airtable';
import { CSMS, canWrite, writesEnabled } from '@/lib/server/env';
import { sectionById, healthOf } from '@/lib/config';
import { planCard, missingRequired } from '@/lib/plan';
import { E, E_NEW } from '@/lib/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const same = (a, b) => String(a ?? '') === String(b ?? '');

// The CSM's local date must be within a day of the server's UTC date (time zones), never further.
function validDate(d) {
  if (!isDate(d)) return false;
  const diff = Math.abs(new Date(d + 'T12:00:00Z') - Date.now()) / 86400000;
  return diff <= 1.6;
}

// Write a member's fields. One PATCH for all of them; if Airtable rejects it, retry field by field
// so one bad value can't block the rest, and the log says exactly which field failed.
async function writeFields(memberId, updates) {
  const status = {};
  if (!updates.length) return status;
  const all = Object.fromEntries(updates.map((u) => [u.id, u.to]));
  try {
    const res = await updateMember(memberId, all);
    for (const u of updates) status[u.id] = same(res.fields?.[u.id], u.to) ? { ok: true } : { ok: false, error: `Airtable kept "${res.fields?.[u.id] ?? ''}"` };
    return status;
  } catch (e) {
    if (!(e instanceof AirtableError) || e.status >= 500) {
      for (const u of updates) status[u.id] = { ok: false, error: e.message };
      return status;
    }
  }
  for (const u of updates) {
    try {
      const res = await updateMember(memberId, { [u.id]: u.to });
      status[u.id] = same(res.fields?.[u.id], u.to) ? { ok: true } : { ok: false, error: `Airtable kept "${res.fields?.[u.id] ?? ''}"` };
    } catch (e) {
      status[u.id] = { ok: false, error: e.message };
    }
  }
  return status;
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { csm, date, cards = [], stats = {}, force = false } = body;
  if (!CSMS.includes(csm)) return NextResponse.json({ error: 'Unknown CSM' }, { status: 400 });
  if (!validDate(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });
  if (!Array.isArray(cards) || !cards.length || cards.length > 80) return NextResponse.json({ error: 'No cards' }, { status: 400 });

  const live = writesEnabled();
  const reference = `EOD ${csm} ${date}`;

  try {
    const existing = live ? await findEodRow(reference) : null;
    if (existing && !force) return NextResponse.json({ error: 'already_submitted', reference }, { status: 409 });

    const results = [];
    for (const card of cards) {
      const sec = sectionById(card.section);
      if (!sec || !/^rec[A-Za-z0-9]{14}$/.test(card.memberId || '')) {
        results.push({ memberId: card.memberId, name: card.name || '?', error: 'Bad card' });
        continue;
      }
      const member = await getMember(card.memberId); // fresh read: the plan is never taken from the browser
      const values = card.values || {};
      const missing = missingRequired(sec, member, values);
      const plan = planCard(sec, member, values, card.flags || {}, { csm, date });
      const allowed = live && canWrite(member.id);

      const ops = [];
      if (missing.length) ops.push({ field: '(form)', to: missing.join(', '), status: 'warning', note: 'Still missing on submit' });
      const st = allowed ? await writeFields(member.id, plan.updates) : {};
      for (const u of plan.updates) {
        const s = st[u.id];
        ops.push({ field: u.field, from: u.from, to: u.to, status: !allowed ? 'preview' : s?.ok ? 'written' : 'failed', error: s?.error });
      }
      for (const s of plan.skips) ops.push({ field: s.field, to: s.to, status: 'skipped', note: s.reason });
      if (plan.comment) {
        let cs = 'preview', err;
        if (allowed) {
          try {
            await addComment(member.id, plan.comment);
            cs = 'written';
          } catch (e) {
            cs = 'failed';
            err = e.message;
          }
        }
        ops.push({ field: 'Comment', to: plan.comment, status: cs, error: err });
      }
      results.push({ memberId: member.id, name: member.name, section: sec.id, manual: !!card.manual, written: allowed, values, member, ops });
    }

    const eod = live ? await writeEodRow({ csm, date, reference, existing, results, stats }).catch((e) => ({ status: 'failed', error: e.message })) : { status: 'preview' };
    return NextResponse.json({ ok: true, live, reference, results: results.map(({ member, values, written, ...r }) => r), eod });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

// One EOD Check-ins row per CSM per day: the readable summary in the existing section fields,
// plus the write log and timing stats in the fields added for this app.
async function writeEodRow({ csm, date, reference, existing, results: all, stats }) {
  // Only members that were actually written appear in the log row (matters while writes are limited to the test member).
  const results = all.filter((r) => r.written || r.error);
  const bySec = (id) => results.filter((r) => r.section === id && !r.error);
  const line = (r) => {
    const v = r.values;
    const h = healthOf(v.health);
    return `${r.name}: ${v.outcome || '—'}${v.nextStep ? ` → ${v.nextStep}${v.nextDue ? ` (${v.nextDue})` : ''}` : ''}${h ? ` · DEFCON ${h.v}` : ''}`;
  };
  const text = (id) => bySec(id).map(line).join('\n');
  const fires = results.filter((r) => !r.error && (Number(r.values.health) <= 2 || r.ops.some((o) => o.field === 'Comment' && /Refund|Escalation/.test(o.to))));
  const upsells = results.flatMap((r) => (r.error ? [] : r.ops.filter((o) => o.field === 'Comment').flatMap((o) => o.to.split(' · ').filter((x) => /Sold|Upsell sold/.test(x)).map((x) => `${r.name}: ${x}`))));
  const log = results
    .map((r) => (r.error ? `${r.name}: ${r.error}` : [`${r.name}${r.manual ? ' (added by hand)' : ''}`, ...r.ops.map((o) => `  ${o.status === 'written' ? '✓' : o.status === 'failed' ? '✗' : '·'} ${o.field}: ${o.to}${o.status === 'skipped' ? ` (skipped: ${o.note})` : ''}${o.status === 'failed' ? ` (FAILED: ${o.error})` : ''}${o.status === 'preview' ? ' (preview only)' : ''}${o.status === 'warning' ? ` (${o.note})` : ''}`)].join('\n')))
    .join('\n');

  const test = process.env.EOD_TEST_MODE === '1';
  const base = {
    [E.date]: date,
    [E.name]: test ? `TEST · ${csm}` : csm,
    [E.reportPeriod]: 'Daily',
    [E.submissionRef]: reference,
    [E.onboarding]: text('onboarding'),
    [E.prelaunch]: text('prelaunch'),
    [E.launch]: text('launch'),
    [E.checkin]: text('checkin'),
    [E.reachOuts]: [...bySec('comms'), ...bySec('outreach')].map(line).join('\n'),
    [E.fires]: fires.map(line).join('\n'),
    [E.upsells]: upsells.join('\n'),
    [E.actionItems]: results.filter((r) => !r.error && r.values.nextStep).map((r) => `${r.name}: ${r.values.nextStep}${r.values.nextDue ? ` (${r.values.nextDue})` : ''}`).join('\n'),
    [E.obCompleted]: bySec('onboarding').filter((r) => r.values.outcome === 'Onboarded').length,
  };
  const extra = {
    [E_NEW.membersTouched]: [...new Set(results.filter((r) => !r.error).map((r) => r.memberId))],
    [E_NEW.writeLog]: log,
    [E_NEW.timeOnForm]: Math.round(Number(stats.timeOnFormMs || 0) / 1000),
    [E_NEW.quickConfirms]: Number(stats.quickConfirms || 0),
    [E_NEW.aiValuesChanged]: Number(stats.aiValuesChanged || 0),
    [E_NEW.addedByHand]: results.filter((r) => r.manual).length,
  };

  const save = (fields) => (existing ? updateEodRow(existing.id, fields) : createEodRow(fields));
  try {
    const rec = await save({ ...base, ...extra });
    return { status: existing ? 'updated' : 'created', id: rec.id };
  } catch (e) {
    // The new log fields may not exist yet. Keep the summary, and say what was lost.
    if (e instanceof AirtableError && e.type === 'UNKNOWN_FIELD_NAME') {
      try {
        const rec = await save({ ...base, [E.other]: `Write log (new EOD fields missing in Airtable):\n${log}` });
        return { status: existing ? 'updated' : 'created', id: rec.id, warning: 'EOD log fields not in Airtable yet; log saved in "Other Activities Worth Noting"' };
      } catch (e2) {
        return { status: 'failed', error: e2.message };
      }
    }
    return { status: 'failed', error: e.message };
  }
}

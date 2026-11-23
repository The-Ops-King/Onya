import { HEALTH, TODAY, STEPS, gapSteps } from './config';
import { addonWrites } from './addons';

const hLabel = (v) => HEALTH.find((h) => h.v === Number(v))?.label || '';
export const NOT_HELD = ['No-show', 'Rescheduled', 'Cancelled'];
const blank = (v) => v === '' || v == null;

export const callHeld = (sec, values) => sec.id === 'comms' || sec.id === 'outreach' || (!blank(values.outcome) && !NOT_HELD.includes(values.outcome));

// The questions a card shows, given the member's current Airtable data.
export function buildQuestions(sec, touch, values) {
  if (!callHeld(sec, values)) return [];
  const journey = touch.current.journey || {};
  const qs = [];
  for (const a of sec.always) {
    if (a.type === 'sale') {
      // Only asked until the first sale is on record. After that, sales are logged via "+ Flag > Sale made".
      if (!journey.firstSale) qs.push({ key: 'sale', kind: 'sale', q: 'First sale yet?', required: true });
    } else if (a.type === 'ghost') {
      const already = touch.current.lifecycle === 'Ghosting';
      qs.push({ key: 'ghosting', kind: 'yn', q: already ? 'Still ghosting?' : 'Mark as ghosting?', required: true });
    } else if (a.type === 'date') {
      qs.push({ key: a.key, kind: 'date', q: a.q });
    } else if (a.type === 'select') {
      qs.push({ key: a.key, kind: 'select', q: a.q, options: a.options });
    } else {
      qs.push({ key: a.key, kind: 'pitch', q: a.q, resultKey: a.resultKey, mandatory: a.mandatory, required: true });
    }
  }
  const callType = sec.id === 'comms' ? touch.phase : sec.id;
  for (const step of gapSteps(callType, journey)) {
    qs.push({ key: 'gap_' + step, dateKey: 'gapdate_' + step, kind: 'gap', step, q: STEPS[step].q, required: true, note: `Missing in Airtable: ${STEPS[step].field}` });
  }
  return qs;
}

export function missingRequired(sec, touch, values) {
  const miss = [];
  if (sec.id !== 'comms' && blank(values.outcome)) miss.push('Outcome');
  if (sec.id === 'comms' && blank(values.outcome)) miss.push('What happened');
  if (blank(values.health)) miss.push('Health');
  for (const q of buildQuestions(sec, touch, values)) {
    if (!q.required) continue;
    if (blank(values[q.key])) miss.push(q.q);
    else if (q.kind === 'gap' && values[q.key] === 'Yes' && blank(values[q.dateKey])) miss.push(`${q.q} date`);
    else if (q.kind === 'pitch' && values[q.key] === 'Yes' && blank(values[q.resultKey])) miss.push(`${q.q} result`);
    else if (q.kind === 'sale' && values.sale === 'Yes' && blank(values.saleDate)) miss.push('Sale date');
  }
  return miss;
}

export function complianceAlerts(sec, touch, values) {
  return buildQuestions(sec, touch, values)
    .filter((q) => q.mandatory && values[q.key] === 'No')
    .map((q) => q.mandatory);
}

const money = (v) => `$${Number(v || 0).toLocaleString()}`;

// Airtable writes this card produces on submit.
// Principle: only write fields that already exist. Narrative detail (issues, pitch results,
// sale amounts) goes into ONE comment on the Member record, prefixed with the CSM's name.
// Last Contact / touch counts are NOT written: touches are measured elsewhere.
export function computeWrites(sec, touch, values, flags, csm = 'CSM') {
  const cur = touch.current || {};
  const journey = cur.journey || {};
  const w = [];
  const comment = [];
  const up = (field, to, opts = {}) => w.push({ kind: 'update', table: 'Members', field, from: opts.from ?? '', to, ...opts });
  const held = callHeld(sec, values);

  if (sec.callDateField && held) up(sec.callDateField, TODAY, { status: 'exists' });
  if (values.nextStep) up('Next step', values.nextStep, { from: cur.nextStep, status: 'exists' });
  if (values.nextDue) up('Next step due', values.nextDue, { from: cur.nextDue, status: 'exists' });
  if (values.health) up('Health Status', hLabel(values.health), { from: hLabel(cur.health), status: 'options' });
  if (sec.id === 'onboarding' && values.outcome === 'Onboarded') {
    up('Onboarding completed at', TODAY, { status: 'exists' });
    up('Client Stage', '3. Onboarded - not certified', { from: cur.stage, status: 'exists' });
  }
  if (values.outcome) comment.push(`${sec.title.replace(/s$/, '')}: ${values.outcome}`);

  for (const q of buildQuestions(sec, touch, values)) {
    const v = values[q.key];
    if (q.key === 'ghosting' && v === 'Yes' && cur.lifecycle !== 'Ghosting') up('Lifecycle Stage', 'Ghosting', { from: cur.lifecycle, status: 'exists' });
    if (q.key === 'ghosting' && v === 'No' && cur.lifecycle === 'Ghosting') up('Lifecycle Stage', 'Active', { from: 'Ghosting', status: 'exists' });
    if (q.kind === 'pitch' && v) comment.push(`${q.q.replace('?', '')}: ${v}${v === 'Yes' && values[q.resultKey] ? ` (${values[q.resultKey]})` : ''}`);
    if (q.kind === 'date' && v) up('Marketing activated at', v, { status: 'exists' });
    if (q.kind === 'gap' && v === 'Yes') up(STEPS[q.step].field, values[q.dateKey] || '', { status: 'exists', viktor: STEPS[q.step].viktor, note: 'Was empty, filled from EOD' });
    if (q.kind === 'gap' && v && v !== 'Yes') w.push({ kind: 'skip', table: 'Members', field: STEPS[q.step].field, to: v, note: 'Not written; asked again next time' });
    if (q.kind === 'sale' && v === 'Yes') {
      up('First sale closed at', values.saleDate || TODAY, { status: 'exists' });
      comment.push(`First sale ${values.saleDate || TODAY} · job ${money(values.jobValue)} · collected ${money(values.cashCollected)}`);
    }
  }

  for (const x of addonWrites(flags)) {
    if (x.kind === 'comment') comment.push(x.to);
    else w.push(x);
  }

  if (comment.length) w.push({ kind: 'comment', table: 'Members', field: 'Comment', to: `[${csm} EOD ${TODAY}] ` + comment.join(' · '), status: 'exists' });
  return w;
}

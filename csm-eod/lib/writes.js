import { HEALTH, TODAY, STEPS, gapSteps } from './config';

const hLabel = (v) => HEALTH.find((h) => h.v === Number(v))?.label || '';
export const NOT_HELD = ['No-show', 'Rescheduled', 'Cancelled'];
const blank = (v) => v === '' || v == null;

export const callHeld = (sec, values) => sec.id === 'comms' || (!blank(values.outcome) && !NOT_HELD.includes(values.outcome));

// The questions a card shows, given the member's current Airtable data.
export function buildQuestions(sec, touch, values) {
  if (!callHeld(sec, values)) return [];
  const journey = touch.current.journey || {};
  const qs = [];
  for (const a of sec.always) {
    if (a.type === 'sale') {
      qs.push({ key: 'sale', kind: 'sale', q: journey.firstSale ? 'New sale since last call?' : 'First sale yet?', first: !journey.firstSale, required: true });
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

// Airtable writes this card produces on submit.
export function computeWrites(sec, touch, values, flags) {
  const cur = touch.current || {};
  const journey = cur.journey || {};
  const w = [];
  const up = (field, to, opts = {}) => w.push({ kind: 'update', table: 'Members', field, from: opts.from ?? '', to, ...opts });
  const held = callHeld(sec, values);

  up('Last Contact', TODAY, { from: cur.lastContact, status: 'exists', viktor: true });
  if (sec.callDateField && held) up(sec.callDateField, TODAY, { status: sec.callDateField === 'Last check-in date' ? 'new' : 'exists' });
  if (values.nextStep) up('Next step', values.nextStep, { from: cur.nextStep, status: 'exists' });
  if (values.nextDue) up('Next step due', values.nextDue, { from: cur.nextDue, status: 'exists' });
  if (values.issues) up('Current issues', values.issues, { status: 'new' });
  if (values.health) up('Health Status', hLabel(values.health), { from: hLabel(cur.health), status: 'options' });
  if (sec.id === 'onboarding' && values.outcome === 'Onboarded') {
    up('Onboarding completed at', TODAY, { status: 'exists' });
    up('Client Stage', '3. Onboarded - not certified', { from: cur.stage, status: 'exists' });
  }

  for (const q of buildQuestions(sec, touch, values)) {
    const v = values[q.key];
    if (q.kind === 'pitch' && v === 'Yes') {
      const base = q.key === 'aeo' ? 'AEO/SEO' : 'Affirm';
      up(`${base} pitched at`, TODAY, { status: 'new' });
      if (values[q.resultKey]) up(`${base} result`, values[q.resultKey], { status: 'new' });
    }
    if (q.kind === 'date' && v) up('Marketing activated at', v, { status: 'exists' });
    if (q.kind === 'select' && v && v !== 'Not discussed') w.push({ kind: 'update', table: 'Reorder Pipeline', field: 'Reorder Status', to: v, status: 'exists' });
    if (q.kind === 'gap' && v === 'Yes') up(STEPS[q.step].field, values[q.dateKey] || '', { status: 'exists', viktor: STEPS[q.step].viktor, note: 'Was empty — filled from EOD' });
    if (q.kind === 'gap' && v !== 'Yes' && v) w.push({ kind: 'skip', table: 'Members', field: STEPS[q.step].field, to: v, note: 'Logged to EOD only' });
    if (q.kind === 'sale' && v === 'Yes') {
      if (!journey.firstSale) {
        up('First sale closed at', values.saleDate || TODAY, { status: 'exists' });
        if (values.cashCollected) {
          up('First cash collected at', values.saleDate || TODAY, { status: 'new' });
          up('First cash amount', `$${Number(values.cashCollected).toLocaleString()}`, { status: 'new' });
        }
      }
      if (values.saleDate) up('Last sale date', values.saleDate, { status: 'new' });
      if (values.jobValue) up('Last sale job value', `$${Number(values.jobValue).toLocaleString()}`, { status: 'new' });
    }
  }

  if (flags.refund?.on) {
    w.push({ kind: 'create', table: 'Payments, Refunds & Disputes', field: 'New case', to: `Open · ${flags.refund.note || '—'}`, status: 'exists' });
    up('Lifecycle Stage', 'Cancelling', { status: 'exists' });
  }
  if (flags.upsell?.on) w.push({ kind: 'create', table: 'Upsell Table', field: 'New upsell', to: `${flags.upsell.type || 'Other'} · $${Number(flags.upsell.amount || 0).toLocaleString()}`, status: 'exists' });
  if (flags.escalate?.on) w.push({ kind: 'create', table: 'Customer tickets', field: 'New escalation', to: flags.escalate.note || 'Escalation', status: 'exists' });
  return w;
}

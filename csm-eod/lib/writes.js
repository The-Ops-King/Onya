import { HEALTH, TODAY } from './config';

const hLabel = (v) => HEALTH.find((h) => h.v === Number(v))?.label || '';
const NOT_HELD = ['No-show', 'Rescheduled', 'Cancelled'];

export function isVisible(field, values) {
  return !field.showIf || field.showIf(values);
}

// Required fields that are still empty
// If the call didn't happen (no-show / rescheduled), only outcome + health are required.
export function missingRequired(section, values) {
  const held = !NOT_HELD.includes(values.outcome);
  return section.fields
    .filter((f) => f.required && (held || f.key === 'outcome' || f.key === 'health'))
    .filter((f) => isVisible(f, values) && (values[f.key] === '' || values[f.key] == null))
    .map((f) => f.label);
}

// Compliance warnings (mandatory pitches skipped, etc.)
export function complianceAlerts(section, values) {
  const out = [];
  if (NOT_HELD.includes(values.outcome)) return out;
  for (const f of section.fields) if (f.mandatoryYes && values[f.key] === 'No') out.push(f.mandatoryYes);
  return out;
}

// Turn one reviewed card into the Airtable writes it would produce.
export function computeWrites(section, touch, values, flags) {
  const cur = touch.current || {};
  const w = [];
  const up = (field, to, opts = {}) => w.push({ kind: 'update', table: 'Members', field, from: opts.from ?? '', to, ...opts });
  const held = values.outcome && !NOT_HELD.includes(values.outcome);

  up('Last Contact', TODAY, { from: cur.lastContact, status: 'exists', viktor: true });
  if (section.callDateField && held) up(section.callDateField.replace('Members.', ''), TODAY, { status: section.callDateField.includes('Last check-in') ? 'new' : 'exists' });

  if (section.id === 'onboarding' && values.outcome === 'Onboarded') up('Client Stage', '3. Onboarded - not certified', { from: cur.stage, status: 'exists' });
  if (section.id === 'launch' && values.outcome === 'Launched') up('Fulfillment Stage', 'Ongoing Support / Live', { status: 'exists' });

  if (values.nextStep) up('Next step', values.nextStep, { from: cur.nextStep, status: 'exists' });
  if (values.nextDue) up('Next step due', values.nextDue, { from: cur.nextDue, status: 'exists' });
  if (values.issues) up('Current issues', values.issues, { status: 'new' });
  if (values.health) up('Health Status', hLabel(values.health), { from: hLabel(cur.health), status: 'options' });

  if (values.aeo === 'Yes') up('AEO/SEO pitched at', TODAY, { status: 'new' });
  if (values.aeoResult) up('AEO/SEO result', values.aeoResult, { status: 'new' });
  if (values.affirm === 'Yes') up('Affirm pitched at', TODAY, { status: 'new' });
  if (values.affirmResult) up('Affirm result', values.affirmResult, { status: 'new' });
  if (values.launchBooked) up('Launch call date', values.launchBooked, { status: 'exists' });
  if (values.goLive) up('Marketing activated at', values.goLive, { status: 'exists' });

  const delivered = values.productDeliveredDate || values.oilDeliveredDate;
  if (delivered) {
    if (cur.productDelivered) w.push({ kind: 'skip', table: 'Members', field: 'Product delivered at', to: delivered, note: `Already set (${cur.productDelivered}) by Orders sync` });
    else up('Product delivered at', delivered, { status: 'exists', viktor: true, note: 'Fill only if empty' });
  }

  if (values.sale === 'Yes') {
    if (cur.firstSale) {
      w.push({ kind: 'skip', table: 'Members', field: 'First sale closed at', to: values.saleDate, note: `Already has first sale (${cur.firstSale}) — logged to EOD only` });
    } else {
      up('First sale closed at', values.saleDate || TODAY, { status: 'exists', note: 'Empty today → this is their first sale' });
      if (values.cashCollected) up('First cash collected at', values.saleDate || TODAY, { status: 'new' });
      if (values.cashCollected) up('First cash amount', `$${Number(values.cashCollected).toLocaleString()}`, { status: 'new' });
    }
    if (values.saleDate) up('Last sale date', values.saleDate, { status: 'new' });
    if (values.jobValue) up('Last sale job value', `$${Number(values.jobValue).toLocaleString()}`, { status: 'new' });
  }
  if (values.reorder && values.reorder !== 'Not discussed') w.push({ kind: 'update', table: 'Reorder Pipeline', field: 'Reorder Status', to: values.reorder, status: 'exists' });

  if (flags.refund?.on) {
    w.push({ kind: 'create', table: 'Payments, Refunds & Disputes', field: 'New case', to: `Status: Open · CSM note: ${flags.refund.note || '—'}`, status: 'exists' });
    up('Lifecycle Stage', 'Cancelling', { status: 'exists' });
  }
  if (flags.upsell?.on) w.push({ kind: 'create', table: 'Upsell Table', field: 'New upsell', to: `${flags.upsell.type || 'Other'} · $${Number(flags.upsell.amount || 0).toLocaleString()}`, status: 'exists' });
  if (flags.escalate?.on) w.push({ kind: 'create', table: 'Customer tickets', field: 'New escalation', to: flags.escalate.note || 'Escalation', status: 'exists' });

  return w;
}

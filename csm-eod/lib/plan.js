// What a card asks, and what it writes to Airtable.
// Runs in the browser (preview) and on the server (submit). The server always recomputes the plan
// from a fresh read of the member, so the browser can never decide what gets written.

import { STEPS, HEALTH, PHASE_ADVANCE, gapSteps, callTypeFor, healthOf } from './config';
import { F, LIFECYCLE } from './schema';
import { addonLines } from './addons';

export const NOT_HELD = ['No-show', 'Rescheduled', 'Cancelled'];
const blank = (v) => v === '' || v == null;
const money = (v) => `$${Number(v || 0).toLocaleString()}`;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

export const callHeld = (sec, values) => sec.id === 'comms' || sec.id === 'outreach' || (!blank(values.outcome) && !NOT_HELD.includes(values.outcome));

// The questions a card shows, given the member's current Airtable data.
export function buildQuestions(sec, member, values) {
  if (!callHeld(sec, values)) return [];
  const journey = member.journey || {};
  const qs = [];
  for (const a of sec.always) {
    if (a.type === 'sale') {
      // Only asked until a first sale is on record. After that, sales go through "+ Add > Sale made".
      if (!journey.firstSale) qs.push({ key: 'sale', kind: 'sale', q: 'First sale yet?', required: true });
    } else if (a.type === 'ghost') {
      const already = member.lifecycle === LIFECYCLE.ghosting;
      qs.push({ key: 'ghosting', kind: 'yn', q: already ? 'Still ghosting?' : 'Mark as ghosting?', required: true });
    } else if (a.type === 'date') {
      qs.push({ key: a.key, kind: 'date', q: a.q });
    } else {
      qs.push({ key: a.key, kind: 'pitch', q: a.q, resultKey: a.resultKey, amountKey: a.key + 'Amount', mandatory: a.mandatory, required: true });
    }
  }
  const callType = sec.id === 'comms' || sec.id === 'outreach' ? callTypeFor(member) : sec.id;
  if (sec.id !== 'outreach') {
    for (const step of gapSteps(callType, journey)) {
      qs.push({ key: 'gap_' + step, dateKey: 'gapdate_' + step, kind: 'gap', step, q: STEPS[step].q, required: true });
    }
  }
  return qs;
}

export function missingRequired(sec, member, values) {
  const miss = [];
  if (blank(values.outcome)) miss.push(sec.id === 'comms' ? 'What happened' : 'Outcome');
  if (blank(values.health)) miss.push('DEFCON');
  for (const q of buildQuestions(sec, member, values)) {
    if (!q.required) continue;
    if (blank(values[q.key])) miss.push(q.q);
    else if (q.kind === 'gap' && values[q.key] === 'Yes' && !isDate(values[q.dateKey])) miss.push(`${q.q} date`);
    else if (q.kind === 'pitch' && values[q.key] === 'Yes' && blank(values[q.resultKey])) miss.push(`${q.q} result`);
    else if (q.kind === 'sale' && values.sale === 'Yes' && !isDate(values.saleDate)) miss.push('Sale date');
  }
  return miss;
}

export const complianceAlerts = (sec, member, values) =>
  buildQuestions(sec, member, values).filter((q) => q.mandatory && values[q.key] === 'No').map((q) => q.mandatory);

// Plan for one card.
//   updates: [{ id, field, from, to }]          Members fields to write (by field ID)
//   skips:   [{ field, to, reason }]            things deliberately not written
//   lines:   ['...']                            the comment body (without the prefix)
export function planCard(sec, member, values, flags, { csm, date }) {
  const updates = [];
  const skips = [];
  const lines = [];
  const up = (id, field, to, from) => {
    if (String(from ?? '') === String(to ?? '')) return;
    updates.push({ id, field, from: from ?? '', to });
  };
  const held = callHeld(sec, values);
  const journey = member.journey || {};

  // Core
  if (!blank(values.nextStep)) up(F.nextStep, 'Next step', values.nextStep.trim(), member.nextStep);
  if (isDate(values.nextDue)) up(F.nextDue, 'Next step due', values.nextDue, member.nextDue);
  const h = healthOf(values.health);
  if (h) up(F.defcon, 'Health (DEFCON)', h.option, member.defconOption);

  // Client Phase: one step forward, only from the phase this call belongs to.
  const adv = PHASE_ADVANCE[sec.id];
  if (adv && values.outcome === adv.outcome) {
    if (member.phase === adv.from) up(F.clientPhase, 'Client Phase - Working Towards', adv.to, member.phase);
    else skips.push({ field: 'Client Phase - Working Towards', to: adv.to, reason: member.phase ? `member is on "${member.phase}", not "${adv.from}"` : 'phase is blank, set it by hand' });
  }

  // Onboarding held → Onboarding completed at (only if empty)
  if (sec.id === 'onboarding' && values.outcome === 'Onboarded') {
    if (!journey.onboarded) up(F.onboardedAt, STEPS.onboarded.field, date, '');
    else skips.push({ field: STEPS.onboarded.field, to: date, reason: `already set (${journey.onboarded})` });
  }

  if (!blank(values.outcome)) lines.push(`${sec.label}: ${values.outcome}`);

  for (const q of buildQuestions(sec, member, values)) {
    const v = values[q.key];
    if (q.key === 'ghosting') {
      if (v === 'Yes' && member.lifecycle !== LIFECYCLE.ghosting) up(F.lifecycleStatus, 'Lifecycle Status', LIFECYCLE.ghosting, member.lifecycle);
      if (v === 'No' && member.lifecycle === LIFECYCLE.ghosting) up(F.lifecycleStatus, 'Lifecycle Status', LIFECYCLE.active, member.lifecycle);
      if (v) lines.push(`Ghosting: ${v}`);
    }
    if (q.kind === 'pitch' && v) {
      const res = v === 'Yes' && values[q.resultKey] ? ` (${values[q.resultKey]}${values[q.resultKey] === 'Sold' && values[q.amountKey] ? `, ${money(values[q.amountKey])}` : ''})` : '';
      lines.push(`${q.q.replace('?', '')}: ${v}${res}`);
    }
    if (q.kind === 'date' && isDate(v)) lines.push(`${q.q}: ${v}`);
    if (q.kind === 'gap' && v === 'Yes' && isDate(values[q.dateKey])) up(STEPS[q.step].id, STEPS[q.step].field, values[q.dateKey], '');
    if (q.kind === 'gap' && v && v !== 'Yes') skips.push({ field: STEPS[q.step].field, to: v, reason: 'answered ' + v + ', asked again next time' });
    if (q.kind === 'sale' && v === 'Yes' && isDate(values.saleDate)) {
      up(F.firstSaleAt, STEPS.firstSale.field, values.saleDate, '');
      lines.push(`First sale ${values.saleDate} · job ${money(values.jobValue)} · collected ${money(values.cashCollected)}`);
    }
  }

  lines.push(...addonLines(flags));

  const comment = lines.length ? `[${csm} EOD ${date}] ` + lines.join(' · ') : '';
  return { updates, skips, comment };
}

export { HEALTH };

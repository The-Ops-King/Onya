import { TODAY } from './config';

// Touch rule: 3 touches per week, never more than 3 days between touches.
export const TOUCH_RULE = { perWeek: 3, maxGapDays: 3 };

const day = (d) => new Date(d + 'T12:00:00');
export const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);

// Workdays (Mon–Fri) left in the week after today. Week = Mon–Sun.
function workdaysLeftAfterToday() {
  const dow = day(TODAY).getDay(); // 0 Sun … 6 Sat
  return dow >= 1 && dow <= 5 ? 5 - dow : 0;
}

// Status for an assigned member NOT touched today.
export function touchStatus(current) {
  const since = current.lastContact ? daysBetween(current.lastContact, TODAY) : null;
  const week = current.touchesWeek ?? 0;
  const needed = Math.max(0, TOUCH_RULE.perWeek - week);
  const reasons = [];
  let level = 0; // 0 ok · 1 due soon · 2 due today · 3 overdue

  if (since == null) {
    reasons.push('No contact on record');
    level = 3;
  } else if (since > TOUCH_RULE.maxGapDays) {
    reasons.push(`${since} days since contact (max ${TOUCH_RULE.maxGapDays})`);
    level = 3;
  } else if (since === TOUCH_RULE.maxGapDays) {
    reasons.push(`${since} days since contact: touch today`);
    level = 2;
  } else if (since === TOUCH_RULE.maxGapDays - 1) {
    reasons.push(`${since} days since contact: due tomorrow`);
    level = 1;
  }

  // Weekly pace: can they still hit 3 this week if not touched today?
  if (needed > workdaysLeftAfterToday()) {
    reasons.push(`${week}/${TOUCH_RULE.perWeek} touches this week, can't hit ${TOUCH_RULE.perWeek} without one today`);
    level = Math.max(level, 2);
  }

  if (current.nextDue && current.nextDue < TODAY) {
    reasons.push(`Next step overdue ${daysBetween(current.nextDue, TODAY)}d: ${current.nextStep || '—'}`);
    level = Math.max(level, 2);
  }
  if (current.health >= 4) {
    reasons.push('Health At Risk or worse');
    level = Math.max(level, 2);
  }
  return { level, reasons, since, week };
}

export function needsAttention(roster, csm, touchedIds) {
  return roster
    .filter((m) => m.csm === csm && !touchedIds.has(m.id))
    .map((m) => ({ ...m, status: touchStatus(m.current) }))
    .filter((m) => m.status.level > 0)
    .sort((a, b) => b.status.level - a.status.level || (b.status.since ?? 99) - (a.status.since ?? 99));
}

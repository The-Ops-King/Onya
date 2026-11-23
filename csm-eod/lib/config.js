// CSM EOD configuration.
//
// Card model (same layout for every call type):
//   header: name · health (prefilled)        → Members.Health Status
//   core:   outcome · next step · due        → Members.Next step / Next step due
//   questions:
//     - "always" questions for that call type (pitches, sale) — asked every time
//     - "gap" questions: journey steps the member SHOULD have reached by this call
//       but that have no date in Airtable. If the date exists, the question is hidden.
//   issues + flags: optional, behind "+" buttons

export const TODAY = '2026-11-23';

export const HEALTH = [
  { v: 1, label: 'Healthy', color: '#1f9d55' },
  { v: 2, label: 'Needs Attention', color: '#8bb31d' },
  { v: 3, label: 'Not Thrilled', color: '#d9a400' },
  { v: 4, label: 'At Risk', color: '#e0701b' },
  { v: 5, label: 'Red Alert', color: '#d0312d' },
];

export const CSMS = ['Tristan', 'Jack', 'James', 'Alejandro', 'Laurence', 'Josh', 'Joe', 'Jedd'];

// The 9 journey steps already tracked on Members (dates).
export const STEPS = {
  onboarded: { label: 'Onboarded', q: 'Onboarding completed?', field: 'Onboarding completed at' },
  certified: { label: 'Certified', q: 'Certified?', field: 'Certification verified at' },
  oilDelivered: { label: 'Oil delivered', q: 'Oil delivered?', field: 'Product delivered at', viktor: true },
  marketingLive: { label: 'Marketing live', q: 'Marketing live?', field: 'Marketing activated at' },
  firstLead: { label: 'First lead', q: 'Received first lead?', field: 'First lead delivered at' },
  firstApptBooked: { label: 'First appointment booked', q: 'First appointment booked?', field: 'First appointment booked at' },
  firstApptHeld: { label: 'First appointment held', q: 'First appointment held?', field: 'First appointment held at' },
  firstSale: { label: 'First sale', q: 'First sale?', field: 'First sale closed at' },
  allLeads: { label: 'All leads delivered', q: 'All leads delivered?', field: 'Fulfillment completed at' },
};

// Standard gap map: steps expected to be done by the time this call happens.
export const EXPECTED = {
  onboarding: [],
  prelaunch: ['onboarded', 'certified'],
  launch: ['onboarded', 'certified', 'oilDelivered'],
  checkin: ['onboarded', 'certified', 'oilDelivered', 'marketingLive', 'firstLead'],
};
// Check-in: once a first lead exists, appointments become expected too.
export function expectedSteps(callType, journey = {}) {
  const base = [...(EXPECTED[callType] || [])];
  if (callType === 'checkin' && journey.firstLead) base.push('firstApptBooked');
  if (callType === 'checkin' && journey.firstApptBooked) base.push('firstApptHeld');
  return base;
}
export function gapSteps(callType, journey = {}) {
  return expectedSteps(callType, journey).filter((k) => !journey[k]);
}

export const SECTIONS = [
  {
    id: 'onboarding',
    title: 'Onboarding calls',
    source: 'Fathom + GHL "Onboarding" calendar',
    callDateField: 'Onboarding call date',
    outcomes: ['Onboarded', 'Partially onboarded', 'No-show', 'Rescheduled', 'Cancelled'],
    always: [{ key: 'aeo', q: 'Pitched SEO / AEO?', resultKey: 'aeoResult', mandatory: 'SEO/AEO pitch is mandatory on onboarding calls' }],
  },
  {
    id: 'prelaunch',
    title: 'Pre-launch calls',
    source: 'Fathom + GHL "Pre-launch" calendar',
    callDateField: 'Pre-launch call date',
    outcomes: ['Completed', 'No-show', 'Rescheduled'],
    always: [],
  },
  {
    id: 'launch',
    title: 'Launch calls',
    source: 'Fathom + GHL "Launch" calendar',
    callDateField: 'Launch call date',
    outcomes: ['Launched', 'Launch pending – blocker', 'No-show', 'Rescheduled'],
    always: [
      { key: 'affirm', q: 'Pitched Affirm?', resultKey: 'affirmResult', mandatory: 'Affirm pitch is mandatory on launch calls' },
      { key: 'goLive', q: 'Marketing go-live date', type: 'date' },
    ],
  },
  {
    id: 'checkin',
    title: 'Check-in calls',
    source: 'Fathom + GHL "Check-in" calendar',
    callDateField: null, // covered by Last Contact (measured elsewhere)
    outcomes: ['Completed', 'No-show', 'Rescheduled'],
    always: [{ key: 'sale', q: 'sale', type: 'sale' }], // everything else is optional via "+ Add"
  },
  {
    id: 'comms',
    title: 'Texts / phone calls',
    source: 'GHL conversations',
    callDateField: null,
    outcomes: null, // free text
    always: [{ key: 'sale', q: 'sale', type: 'sale' }],
  },
  {
    id: 'outreach',
    title: 'Reached out, no response',
    source: 'GHL outbound texts / calls with no reply',
    callDateField: null,
    outcomes: ['No response', 'Left voicemail', 'Bad contact info'],
    always: [{ key: 'ghosting', type: 'ghost' }],
  },
];

export const PITCH_RESULTS = ['Sold', 'Interested – follow up', 'Not interested'];


// "What data we need" tab.
// [Data point, Source, Where it goes, Status, Notes]  status: exists | options | comment | eod | supabase
export const DATA_MAP = [
  ['Who a CSM talked to today', 'GHL webhooks (SMS, calls, calendar) + Fathom webhook', 'Touch store', 'supabase', 'One row per call/text/recording, matched to a Member. Too much volume for Airtable.'],
  ['CSM ↔ GHL user ↔ Fathom email', 'Setup', 'CSM directory', 'supabase', 'CSM name, GHL user ID, Fathom email, Slack ID, time zone.'],
  ['Call type', 'GHL calendar (one per type) or meeting title', '—', 'exists', 'One calendar per type is safer than a naming rule.'],
  ['Member match', 'HighLevel Contact ID, Email, Secondary Contact Email', 'Members', 'exists', 'Unmatched touches go to a review bucket; CSM can also "+ Add a client".'],
  ['Next step / due', 'AI from call or text', 'Members.Next step, Next step due', 'exists', ''],
  ['Health (1 Healthy → 5 Red Alert)', 'AI suggestion, CSM confirms', 'Members.Health Status', 'options', 'Add options: Not Thrilled, Red Alert. Check Standup formulas first. Confirm Health Status vs Health Status 2.'],
  ['Journey step dates (gap questions)', 'Airtable; CSM fills blanks', 'Members: Onboarding completed at … Fulfillment completed at', 'exists', 'Only written when empty.'],
  ['Call dates', 'Calendar event', 'Members: Onboarding / Pre-launch / Launch call date', 'exists', ''],
  ['First sale', 'Call / text / CSM', 'Members.First sale closed at', 'exists', 'Only asked until one is on record.'],
  ['Ghosting', 'GHL outbound with no reply', 'Members.Lifecycle Stage = Ghosting', 'exists', ''],
  ['Issues, pitch results, sale amounts, case studies', 'Call / text / CSM', 'One comment on the Member record', 'comment', 'Format: [CSM EOD date] item · item. Parseable later if the KPI switches to first cash.'],
  ['Refund / cancel, upsell, reorder, oil return, tickets', 'Call / text / CSM', 'Same path the portal forms / ticket system use', 'exists', 'Do NOT write the Airtable tables directly: Customer tickets is a mirror, and portal forms trigger Viktor checks.'],
  ['Daily EOD record', 'This form', 'EOD Check-ins (existing table)', 'eod', 'Add: Members touched (link), Time on form, Quick confirms, AI values changed, Added by hand. Summary goes in the existing section fields.'],
  ['Last Contact / touches this week', 'Measured elsewhere', 'Members.Last Contact, Touch days this week', 'exists', 'Read only. Drives "Needs attention".'],
];

export const OPEN_QUESTIONS = [
  'Viktor: which Members fields does it write? EOD writes to those need "only if empty" or a skip. (Ask whoever set up Viktor.)',
  'Tickets: where are Customer tickets actually created (Zendesk? portal?) so the EOD creates real ones, not Airtable mirror rows.',
  'Portal forms: can the EOD submit through the portal’s Upsell / Reorder / Oil Return / Refund endpoints so Viktor’s checks still run? (Ali)',
  'Call types: one GHL calendar per type vs. naming convention in titles.',
];

// Decided
export const DECISIONS = [
  'Prefill runs as each call / text happens (webhooks), so the form is ready when opened.',
  'Access: name-picker link behind one shared passcode, checked server-side (env var, never in code).',
  'KPI stays first close for now. Cash collected is captured in the comment in case that changes.',
  'Touch rule uses calendar days. EOD does not write Last Contact or Touch days this week (measured elsewhere).',
  'Gap question answered "Not sure": ask again next time.',
  'First sale is only asked until one is on record; later sales are an optional add-on.',
  'Minimal Airtable: 2 Health Status options + 5 fields on EOD Check-ins. Issues, pitch results and sale amounts go in a record comment.',
];

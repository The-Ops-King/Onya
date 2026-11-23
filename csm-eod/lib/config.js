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
    callDateField: 'Last check-in date',
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
export const DATA_MAP = [
  ['Which members a CSM touched today', 'GHL conversations + calendar events, Fathom recordings', '—', 'new', 'Touch store (Supabase/Railway): one row per call/SMS/recording, matched to a Member.'],
  ['Call type', 'GHL calendar (one per type) or meeting title', '—', 'new', 'One calendar per type is safer than a naming rule.'],
  ['Member ↔ GHL / Fathom match', 'HighLevel Contact ID, Email, Secondary Contact Email', 'Members', 'exists', 'Fathom invitee emails must match Members email fields. Unmatched go to a review bucket.'],
  ['CSM ↔ GHL user ↔ Fathom recorder', 'Mapping', 'CSM directory (new)', 'new', 'CSM name, GHL user ID, Fathom email, Slack ID, timezone.'],
  ['Journey step dates (9 steps)', 'Airtable today; gap questions fill blanks', 'Members: Onboarding completed at … Fulfillment completed at', 'exists', 'Drives which questions appear. Missing expected dates become questions.'],
  ['Outcome / next step / due', 'AI from transcript or SMS', 'Members.Next step, Next step due', 'exists', ''],
  ['Issues', 'AI from transcript or SMS', 'Members.Current issues', 'new', ''],
  ['Health (1 Healthy → 5 Red Alert)', 'AI suggestion, CSM confirms', 'Members.Health Status', 'options', 'Replace options with the 5 levels.'],
  ['Call dates', 'Calendar event', 'Members: Onboarding / Pre-launch / Launch call date', 'exists', ''],
  ['Last check-in date', 'Calendar event', 'Members.Last check-in date', 'new', ''],
  ['Last contact', 'Latest touch of any kind', 'Members.Last Contact', 'exists', 'Check what currently writes it.'],
  ['SEO/AEO pitched + result', 'Transcript', 'Members.AEO/SEO pitched at, AEO/SEO result', 'new', 'Asked on every onboarding call.'],
  ['Affirm pitched + result', 'Transcript', 'Members.Affirm pitched at, Affirm result', 'new', 'Asked on every launch call.'],
  ['First sale', 'Transcript / SMS / CSM', 'Members.First sale closed at', 'exists', 'Only written if empty.'],
  ['Sale value + cash collected', 'Transcript / SMS / CSM', 'Members.Last sale date, Last sale job value, First cash collected at, First cash amount', 'new', 'Supports either KPI until decided.'],
  ['Refund / cancel request', 'Transcript / SMS', 'Payments, Refunds & Disputes (row) + Lifecycle Stage', 'exists', ''],
  ['Upsell sold', 'Transcript', 'Upsell Table (row)', 'exists', ''],
  ['Reorder status', 'Transcript', 'Reorder Pipeline.Reorder Status', 'exists', ''],
  ['Touch rule (3/week, max 3 calendar days apart)', 'Measured outside the EOD', 'Members.Last Contact, Touch days this week', 'exists', 'Read-only for the EOD. Drives "Needs attention".'],
  ['Outreach with no reply (ghosting)', 'GHL outbound SMS/calls with no inbound reply', 'Members.Lifecycle Stage = Ghosting', 'exists', 'Attempts + last reply date come from GHL. CSM confirms before Lifecycle flips to Ghosting.'],
  ['EOD submission log', 'This form', 'EOD log (one row per CSM per day)', 'new', 'Summary, members touched, counts, submitted at.'],
];

export const OPEN_QUESTIONS = [
  'Prefill timing: process each call/text as it happens (recommended) vs. at form load vs. every 30 min.',
  'Access: name-picker link is open to anyone with the URL. Shared passcode?',
  'KPI: "first sale" vs "first cash collected". Form captures both, so this only decides the dashboard number.',
  'Viktor: which Members fields does it overwrite? EOD writes to those need "only if empty" or a skip.',
  'Last Contact: touches are measured elsewhere. Should the EOD stop writing Last Contact too?',
  'Call types: one GHL calendar per type vs. naming convention in titles.',
  'Upsells: does the EOD replace the portal Upsell form for CSM-sold upsells?',
];

// Decided
export const DECISIONS = [
  'Touch rule uses calendar days.',
  'EOD submissions do not count toward Touch days this week (measured elsewhere).',
  'Gap question answered "Not sure": ask again next time.',
  'First sale is only asked until one is on record; later sales are an optional add-on.',
];

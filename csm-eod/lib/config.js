// Field + section definitions for the CSM EOD.
// `at` = Airtable target ("Table.Field"). `status`: exists | new | options (field exists, options change).
// `viktor`: field is also written by a Viktor/automation sync — needs an overwrite check before go-live.

export const TODAY = '2026-11-23';

export const HEALTH = [
  { v: 1, label: 'Healthy', color: '#1f9d55' },
  { v: 2, label: 'Needs Attention', color: '#8bb31d' },
  { v: 3, label: 'Not Thrilled', color: '#d9a400' },
  { v: 4, label: 'At Risk', color: '#e0701b' },
  { v: 5, label: 'Red Alert', color: '#d0312d' },
];

export const CSMS = ['Tristan', 'Jack', 'James', 'Alejandro', 'Laurence', 'Josh', 'Joe', 'Jedd'];

const YN = ['Yes', 'No'];

// Shared fields used across sections
const nextStep = { key: 'nextStep', label: 'Next step', type: 'text', at: 'Members.Next step', status: 'exists', wide: true };
const nextDue = { key: 'nextDue', label: 'Next step due', type: 'date', at: 'Members.Next step due', status: 'exists' };
const issues = { key: 'issues', label: 'Issues / concerns', type: 'textarea', at: 'Members.Current issues', status: 'new', wide: true };
const health = { key: 'health', label: 'Health', type: 'health', at: 'Members.Health Status', status: 'options', required: true, wide: true };

export const SECTIONS = [
  {
    id: 'onboarding',
    title: 'Onboarding calls',
    source: 'Fathom recording + GHL calendar "Onboarding"',
    callDateField: 'Members.Onboarding call date',
    fields: [
      { key: 'outcome', label: 'Outcome', type: 'select', required: true, options: ['Onboarded', 'Partially onboarded', 'No-show', 'Rescheduled', 'Cancelled'], at: 'Members.Client Stage', status: 'exists', note: 'Onboarded → stage "3. Onboarded - not certified"' },
      nextStep, nextDue,
      { key: 'aeo', label: 'Pitched SEO / AEO?', type: 'yesno', required: true, options: YN, at: 'Members.AEO/SEO pitched at', status: 'new', mandatoryYes: 'AEO/SEO pitch is mandatory on onboarding calls' },
      { key: 'aeoResult', label: 'SEO / AEO result', type: 'select', options: ['Sold', 'Interested – follow up', 'Not interested'], showIf: (v) => v.aeo === 'Yes', at: 'Members.AEO/SEO result', status: 'new', note: 'Sold → also creates Upsell Table row' },
      issues, health,
    ],
  },
  {
    id: 'prelaunch',
    title: 'Pre-launch calls',
    source: 'Fathom recording + GHL calendar "Pre-launch"',
    callDateField: 'Members.Pre-launch call date',
    fields: [
      { key: 'outcome', label: 'Outcome', type: 'select', required: true, options: ['Completed', 'No-show', 'Rescheduled'], at: null },
      { key: 'productDelivered', label: 'Product delivered?', type: 'yesno', options: YN, at: 'Members.Product delivered at', status: 'exists', viktor: true },
      { key: 'productDeliveredDate', label: 'Delivered on', type: 'date', showIf: (v) => v.productDelivered === 'Yes', at: 'Members.Product delivered at', status: 'exists', viktor: true },
      { key: 'launchBooked', label: 'Launch call booked for', type: 'date', at: 'Members.Launch call date', status: 'exists' },
      nextStep, nextDue, issues, health,
    ],
  },
  {
    id: 'launch',
    title: 'Launch calls',
    source: 'Fathom recording + GHL calendar "Launch"',
    callDateField: 'Members.Launch call date',
    fields: [
      { key: 'outcome', label: 'Outcome', type: 'select', required: true, options: ['Launched', 'Launch pending – blocker', 'No-show', 'Rescheduled'], at: 'Members.Fulfillment Stage', status: 'exists' },
      { key: 'oilDelivered', label: 'Oil delivered?', type: 'yesno', options: YN, at: 'Members.Product delivered at', status: 'exists', viktor: true },
      { key: 'oilDeliveredDate', label: 'Oil delivered on', type: 'date', showIf: (v) => v.oilDelivered === 'Yes', at: 'Members.Product delivered at', status: 'exists', viktor: true },
      { key: 'affirm', label: 'Pitched Affirm?', type: 'yesno', required: true, options: YN, at: 'Members.Affirm pitched at', status: 'new', mandatoryYes: 'Affirm pitch is mandatory on launch calls' },
      { key: 'affirmResult', label: 'Affirm result', type: 'select', options: ['Sold', 'Interested – follow up', 'Not interested'], showIf: (v) => v.affirm === 'Yes', at: 'Members.Affirm result', status: 'new', note: 'Sold → also creates Upsell Table row (Financing)' },
      { key: 'goLive', label: 'Marketing go-live', type: 'date', at: 'Members.Marketing activated at', status: 'exists' },
      nextStep, nextDue, issues, health,
    ],
  },
  {
    id: 'checkin',
    title: 'Check-in calls',
    source: 'Fathom recording + GHL calendar "Check-in"',
    callDateField: 'Members.Last check-in date',
    fields: [
      { key: 'outcome', label: 'Outcome', type: 'select', required: true, options: ['Completed', 'No-show', 'Rescheduled'], at: null },
      { key: 'sale', label: 'Client made a sale?', type: 'yesno', required: true, options: YN, at: 'Members.First sale closed at', status: 'exists', note: 'Only fills "First sale closed at" if empty' },
      { key: 'saleDate', label: 'Sale date', type: 'date', showIf: (v) => v.sale === 'Yes', at: 'Members.Last sale date', status: 'new' },
      { key: 'jobValue', label: 'Job value $', type: 'money', showIf: (v) => v.sale === 'Yes', at: 'Members.Last sale job value', status: 'new' },
      { key: 'cashCollected', label: 'Cash collected $', type: 'money', showIf: (v) => v.sale === 'Yes', at: 'Members.First cash collected at', status: 'new', note: 'Deposit or full — decides the "first cash" KPI' },
      { key: 'reorder', label: 'Reorder', type: 'select', options: ['Not discussed', 'Pitched', 'Committed', 'Not now'], at: 'Reorder Pipeline.Reorder Status', status: 'exists' },
      nextStep, nextDue, issues, health,
    ],
  },
  {
    id: 'comms',
    title: 'Texts / phone calls',
    source: 'GHL conversations (SMS + call logs)',
    callDateField: null,
    fields: [
      { key: 'outcome', label: 'What happened', type: 'text', required: true, at: null, wide: true },
      { key: 'sale', label: 'Sale made?', type: 'yesno', options: YN, at: 'Members.First sale closed at', status: 'exists', note: 'Only fills "First sale closed at" if empty' },
      { key: 'saleDate', label: 'Sale date', type: 'date', showIf: (v) => v.sale === 'Yes', at: 'Members.Last sale date', status: 'new' },
      { key: 'jobValue', label: 'Job value $', type: 'money', showIf: (v) => v.sale === 'Yes', at: 'Members.Last sale job value', status: 'new' },
      { key: 'cashCollected', label: 'Cash collected $', type: 'money', showIf: (v) => v.sale === 'Yes', at: 'Members.First cash collected at', status: 'new' },
      nextStep, nextDue, health,
    ],
  },
];

// Flags available on every card (toggle chips). Each creates a row in another table.
export const FLAGS = [
  { key: 'refund', label: 'Refund / cancel request', at: 'Payments, Refunds & Disputes (new row) + Lifecycle → Cancelling', status: 'exists' },
  { key: 'upsell', label: 'Upsell sold', at: 'Upsell Table (new row)', status: 'exists' },
  { key: 'escalate', label: 'Needs escalation', at: 'Customer tickets (new) / EOD log', status: 'exists' },
  { key: 'caseStudy', label: 'Case study / testimonial', at: 'EOD log (KPI: 2/week)', status: 'new' },
];

// "What data we need" map for the second tab.
export const DATA_MAP = [
  // [Data point, Source, Airtable target, Status, Notes]
  ['Which members a CSM touched today', 'GHL conversations + calendar events, Fathom recordings', '—', 'new', 'Needs a touch store (Supabase/Railway): one row per inbound/outbound event, matched to a Member.'],
  ['Call type (onboarding / pre-launch / launch / check-in)', 'GHL calendar name or meeting title', '—', 'new', 'Standardize titles: "Onboarding – {Name}", "Launch – {Name}"… or one GHL calendar per type (preferred: can’t be mistyped).'],
  ['Member ↔ GHL / Fathom match', 'HighLevel Contact ID, Email, Secondary Contact Email', 'Members.HighLevel Contact ID / Email', 'exists', 'Fathom invitee emails must match Members.Email or Secondary Contact Email. Mismatches go to a "unmatched" bucket.'],
  ['CSM ↔ GHL user ↔ Fathom recorder', 'Mapping table', 'CSM directory (new)', 'new', 'CSM name, GHL user ID, Fathom email, Slack ID, timezone.'],
  ['Outcome / next step / issues', 'AI extraction from Fathom transcript or SMS thread', 'Members.Next step, Next step due, Current issues', 'exists', '"Current issues" is new. Next step fields exist.'],
  ['Health (1 Healthy → 5 Red Alert)', 'CSM choice, AI suggestion', 'Members.Health Status', 'options', 'Replace options: Healthy / Needs Attention / Not Thrilled / At Risk / Red Alert.'],
  ['Onboarding call date', 'Calendar event', 'Members.Onboarding call date', 'exists', ''],
  ['Pre-launch call date', 'Calendar event', 'Members.Pre-launch call date', 'exists', ''],
  ['Launch call date', 'Calendar event', 'Members.Launch call date', 'exists', ''],
  ['Last check-in date', 'Calendar event', 'Members.Last check-in date', 'new', ''],
  ['Last contact', 'Latest touch of any kind', 'Members.Last Contact', 'exists', 'Check what currently writes it (Last touch source).'],
  ['SEO/AEO pitched + result', 'Transcript', 'Members.AEO/SEO pitched at, AEO/SEO result', 'new', 'Mandatory on onboarding calls — EOD flags misses.'],
  ['Affirm pitched + result', 'Transcript', 'Members.Affirm pitched at, Affirm result', 'new', 'Mandatory on launch calls — EOD flags misses.'],
  ['Oil delivered + date', 'Orders table / CSM confirm', 'Members.Product delivered at', 'exists', 'Synced from Orders — EOD should only fill when empty.'],
  ['First sale', 'Transcript / SMS / CSM', 'Members.First sale closed at', 'exists', 'Only written if empty. Redundant capture for the 22 missing sales.'],
  ['Sale job value + cash collected', 'Transcript / SMS / CSM', 'Members.Last sale job value, First cash collected at, First cash amount', 'new', 'Supports either KPI (first sale vs first cash) until decided.'],
  ['Refund / cancel request', 'Transcript / SMS', 'Payments, Refunds & Disputes (row) + Lifecycle Stage', 'exists', 'Creates an Open case. Lifecycle → Cancelling.'],
  ['Upsell sold', 'Transcript', 'Upsell Table (row)', 'exists', 'Replaces the separate portal Upsell form for CSM-sold upsells? (decide)'],
  ['Reorder status', 'Transcript', 'Reorder Pipeline.Reorder Status', 'exists', ''],
  ['EOD submission log', 'This form', 'EOD log (one row per CSM per day)', 'new', 'Summary, members touched, counts, submitted at. Audit + compliance.'],
];

export const OPEN_QUESTIONS = [
  'Prefill timing: event-driven (webhooks as touches happen) vs. at form load vs. every 30 min.',
  'Access: name-picker link is open to anyone with the URL. Shared passcode at minimum?',
  'KPI: "first sale" vs "first cash collected" — form captures both until decided.',
  'Viktor: which Members fields does it overwrite nightly? EOD writes to those fields need "only if empty" or a hand-off.',
  'Call types: one GHL calendar per type vs. naming convention in titles.',
  'Upsells: does the EOD replace the portal Upsell form for CSM-sold upsells, or just reference it?',
  'Untouched members: thresholds for "needs attention" (days since contact, overdue next step, health ≥ 3).',
];

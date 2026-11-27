// CSM EOD configuration (shared by the browser and the server).
//
// Card model (same layout for every call type):
//   header: name · DEFCON                     → Members.Health (DEFCON)
//   core:   outcome · next step · due         → Members.Next step / Next step due
//   questions:
//     - "always" questions for that call type (pitches, sale), asked every time
//     - "gap" questions: journey steps the member SHOULD have reached by this call
//       but that have no date in Airtable. If the date exists, the question is hidden.
//   add-ons: optional, behind "+ Add"

import { F, CLIENT_PHASE, DEFCON_OPTION } from './schema';

// DEFCON: 5 = fully on track … 1 = leaving now. Definitions from Tyler, 2026-11-27.
export const HEALTH = [
  { v: 5, label: 'Thriving', option: DEFCON_OPTION[5], color: '#1f9d55', help: 'Fully on track.' },
  { v: 4, label: 'Healthy', option: DEFCON_OPTION[4], color: '#8bb31d', help: 'Generally healthy. Maybe missing one or two non-blocking things.' },
  { v: 3, label: 'Watch', option: DEFCON_OPTION[3], color: '#d9a400', help: 'Missed a call, or behind on a few things.' },
  { v: 2, label: 'At Risk', option: DEFCON_OPTION[2], color: '#e0701b', help: 'Not communicating, ghosting, unhappy about something, or behind on multiple things.' },
  { v: 1, label: 'Critical', option: DEFCON_OPTION[1], color: '#d0312d', help: 'Leaving-now signals: cancel or refund request, chargeback, lawyer.' },
];
export const healthOf = (v) => HEALTH.find((h) => h.v === Number(v));
export const defconFromOption = (opt) => HEALTH.find((h) => h.option === opt)?.v ?? null;

// The 9 journey steps already tracked on Members (dates).
export const STEPS = {
  onboarded: { label: 'Onboarded', q: 'Onboarding completed?', field: 'Onboarding completed at', id: F.onboardedAt },
  certified: { label: 'Certified', q: 'Certified?', field: 'Certification verified at', id: F.certifiedAt },
  oilDelivered: { label: 'Oil delivered', q: 'Oil delivered?', field: 'Product delivered at', id: F.productDeliveredAt },
  marketingLive: { label: 'Marketing live', q: 'Marketing live?', field: 'Marketing activated at', id: F.marketingActivatedAt },
  firstLead: { label: 'First lead', q: 'Received first lead?', field: 'First lead delivered at', id: F.firstLeadAt },
  firstApptBooked: { label: 'First appointment booked', q: 'First appointment booked?', field: 'First appointment booked at', id: F.firstApptBookedAt },
  firstApptHeld: { label: 'First appointment held', q: 'First appointment held?', field: 'First appointment held at', id: F.firstApptHeldAt },
  firstSale: { label: 'First sale', q: 'First sale?', field: 'First sale closed at', id: F.firstSaleAt },
  allLeads: { label: 'All leads delivered', q: 'All leads delivered?', field: 'Fulfillment completed at', id: F.fulfillmentCompletedAt },
};

// Steps expected to be done by the time this call happens.
export const EXPECTED = {
  onboarding: [],
  prelaunch: ['onboarded', 'certified'],
  launch: ['onboarded', 'certified', 'oilDelivered'],
  checkin: ['onboarded', 'certified', 'oilDelivered', 'marketingLive', 'firstLead'],
};
export function expectedSteps(callType, journey = {}) {
  const base = [...(EXPECTED[callType] || [])];
  if (callType === 'checkin' && journey.firstLead) base.push('firstApptBooked');
  if (callType === 'checkin' && journey.firstApptBooked) base.push('firstApptHeld');
  return base;
}
export const gapSteps = (callType, journey = {}) => expectedSteps(callType, journey).filter((k) => !journey[k]);

// Which call type a member is "at", for texts / phone and no-response cards.
// Client Phase first; falls back to journey dates when the phase is blank.
export function callTypeFor(member) {
  const byPhase = {
    [CLIENT_PHASE.onboarding]: 'onboarding',
    [CLIENT_PHASE.prelaunch]: 'prelaunch',
    [CLIENT_PHASE.launch]: 'launch',
    [CLIENT_PHASE.ready]: 'checkin',
    [CLIENT_PHASE.live]: 'checkin',
  }[member.phase];
  if (byPhase) return byPhase;
  const j = member.journey || {};
  return j.marketingLive || j.firstLead ? 'checkin' : j.certified ? 'launch' : j.onboarded ? 'prelaunch' : 'onboarding';
}

// A held call moves Client Phase forward one step, only from the phase that call belongs to.
// "Ready to Launch" → "Live" stays a manual go button.
export const PHASE_ADVANCE = {
  onboarding: { outcome: 'Onboarded', from: CLIENT_PHASE.onboarding, to: CLIENT_PHASE.prelaunch },
  prelaunch: { outcome: 'Completed', from: CLIENT_PHASE.prelaunch, to: CLIENT_PHASE.launch },
  launch: { outcome: 'Launched', from: CLIENT_PHASE.launch, to: CLIENT_PHASE.ready },
};

export const SECTIONS = [
  {
    id: 'onboarding',
    title: 'Onboarding calls',
    label: 'Onboarding call',
    outcomes: ['Onboarded', 'Partially onboarded', 'No-show', 'Rescheduled', 'Cancelled'],
    always: [{ key: 'aeo', q: 'Pitched SEO / AEO?', resultKey: 'aeoResult', mandatory: 'SEO/AEO pitch is mandatory on onboarding calls' }],
  },
  {
    id: 'prelaunch',
    title: 'Pre-launch calls',
    label: 'Pre-launch call',
    outcomes: ['Completed', 'No-show', 'Rescheduled'],
    always: [],
  },
  {
    id: 'launch',
    title: 'Launch calls',
    label: 'Launch call',
    outcomes: ['Launched', 'Launch pending – blocker', 'No-show', 'Rescheduled'],
    always: [
      { key: 'affirm', q: 'Pitched Affirm?', resultKey: 'affirmResult', mandatory: 'Affirm pitch is mandatory on launch calls' },
      { key: 'goLive', q: 'Planned marketing go-live date', type: 'date' },
    ],
  },
  {
    id: 'checkin',
    title: 'Check-in calls',
    label: 'Check-in call',
    outcomes: ['Completed', 'No-show', 'Rescheduled'],
    always: [{ key: 'sale', type: 'sale' }],
  },
  {
    id: 'comms',
    title: 'Texts / phone calls',
    label: 'Text / phone',
    outcomes: null, // free text
    always: [{ key: 'sale', type: 'sale' }],
  },
  {
    id: 'outreach',
    title: 'Reached out, no response',
    label: 'No response',
    outcomes: ['No response', 'Left voicemail', 'Bad contact info'],
    always: [{ key: 'ghosting', type: 'ghost' }],
  },
];
export const sectionById = (id) => SECTIONS.find((s) => s.id === id);

export const PITCH_RESULTS = ['Sold', 'Interested – follow up', 'Not interested'];

// Demo data only. Member names are fictional. Structure mirrors what the real
// ingestion layer (GHL + Fathom → touch store → AI extraction) would hand the form.
//
// prov: where each prefilled value came from → 'ai' (transcript/SMS), 'airtable' (current record), 'calendar'.

const m = (o) => ({ flags: {}, prov: {}, evidence: [], alerts: [], ...o });

export const MEMBERS = {
  Tristan: {
    lastSync: '4:42 PM ET',
    touches: [
      m({
        id: 't1', section: 'onboarding', name: 'Marcus Delgado', business: 'Delgado Exteriors', pkg: 'Starter',
        current: { stage: '2. Not onboarded - OB scheduled', health: 2, nextStep: 'Onboarding call', nextDue: '2026-11-23', lastContact: '2026-11-20' },
        sources: [{ kind: 'fathom', label: 'Onboarding – Marcus Delgado', detail: '47 min · 10:00 AM' }, { kind: 'sms', label: 'GHL SMS', detail: '3 msgs' }],
        summary: 'Walked through portal, training access and certification. LLC not filed yet — waiting on EIN. Pitched SEO/AEO deck; wants to revisit after first jobs.',
        evidence: [
          { t: '18:12', who: 'Marcus', text: 'I haven’t filed the LLC yet, my accountant is getting the EIN this week.' },
          { t: '39:40', who: 'Marcus', text: 'The SEO thing makes sense, let me get a couple jobs under my belt first.' },
        ],
        values: { outcome: 'Onboarded', nextStep: 'Complete certification', nextDue: '2026-11-27', aeo: 'Yes', aeoResult: 'Interested – follow up', issues: 'LLC not filed — waiting on EIN from accountant.', health: 2 },
        prov: { outcome: 'ai', nextStep: 'ai', nextDue: 'ai', aeo: 'ai', aeoResult: 'ai', issues: 'ai', health: 'ai' },
      }),
      m({
        id: 't2', section: 'onboarding', name: 'Renee Whitfield', business: 'Whitfield Home Services', pkg: 'Growth',
        current: { stage: '2. Not onboarded - OB scheduled', health: 2, nextStep: 'Onboarding call', nextDue: '2026-11-23', lastContact: '2026-11-18' },
        sources: [{ kind: 'calendar', label: 'Onboarding – Renee Whitfield', detail: '1:00 PM · no recording' }, { kind: 'sms', label: 'GHL SMS', detail: '2 msgs' }],
        summary: 'No Fathom recording for the booked slot. SMS at 1:14 PM: client asked to move to tomorrow.',
        evidence: [{ t: 'SMS 1:14 PM', who: 'Renee', text: 'So sorry, kid is sick. Can we do tomorrow same time?' }],
        values: { outcome: 'Rescheduled', nextStep: 'Onboarding call (rebooked)', nextDue: '2026-11-24', aeo: '', health: 3 },
        prov: { outcome: 'ai', nextStep: 'ai', nextDue: 'calendar', health: 'ai' },
        alerts: ['No recording — outcome inferred from SMS. Confirm.'],
      }),
      m({
        id: 't3', section: 'prelaunch', name: 'Dale Okafor', business: 'Okafor Roofing', pkg: 'Growth',
        current: { stage: '6. Product delivered', health: 1, nextStep: 'Pre-launch call', nextDue: '2026-11-23', lastContact: '2026-11-19', productDelivered: '2026-11-19' },
        sources: [{ kind: 'fathom', label: 'Pre-launch – Dale Okafor', detail: '38 min · 11:30 AM' }],
        summary: 'Product arrived 11/19. Reviewed print + social resources and organic plan. Still needs to send full ZIP list. Launch call booked Wed 11/25 2 PM ET.',
        evidence: [{ t: '31:05', who: 'Dale', text: 'I’ll get you the rest of the zip codes tonight.' }],
        values: { outcome: 'Completed', productDelivered: 'Yes', productDeliveredDate: '2026-11-19', launchBooked: '2026-11-25', nextStep: 'Send full ZIP list', nextDue: '2026-11-24', issues: 'Missing ZIP list for campaign build.', health: 1 },
        prov: { outcome: 'ai', productDelivered: 'airtable', productDeliveredDate: 'airtable', launchBooked: 'calendar', nextStep: 'ai', nextDue: 'ai', issues: 'ai', health: 'ai' },
      }),
      m({
        id: 't4', section: 'launch', name: 'Gina Marsh', business: 'Marsh Roof Care', pkg: 'Starter',
        current: { stage: '6. Product delivered', health: 1, nextStep: 'Launch call', nextDue: '2026-11-23', lastContact: '2026-11-20', productDelivered: '2026-11-18' },
        sources: [{ kind: 'fathom', label: 'Launch – Gina Marsh', detail: '52 min · 2:00 PM' }],
        summary: 'Launch checklist done. Closed Affirm $2K setup on the call. Away for Thanksgiving — campaign goes live Mon 11/30.',
        evidence: [
          { t: '33:20', who: 'Tristan', text: 'So the Affirm setup is $2,000 and you’ll be able to offer financing on every job.' },
          { t: '35:02', who: 'Gina', text: 'Yeah let’s do it, I’ll pay that now.' },
        ],
        values: { outcome: 'Launched', oilDelivered: 'Yes', oilDeliveredDate: '2026-11-18', affirm: 'Yes', affirmResult: 'Sold', goLive: '2026-11-30', nextStep: 'Go-live check-in', nextDue: '2026-11-30', health: 1 },
        prov: { outcome: 'ai', oilDelivered: 'airtable', oilDeliveredDate: 'airtable', affirm: 'ai', affirmResult: 'ai', goLive: 'ai', nextStep: 'ai', nextDue: 'ai', health: 'ai' },
        flags: { upsell: { on: true, type: 'Financing', amount: '2000', prov: 'ai' } },
      }),
      m({
        id: 't5', section: 'launch', name: 'Pete Lindqvist', business: 'Lindqvist Restoration', pkg: 'Scale',
        current: { stage: '5. Product ordered - not delivered', health: 2, nextStep: 'Launch call', nextDue: '2026-11-23', lastContact: '2026-11-17', a2p: 'Pending' },
        sources: [{ kind: 'fathom', label: 'Launch – Pete Lindqvist', detail: '29 min · 3:30 PM' }],
        summary: 'Oil still in transit. A2P pending — CP575 not uploaded. Frustrated about timeline. Affirm not mentioned.',
        evidence: [{ t: '12:48', who: 'Pete', text: 'It’s been three weeks, I was told I’d be running ads by now.' }],
        values: { outcome: 'Launch pending – blocker', oilDelivered: 'No', affirm: 'No', nextStep: 'Upload CP575 for A2P', nextDue: '2026-11-25', issues: 'Oil in transit; A2P blocked on CP575. Frustrated with timeline.', health: 3 },
        prov: { outcome: 'ai', oilDelivered: 'airtable', affirm: 'ai', nextStep: 'ai', nextDue: 'ai', issues: 'ai', health: 'ai' },
        alerts: ['Affirm not pitched on a launch call (mandatory).'],
      }),
      m({
        id: 't6', section: 'checkin', name: 'Hector Ruiz', business: 'Ruiz Roofing', pkg: 'Growth',
        current: { stage: '6. Product delivered', health: 2, nextStep: 'Check-in', nextDue: '2026-11-23', lastContact: '2026-11-16', firstSale: '' },
        sources: [{ kind: 'fathom', label: 'Check-in – Hector Ruiz', detail: '24 min · 9:00 AM' }],
        summary: 'First job sold Saturday: $4,800, took $2,400 deposit. Interested in reorder once 2 more jobs close.',
        evidence: [{ t: '04:10', who: 'Hector', text: 'Closed my first one Saturday, forty-eight hundred, they gave me half down.' }],
        values: { outcome: 'Completed', sale: 'Yes', saleDate: '2026-11-21', jobValue: '4800', cashCollected: '2400', reorder: 'Pitched', nextStep: 'Reorder follow-up', nextDue: '2026-12-04', health: 1 },
        prov: { outcome: 'ai', sale: 'ai', saleDate: 'ai', jobValue: 'ai', cashCollected: 'ai', reorder: 'ai', nextStep: 'ai', nextDue: 'ai', health: 'ai' },
        flags: { caseStudy: { on: false } },
      }),
      m({
        id: 't7', section: 'checkin', name: 'Carla Benton', business: 'Benton Pro Exteriors', pkg: 'Starter',
        current: { stage: '6. Product delivered', health: 2, nextStep: 'Check-in', nextDue: '2026-11-23', lastContact: '2026-11-13' },
        sources: [{ kind: 'fathom', label: 'Check-in – Carla Benton', detail: '36 min · 4:00 PM' }, { kind: 'sms', label: 'GHL SMS', detail: '5 msgs' }],
        summary: '9 leads, 5 dropped. Thinks leads are low quality. Asked what a refund would look like. No sales yet.',
        evidence: [
          { t: '21:33', who: 'Carla', text: 'Honestly, what would it look like if I wanted my money back?' },
          { t: '22:10', who: 'Tristan', text: 'Let me look at your replacements first — some of these qualify.' },
        ],
        values: { outcome: 'Completed', sale: 'No', reorder: 'Not discussed', nextStep: 'Submit lead replacements + call back', nextDue: '2026-11-24', issues: 'Lead quality complaint; 5 of 9 dropped. Raised refund.', health: 4 },
        prov: { outcome: 'ai', sale: 'ai', reorder: 'ai', nextStep: 'ai', nextDue: 'ai', issues: 'ai', health: 'ai' },
        flags: { refund: { on: true, note: 'Asked what a refund would look like (not formal yet).', prov: 'ai' }, escalate: { on: true, note: 'Refund risk', prov: 'ai' } },
        alerts: ['Lead replacements must be submitted within 48h.'],
      }),
      m({
        id: 't8', section: 'comms', name: 'Wes Holloway', business: 'Holloway Roof Restore', pkg: 'Growth',
        current: { stage: '6. Product delivered', health: 2, nextStep: 'Check-in', nextDue: '2026-11-26', lastContact: '2026-11-19', firstSale: '' },
        sources: [{ kind: 'sms', label: 'GHL SMS', detail: '4 msgs · 8:12 AM' }],
        summary: 'Client texted: closed first job yesterday, $6,200, paid in full.',
        evidence: [{ t: 'SMS 8:12 AM', who: 'Wes', text: 'Closed my first job yesterday!! 6200 paid in full 🙌' }],
        values: { outcome: 'Client reported first sale', sale: 'Yes', saleDate: '2026-11-22', jobValue: '6200', cashCollected: '6200', nextStep: 'Ask for testimonial', nextDue: '2026-11-25', health: 1 },
        prov: { outcome: 'ai', sale: 'ai', saleDate: 'ai', jobValue: 'ai', cashCollected: 'ai', nextStep: 'ai', nextDue: 'ai', health: 'ai' },
        flags: { caseStudy: { on: true, note: 'Ask for selfie video', prov: 'ai' } },
      }),
      m({
        id: 't9', section: 'comms', name: 'Tony Abara', business: 'Abara Home Care', pkg: 'Starter',
        current: { stage: '5. Product ordered - not delivered', health: 2, nextStep: 'Confirm delivery', nextDue: '2026-11-24', lastContact: '2026-11-21' },
        sources: [{ kind: 'call', label: 'GHL phone call', detail: '6 min · 12:20 PM' }],
        summary: 'Asked for oil tracking number. Shipped 11/20, ETA 11/25.',
        evidence: [{ t: 'Call summary', who: 'GHL', text: 'Caller requested tracking for oil order.' }],
        values: { outcome: 'Sent oil tracking; ETA 11/25', sale: 'No', nextStep: 'Confirm delivery', nextDue: '2026-11-25', health: 2 },
        prov: { outcome: 'ai', sale: 'ai', nextStep: 'ai', nextDue: 'ai', health: 'airtable' },
      }),
    ],
    untouched: [
      { id: 'u1', name: 'Brent Kowalski', business: 'Kowalski Exteriors', health: 3, reasons: ['Next step overdue 4 days: "Send cert link"', '9 days since contact'] },
      { id: 'u2', name: 'Lisa Tran', business: 'Tran Roofing Co', health: 4, reasons: ['Health: At Risk', '6 days since contact'] },
      { id: 'u3', name: 'Omar Haddad', business: 'Haddad Home Pros', health: 2, reasons: ['Oil delivered 11/12, no launch call booked'] },
    ],
  },
  Jack: {
    lastSync: '4:40 PM ET',
    touches: [
      m({
        id: 'j1', section: 'launch', name: 'Kyle Simmons', business: 'Simmons Exterior Care', pkg: 'Growth',
        current: { stage: '6. Product delivered', health: 1, nextStep: 'Launch call', nextDue: '2026-11-23', lastContact: '2026-11-20', productDelivered: '2026-11-17' },
        sources: [{ kind: 'fathom', label: 'Launch – Kyle Simmons', detail: '44 min · 11:00 AM' }],
        summary: 'Launched. Pitched Affirm; wants to think about it until after first job.',
        evidence: [{ t: '30:15', who: 'Kyle', text: 'Financing sounds good, let me land one job and I’ll circle back.' }],
        values: { outcome: 'Launched', oilDelivered: 'Yes', oilDeliveredDate: '2026-11-17', affirm: 'Yes', affirmResult: 'Interested – follow up', goLive: '2026-11-24', nextStep: 'Affirm follow-up', nextDue: '2026-12-01', health: 1 },
        prov: { outcome: 'ai', oilDelivered: 'airtable', oilDeliveredDate: 'airtable', affirm: 'ai', affirmResult: 'ai', goLive: 'ai', nextStep: 'ai', nextDue: 'ai', health: 'ai' },
      }),
      m({
        id: 'j2', section: 'checkin', name: 'Paul Esteban', business: 'Esteban Roof Coatings', pkg: 'Scale',
        current: { stage: '6. Product delivered', health: 2, nextStep: 'Check-in', nextDue: '2026-11-23', lastContact: '2026-11-16', firstSale: '2026-11-02' },
        sources: [{ kind: 'fathom', label: 'Check-in – Paul Esteban', detail: '22 min · 1:00 PM' }],
        summary: 'Two more jobs this week ($9,500 total). Ready to reorder — wants Black Friday price.',
        evidence: [{ t: '15:40', who: 'Paul', text: 'If that Black Friday price is real I’ll grab the Growth reorder.' }],
        values: { outcome: 'Completed', sale: 'Yes', saleDate: '2026-11-21', jobValue: '9500', cashCollected: '9500', reorder: 'Committed', nextStep: 'Send reorder link (BF pricing, pay this week)', nextDue: '2026-11-25', health: 1 },
        prov: { outcome: 'ai', sale: 'ai', saleDate: 'ai', jobValue: 'ai', cashCollected: 'ai', reorder: 'ai', nextStep: 'ai', nextDue: 'ai', health: 'ai' },
      }),
      m({
        id: 'j3', section: 'checkin', name: 'Neil Garrity', business: 'Garrity Roofing', pkg: 'Starter',
        current: { stage: '6. Product delivered', health: 2, nextStep: 'Check-in', nextDue: '2026-11-23', lastContact: '2026-11-19' },
        sources: [{ kind: 'calendar', label: 'Check-in – Neil Garrity', detail: '3:00 PM · no recording' }],
        summary: 'Calendar event, no recording and no messages found. Nothing to prefill.',
        values: { outcome: '', sale: '', nextStep: '', nextDue: '', health: 2 },
        prov: { health: 'airtable' },
        alerts: ['No recording found — fill manually or confirm no-show.'],
      }),
    ],
    untouched: [
      { id: 'u4', name: 'Sam Whitaker', business: 'Whitaker Exteriors', health: 3, reasons: ['12 days since contact'] },
    ],
  },
};

export function getCsmData(csm) {
  return MEMBERS[csm] || { lastSync: '4:41 PM ET', touches: [], untouched: [] };
}

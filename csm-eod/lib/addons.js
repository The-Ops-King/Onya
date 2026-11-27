// Optional updates a CSM can add to any card via "+ Add".
// Nothing here shows unless the AI detected it or the CSM adds it.
//
// For now every add-on is written as a line in the member's EOD comment.
// Upsells, reorders, oil returns and refunds are normally created by portal forms (which also trigger
// Viktor's payment check, the #product-orders alert and shipping emails), and Customer tickets mirror
// Zendesk. Writing those tables directly would skip all of that, so they wait until the EOD can submit
// through the same path. See "Open questions" in the project notes.

const money = (v) => `$${Number(v || 0).toLocaleString()}`;
const join = (...xs) => xs.filter(Boolean).join(' · ');

export const ADDON_GROUPS = ['Client', 'Marketing & leads', 'Money', 'Support'];

export const ADDONS = [
  { key: 'issue', group: 'Client', label: 'Issue / concern', tone: 'warn', fields: [{ k: 'text', type: 'text', ph: 'What’s wrong?' }], line: (a) => `Issue: ${a.text || '—'}` },
  {
    key: 'caseStudy', group: 'Client', label: 'Case study / testimonial', tone: 'good',
    fields: [{ k: 'type', type: 'select', options: ['Screenshot', 'Selfie video', 'Interview booked'] }, { k: 'note', type: 'text', ph: 'Notes' }],
    line: (a) => `Case study: ${join(a.type || '—', a.note)}`,
  },
  {
    key: 'marketing', group: 'Marketing & leads', label: 'Marketing change', tone: 'info',
    fields: [{ k: 'action', type: 'select', options: ['Turn on', 'Pause', 'Turn off', 'Change ZIP codes', 'Change budget / strategy', 'Other'] }, { k: 'note', type: 'text', ph: 'Details' }],
    line: (a) => `Marketing change: ${join(a.action || '—', a.note)}`,
  },
  {
    key: 'leads', group: 'Marketing & leads', label: 'Leads', tone: 'info',
    fields: [
      { k: 'type', type: 'select', options: ['Wants more leads', 'Lead replacement', 'Unresponsive lead', 'Lead quality complaint'] },
      { k: 'count', type: 'number', ph: '# leads' },
      { k: 'note', type: 'text', ph: 'Details' },
    ],
    hint: (a) => (a.type === 'Lead replacement' ? 'Replacements must be submitted within 48h of the lead.' : null),
    line: (a) => `Leads: ${join(a.type || '—', a.count && `${a.count} leads`, a.note)}`,
  },
  {
    key: 'reorder', group: 'Money', label: 'Reorder', tone: 'good',
    fields: [{ k: 'status', type: 'select', options: ['Pitched', 'Committed', 'Paid', 'Not now'] }, { k: 'pkg', type: 'select', options: ['Starter', 'Growth', 'Scale', 'Custom'] }],
    line: (a) => `Reorder: ${join(a.status || '—', a.pkg)}`,
  },
  {
    key: 'sale', group: 'Money', label: 'Sale made', tone: 'good', onlyAfterFirstSale: true,
    fields: [{ k: 'date', type: 'date' }, { k: 'jobValue', type: 'money', ph: '$ job' }, { k: 'collected', type: 'money', ph: '$ collected' }],
    line: (a) => `Sale ${a.date || '—'} · job ${money(a.jobValue)} · collected ${money(a.collected)}`,
  },
  {
    key: 'upsell', group: 'Money', label: 'Upsell sold', tone: 'good',
    fields: [{ k: 'type', type: 'select', options: ['Skid', 'Gutter Guards', 'Financing', 'SEO', 'AEO', 'SEO + AEO', 'Package upgrade', 'Lead purchase', 'Other'] }, { k: 'amount', type: 'money', ph: '$ collected' }],
    line: (a) => `Upsell sold: ${a.type || 'Other'} · ${money(a.amount)}`,
  },
  { key: 'refund', group: 'Money', label: 'Refund / cancel request', tone: 'bad', fields: [{ k: 'note', type: 'text', ph: 'What did they say?' }], line: (a) => `Refund / cancel request: ${a.note || '—'}` },
  {
    key: 'product', group: 'Support', label: 'Product / oil issue', tone: 'warn',
    fields: [{ k: 'type', type: 'select', options: ['Damaged', 'Short shipped', 'Wrong product', 'Return request', 'Needs equipment'] }, { k: 'note', type: 'text', ph: 'Details' }],
    line: (a) => `Product issue: ${join(a.type || '—', a.note)}`,
  },
  {
    key: 'tech', group: 'Support', label: 'Tech help (A2P / GHL / portal)', tone: 'info',
    fields: [{ k: 'type', type: 'select', options: ['A2P registration', 'GHL help', 'Portal or website help'] }, { k: 'note', type: 'text', ph: 'Details' }],
    line: (a) => `Tech help: ${join(a.type || '—', a.note)}`,
  },
  { key: 'escalate', group: 'Support', label: 'Needs escalation', tone: 'bad', fields: [{ k: 'note', type: 'text', ph: 'What do you need?' }], line: (a) => `Escalation: ${a.note || '—'}` },
];

export const addonLines = (flags = {}) => ADDONS.filter((a) => flags[a.key]?.on).map((a) => a.line(flags[a.key]));

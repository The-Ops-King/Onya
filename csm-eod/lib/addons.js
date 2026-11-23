// Optional updates a CSM can add to any card via "+ Add".
// Nothing here shows unless the AI detected it or the CSM adds it.
// Each add-on declares its fields and the Airtable writes it produces.

const money = (v) => `$${Number(v || 0).toLocaleString()}`;
const ticket = (type, detail) => ({ kind: 'create', table: 'Customer tickets', field: `New ticket: ${type}`, to: detail || '—', status: 'exists', note: 'Marketing board syncs from Zendesk, so changes go through a ticket' });

export const ADDON_GROUPS = ['Client', 'Marketing & leads', 'Money', 'Support'];

export const ADDONS = [
  {
    key: 'issue', group: 'Client', label: 'Issue / concern', tone: 'warn',
    fields: [{ k: 'text', type: 'text', ph: 'What’s wrong?' }],
    writes: (a) => [{ kind: 'update', table: 'Members', field: 'Current issues', to: a.text || '—', status: 'new' }],
  },
  {
    key: 'caseStudy', group: 'Client', label: 'Case study / testimonial', tone: 'good',
    fields: [{ k: 'type', type: 'select', options: ['Screenshot', 'Selfie video', 'Interview booked'] }, { k: 'note', type: 'text', ph: 'Notes' }],
    writes: (a) => [{ kind: 'skip', table: 'EOD log', field: 'Case study', to: `${a.type || '—'} ${a.note || ''}`, note: 'Counts toward 2/week KPI' }],
  },
  {
    key: 'marketing', group: 'Marketing & leads', label: 'Marketing change', tone: 'info',
    fields: [{ k: 'action', type: 'select', options: ['Turn on', 'Pause', 'Turn off', 'Change ZIP codes', 'Change budget / strategy', 'Other'] }, { k: 'note', type: 'text', ph: 'Details' }],
    writes: (a) => [ticket('Campaign request', `${a.action || '—'}${a.note ? ' · ' + a.note : ''}`)],
  },
  {
    key: 'leads', group: 'Marketing & leads', label: 'Leads', tone: 'info',
    fields: [
      { k: 'type', type: 'select', options: ['Wants more leads', 'Lead replacement', 'Unresponsive lead', 'Lead quality complaint'] },
      { k: 'count', type: 'number', ph: '# leads' },
      { k: 'note', type: 'text', ph: 'Details' },
    ],
    hint: (a) => (a.type === 'Lead replacement' ? 'Replacements must be submitted within 48h of the lead.' : null),
    writes: (a) => {
      const map = { 'Lead replacement': 'Lead replacement', 'Unresponsive lead': 'Unresponsive lead', 'Wants more leads': 'Campaign request', 'Lead quality complaint': 'Dealer escalation' };
      return [ticket(map[a.type] || 'Campaign request', `${a.type || '—'}${a.count ? ` · ${a.count} leads` : ''}${a.note ? ' · ' + a.note : ''}`)];
    },
  },
  {
    key: 'reorder', group: 'Money', label: 'Reorder', tone: 'good',
    fields: [{ k: 'status', type: 'select', options: ['Pitched', 'Committed', 'Paid', 'Not now'] }, { k: 'pkg', type: 'select', options: ['Starter', 'Growth', 'Scale', 'Custom'] }],
    writes: (a) => [{ kind: 'update', table: 'Reorder Pipeline', field: 'Reorder Status', to: `${a.status || '—'}${a.pkg ? ` (${a.pkg})` : ''}`, status: 'exists' }],
  },
  {
    key: 'sale', group: 'Money', label: 'Sale made', tone: 'good', onlyAfterFirstSale: true,
    fields: [{ k: 'date', type: 'date' }, { k: 'jobValue', type: 'money', ph: '$ job' }, { k: 'collected', type: 'money', ph: '$ collected' }],
    writes: (a) => [
      { kind: 'update', table: 'Members', field: 'Last sale date', to: a.date || '—', status: 'new' },
      ...(a.jobValue ? [{ kind: 'update', table: 'Members', field: 'Last sale job value', to: money(a.jobValue), status: 'new' }] : []),
    ],
  },
  {
    key: 'upsell', group: 'Money', label: 'Upsell sold', tone: 'good',
    fields: [{ k: 'type', type: 'select', options: ['Skid', 'Gutter Guards', 'Financing', 'SEO', 'AEO', 'SEO + AEO', 'Package upgrade', 'Lead purchase', 'Other'] }, { k: 'amount', type: 'money', ph: '$ collected' }],
    writes: (a) => [{ kind: 'create', table: 'Upsell Table', field: 'New upsell', to: `${a.type || 'Other'} · ${money(a.amount)}`, status: 'exists' }],
  },
  {
    key: 'refund', group: 'Money', label: 'Refund / cancel request', tone: 'bad',
    fields: [{ k: 'note', type: 'text', ph: 'What did they say?' }],
    writes: (a) => [
      { kind: 'create', table: 'Payments, Refunds & Disputes', field: 'New case', to: `Open · ${a.note || '—'}`, status: 'exists' },
      { kind: 'update', table: 'Members', field: 'Lifecycle Stage', to: 'Cancelling', status: 'exists' },
    ],
  },
  {
    key: 'product', group: 'Support', label: 'Product / oil issue', tone: 'warn',
    fields: [{ k: 'type', type: 'select', options: ['Damaged', 'Short shipped', 'Wrong product', 'Return request', 'Needs equipment'] }, { k: 'note', type: 'text', ph: 'Details' }],
    writes: (a) =>
      a.type === 'Return request'
        ? [{ kind: 'create', table: 'Oil Returns', field: 'New return', to: a.note || '—', status: 'exists' }]
        : [{ kind: 'update', table: 'Orders', field: 'Needs review', to: `✓ ${a.type || ''} · ${a.note || ''}`, status: 'exists' }],
  },
  {
    key: 'tech', group: 'Support', label: 'Tech help (A2P / GHL / portal)', tone: 'info',
    fields: [{ k: 'type', type: 'select', options: ['A2P registration', 'GHL help', 'Portal or website help'] }, { k: 'note', type: 'text', ph: 'Details' }],
    writes: (a) => [ticket(a.type || 'GHL help', a.note)],
  },
  {
    key: 'escalate', group: 'Support', label: 'Needs escalation', tone: 'bad',
    fields: [{ k: 'note', type: 'text', ph: 'What do you need?' }],
    writes: (a) => [ticket('Dealer escalation', a.note)],
  },
];

export const addonWrites = (flags) => ADDONS.filter((a) => flags[a.key]?.on).flatMap((a) => a.writes(flags[a.key]));

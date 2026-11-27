// Airtable IDs. Reads and writes use field IDs so a field rename in Airtable doesn't break the app.
// Only filterByFormula needs field names (Airtable formulas can't use IDs).

export const BASE = 'appbdkgbNkF0hA4tE';
export const MEMBERS = 'tblzhYLTdoNxo87bF';
export const EOD = 'tblzTnRgHp7J6qd7U';

// Members fields
export const F = {
  name: 'flddg4UyOYBVVaNd4',
  business: 'flduHykfaHc3Mp9Lz',
  csm: 'fldXnEvQcndGrQ96d',
  email: 'fldnfeWyUiXMk81Ne',
  hlContactId: 'fldJsClX65CdDrSfH',
  lifecycleStatus: 'fldIadHv3YkxpLJm2',
  clientPhase: 'fldPeBYUnO1ZFNJIL',
  defcon: 'fldleGGStA9ryRPNP',
  nextStep: 'fldOB2PMAATEnkswi',
  nextDue: 'fld9YW054KcBYcMKU',
  lastContact: 'fld2SH2eAhkd8Jq5c',
  onboardedAt: 'fldiLnyp1XvyIrB9g',
  certifiedAt: 'fldiOXKTzkyJRXt17',
  productDeliveredAt: 'fldZyzmxdSVepga9C',
  marketingActivatedAt: 'fldXu8ogvJL2tieUf',
  firstLeadAt: 'fldJ5jfECz94bhR77',
  firstApptBookedAt: 'fldtnSlryWPSDlqyV',
  firstApptHeldAt: 'fldSajAzc5botjsdE',
  firstSaleAt: 'fldXLEV81jjhVAIPj',
  fulfillmentCompletedAt: 'fldmFhqGB8fgBNMAP',
};

// Names used only inside filterByFormula.
export const N = { csm: 'CSM', lifecycleStatus: 'Lifecycle Status', clientStage: 'Client Stage' };

export const CLIENT_PHASE = {
  onboarding: 'Onboarding Call',
  prelaunch: 'Pre-Launch Call',
  launch: 'Launch Call',
  ready: 'Ready to Launch',
  live: 'Live',
};

export const LIFECYCLE = { active: 'Active', ghosting: 'Ghosting' };

export const DEFCON_OPTION = {
  5: 'DEFCON 5: Thriving',
  4: 'DEFCON 4: Healthy',
  3: 'DEFCON 3: Watch',
  2: 'DEFCON 2: At Risk',
  1: 'DEFCON 1: Critical',
};

// EOD Check-ins fields (existing)
export const E = {
  date: 'fldazhfmALrPJgeKv',
  name: 'fldMuef6qdpCyzDBj',
  onboarding: 'fldeIL6CYRrYt9mOf',
  prelaunch: 'fldgk4ugcK6g0eCJk',
  launch: 'fldPNcmNv9z5pZ0MG',
  checkin: 'fldo2F7Fe7Du7BNdF',
  reachOuts: 'fldzDY3YmitRkbJ0I',
  fires: 'fldG4h8ZvuxASg2lA',
  upsells: 'fldHgyqjLHYqFtl9h',
  actionItems: 'fldDkmOjOyN9P8Jna',
  obCompleted: 'fldytJsW6t7gFJMqd',
  submissionRef: 'fldh5XvhSYMwx1EDm',
  reportPeriod: 'fldF1s4WJ9JOGRSFm',
  other: 'fldR5xj0sbGRWI4QH',
};

// EOD Check-ins fields added for this app (2026-11-27).
export const E_NEW = {
  membersTouched: 'fldz4zv4hj3uuuNVY',
  writeLog: 'fldrJ2VW5eogh5WuD',
  timeOnForm: 'fldTqa0nqalCP49dQ',
  quickConfirms: 'flds1XH43QuqnJ7b2',
  aiValuesChanged: 'flduQFRBNNu0PQYk8',
  addedByHand: 'fldavZjgGUTwTaNrj',
};

import 'server-only';

// CSMs that can open a form. Matches the Members.CSM options (Oliver = Olly, owner of the test member).
export const CSMS = ['Tristan', 'Jack', 'James', 'Alejandro', 'Laurence', 'Josh', 'Joe', 'Jedd', 'Matheus', 'Oliver'];

// Record IDs the app may write to. Empty = preview only, nothing is written.
// Comma-separated in WRITE_ALLOWLIST, or "*" to allow every member (go-live).
export function canWrite(recordId) {
  const raw = (process.env.WRITE_ALLOWLIST || '').trim();
  if (raw === '*') return true;
  return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(recordId);
}
export const writesEnabled = () => !!(process.env.WRITE_ALLOWLIST || '').trim();

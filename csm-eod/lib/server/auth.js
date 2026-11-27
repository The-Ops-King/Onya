// Shared passcode gate. The cookie holds an HMAC of the passcode, never the passcode itself.
// Works in both the Edge middleware and Node route handlers (Web Crypto only).

export const COOKIE = 'eod_auth';

async function hmac(text, key) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(text));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function secrets() {
  const pass = process.env.EOD_PASSCODE;
  const key = process.env.EOD_SESSION_SECRET || process.env.EOD_PASSCODE;
  return { pass, key };
}

export async function expectedCookie() {
  const { pass, key } = secrets();
  if (!pass) return null;
  return hmac('eod:' + pass, key);
}

export async function checkPasscode(input) {
  const { pass } = secrets();
  if (!pass || typeof input !== 'string') return false;
  // constant-time compare via HMAC of both sides
  const [a, b] = await Promise.all([hmac(input, 'cmp'), hmac(pass, 'cmp')]);
  return a === b;
}

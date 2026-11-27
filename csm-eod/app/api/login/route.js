import { NextResponse } from 'next/server';
import { COOKIE, checkPasscode, expectedCookie } from '@/lib/server/auth';

export async function POST(req) {
  const { passcode } = await req.json().catch(() => ({}));
  if (!(await checkPasscode(passcode))) return NextResponse.json({ error: 'Wrong passcode' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await expectedCookie(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}

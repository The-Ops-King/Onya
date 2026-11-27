import { NextResponse } from 'next/server';
import { COOKIE, expectedCookie } from './lib/server/auth';

// Every API route except login needs the passcode cookie.
export async function middleware(req) {
  if (req.nextUrl.pathname === '/api/login') return NextResponse.next();
  const want = await expectedCookie();
  if (!want) return NextResponse.json({ error: 'EOD_PASSCODE is not set on the server' }, { status: 503 });
  if (req.cookies.get(COOKIE)?.value !== want) return NextResponse.json({ error: 'auth' }, { status: 401 });
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*'] };

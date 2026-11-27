import { NextResponse } from 'next/server';
import { listMembers } from '@/lib/server/airtable';
import { CSMS } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

// GET /api/roster            → { csms }
// GET /api/roster?csm=Oliver → { members }  (that CSM's active members, live from Airtable)
export async function GET(req) {
  const csm = req.nextUrl.searchParams.get('csm');
  if (!csm) return NextResponse.json({ csms: CSMS });
  if (!CSMS.includes(csm)) return NextResponse.json({ error: 'Unknown CSM' }, { status: 400 });
  try {
    return NextResponse.json({ members: await listMembers(csm) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

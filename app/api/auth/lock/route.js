import { NextResponse } from 'next/server';
import { clearSessionByToken, getSessionCookieName, getSessionCookieOptions } from '@/lib/server/auth/session';
import { hasSameRequestOrigin } from '@/lib/company-reading/request-origin';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request) {
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  await clearSessionByToken(request.cookies.get(getSessionCookieName())?.value || '');
  const response = NextResponse.json({ locked: true }, { headers: { 'Cache-Control': 'private, no-store', 'Clear-Site-Data': '"cache"' } });
  response.cookies.set(getSessionCookieName(), '', { ...getSessionCookieOptions(new Date(0)), maxAge: 0 });
  return response;
}

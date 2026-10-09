import { requireApiAuthSession } from '@/lib/server/auth/session';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  const session = await requireApiAuthSession(request);
  if (session instanceof Response) return session;
  return Response.json({ scope: `${session.user.id}:${session.workspace.id}`, expiresAt: session.session.expiresAt }, { headers: { 'Cache-Control': 'private, no-store' } });
}

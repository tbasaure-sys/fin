import { requireServerAuthSession } from '@/lib/server/auth/session';
import PrivateSessionGuard from '@/components/private-session-guard';
export const dynamic = 'force-dynamic';
export default async function PrivateWorkspaceLayout({ children }) {
  const session = await requireServerAuthSession('/app');
  return <PrivateSessionGuard scope={`${session.user.id}:${session.workspace.id}`} expiresAt={String(session.session.expiresAt)}>{children}</PrivateSessionGuard>;
}

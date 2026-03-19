import TerminalApp from "@/components/terminal-app";
import { requireServerAuthSession, buildAuthenticatedSessionPayload } from "@/lib/server/auth/session";
import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";

export const dynamic = "force-dynamic";

export default async function PrivateWorkspacePage() {
  const authSession = await requireServerAuthSession("/app");
  const [session, dashboard] = await Promise.all([
    buildAuthenticatedSessionPayload(authSession),
    getWorkspaceDashboard(authSession.workspace.id),
  ]);

  return <TerminalApp initialSession={session} initialDashboard={dashboard} />;
}

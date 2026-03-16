import TerminalApp from "@/components/terminal-app";
import { getSessionPayload, getWorkspaceDashboard } from "@/lib/server/dashboard-service";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = getServerConfig();
  const [session, dashboard] = await Promise.all([
    getSessionPayload(),
    getWorkspaceDashboard(config.workspaceId),
  ]);

  return <TerminalApp initialSession={session} initialDashboard={dashboard} />;
}


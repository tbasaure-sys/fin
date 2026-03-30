import TerminalApp from "@/components/terminal-app";
import { requireServerAuthSession, buildAuthenticatedSessionPayload } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";
import { getWorkspaceDashboard } from "@/lib/server/dashboard-service";
import { buildDecisionOsSections } from "@/lib/server/decision-os";

export const dynamic = "force-dynamic";

function buildWorkspacePageFallback(authSession, error) {
  const config = getServerConfig();
  const message = String(error?.message || error || "The workspace could not be assembled.");
  const fallback = {
    workspace_summary: {
      id: authSession.workspace.id,
      name: authSession.workspace.name || config.appName,
      backend_status: "briefing",
      last_updated_label: "Unavailable",
    },
    state_summary: {
      stance: "Workspace loaded with limited data",
      decisionSummary: message,
      mode: "-",
      recovery: "-",
      ambiguity: "-",
      evidenceStrength: "-",
      sponsorship: "-",
      mainRisk: "-",
      holdings: "-",
    },
    primary_action: null,
    secondary_actions: [],
    blocked_action: null,
    evidence_drawer: {
      headline: "Workspace loaded with limited data",
      summary: message,
      currentRead: [],
      thresholds: [],
      memoryNarrative: [],
    },
    escrow: {
      summary: "Escrow is temporarily unavailable.",
      items: [],
    },
    memory: {
      stats: {
        staged: 0,
        executed: 0,
        deferred: 0,
        cancelled: 0,
      },
      weeklyBrief: [],
      recentEvents: [],
    },
    decision_workspace: {
      alerts: [
        {
          id: "workspace-page-fallback",
          severity: "high",
          title: "Workspace loaded with limited data",
          body: message,
        },
      ],
      reopenTrigger: null,
      closeTrigger: null,
    },
    alerts: [
      {
        id: "workspace-page-fallback",
        severity: "high",
        title: "Workspace loaded with limited data",
        body: message,
      },
    ],
  };
  return {
    ...fallback,
    ...buildDecisionOsSections(fallback),
  };
}

export default async function PrivateWorkspacePage() {
  const authSession = await requireServerAuthSession("/app");
  const session = await buildAuthenticatedSessionPayload(authSession);
  let dashboard;

  try {
    dashboard = await getWorkspaceDashboard(authSession.workspace.id);
  } catch (error) {
    dashboard = buildWorkspacePageFallback(authSession, error);
  }

  return <TerminalApp initialSession={session} initialDashboard={dashboard} />;
}

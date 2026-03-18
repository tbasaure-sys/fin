import { getServerConfig } from "./config.js";
import { getWorkspaceDashboard } from "./dashboard-service.js";

const encoder = new TextEncoder();

function sse(event, payload) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function createWorkspaceStream(workspaceId) {
  const config = getServerConfig();
  const dashboard = await getWorkspaceDashboard(workspaceId);
  const marketData = dashboard.data_control?.marketData || null;

  return new ReadableStream({
    start(controller) {
      controller.enqueue(sse("connection_state_changed", {
        state: "connected",
        workspaceId,
        connectedAt: new Date().toISOString(),
      }));

      controller.enqueue(sse("module_refresh_started", {
        workspaceId,
        at: new Date().toISOString(),
      }));

      controller.enqueue(sse("module_refresh_completed", {
        workspaceId,
        generatedAt: dashboard.workspace_summary.last_updated,
      }));

      controller.enqueue(sse("market_data_status", {
        workspaceId,
        asOf: marketData?.asOf || null,
        staleDays: marketData?.staleDays ?? null,
        freshnessLabel: marketData?.freshnessLabel || null,
      }));

      let tick = 0;
      const interval = setInterval(() => {
        tick += 1;
        if (tick % 3 === 0) {
          controller.enqueue(sse("connection_state_changed", {
            state: "heartbeat",
            workspaceId,
            at: new Date().toISOString(),
          }));
        }

        if (tick % 5 === 0) {
          controller.enqueue(sse("module_refresh_started", {
            workspaceId,
            at: new Date().toISOString(),
          }));
          controller.enqueue(sse("market_data_status", {
            workspaceId,
            asOf: marketData?.asOf || null,
            staleDays: marketData?.staleDays ?? null,
            freshnessLabel: marketData?.freshnessLabel || null,
          }));
        }

        if (tick === 2 && dashboard.alerts[0]) {
          controller.enqueue(sse("alert_created", {
            alert: dashboard.alerts[0],
            at: new Date().toISOString(),
          }));
        }
      }, config.streamIntervalMs);

      this.interval = interval;
    },
    cancel() {
      if (this.interval) clearInterval(this.interval);
    },
  });
}

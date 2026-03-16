import { getServerConfig } from "./config.js";
import { getWorkspaceDashboard } from "./dashboard-service.js";

const encoder = new TextEncoder();

function sse(event, payload) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function createWorkspaceStream(workspaceId) {
  const config = getServerConfig();
  const dashboard = await getWorkspaceDashboard(workspaceId);

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

      let tick = 0;
      const interval = setInterval(() => {
        tick += 1;
        const instrument = dashboard.market_ribbon[tick % dashboard.market_ribbon.length];
        const drift = ((tick % 2 === 0 ? 1 : -1) * 0.0009) + (tick * 0.0001);
        controller.enqueue(sse("quote_update", {
          symbol: instrument.symbol,
          price: instrument.price ? Number((instrument.price * (1 + drift)).toFixed(2)) : null,
          changePct: Number(((instrument.changePct || 0) + drift).toFixed(4)),
          at: new Date().toISOString(),
        }));

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

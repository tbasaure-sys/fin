import { getServerConfig } from "./config.js";
import { getWorkspaceDashboard } from "./dashboard-service.js";

const encoder = new TextEncoder();

function sse(event, payload) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function createWorkspaceStream(workspaceId) {
  const config = getServerConfig();
  let intervalId = null;
  let isClosed = false;

  return new ReadableStream({
    async start(controller) {
      let heartbeatCount = 0;
      let lastUpdated = null;
      let lastBackendStatus = null;
      let lastFreshnessLabel = null;

      const emit = (event, payload) => {
        if (isClosed) return;
        controller.enqueue(sse(event, payload));
      };

      const snapshotMeta = (dashboard) => ({
        workspaceId,
        generatedAt: dashboard?.workspace_summary?.last_updated || null,
        backendStatus: dashboard?.workspace_summary?.backend_status || null,
        freshnessLabel: dashboard?.data_control?.marketData?.freshnessLabel || null,
        marketDataAsOf: dashboard?.data_control?.marketData?.asOf || null,
      });

      const publishSnapshot = async () => {
        try {
          const dashboard = await getWorkspaceDashboard(workspaceId);
          const meta = snapshotMeta(dashboard);

          if (lastUpdated === null) {
            lastUpdated = meta.generatedAt;
            lastBackendStatus = meta.backendStatus;
            lastFreshnessLabel = meta.freshnessLabel;
            emit("workspace_snapshot", meta);
            emit("freshness_changed", meta);
            return;
          }

          if (meta.backendStatus === "briefing" && lastBackendStatus !== "briefing") {
            emit("refresh_started", meta);
          }

          const snapshotChanged =
            meta.generatedAt !== lastUpdated ||
            meta.freshnessLabel !== lastFreshnessLabel ||
            meta.backendStatus !== lastBackendStatus;

          if (snapshotChanged) {
            emit("workspace_snapshot", meta);
            emit("freshness_changed", meta);
          }

          if (meta.generatedAt !== lastUpdated && meta.backendStatus !== "briefing") {
            emit("refresh_completed", meta);
          }

          lastUpdated = meta.generatedAt;
          lastBackendStatus = meta.backendStatus;
          lastFreshnessLabel = meta.freshnessLabel;
        } catch (error) {
          emit("refresh_failed", {
            workspaceId,
            message: String(error?.message || error || "Workspace stream refresh failed."),
          });
        }
      };

      emit("connection_state_changed", {
        state: "connected",
        workspaceId,
        connectedAt: new Date().toISOString(),
      });

      await publishSnapshot();

      intervalId = setInterval(() => {
        heartbeatCount += 1;
        if (heartbeatCount % 4 === 0) {
          emit("connection_state_changed", {
            state: "heartbeat",
            workspaceId,
            at: new Date().toISOString(),
          });
        }
        void publishSnapshot();
      }, config.streamIntervalMs);
    },
    cancel() {
      isClosed = true;
      if (intervalId) clearInterval(intervalId);
    },
  });
}

"use client";

import { useEffect, useRef, useState } from "react";

export async function parseResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function sanitizeLiveDetail(message, fallback) {
  const text = String(message || "").trim();
  if (!text) return fallback;
  if (/runtime bootstrap|market:|alpha_volume_panel|fred request failed|internal server error|pipeline|traceback|exception|stack trace|\/api\/|railway|backend snapshot/i.test(text)) {
    return fallback;
  }
  return text;
}

export function useWorkspaceLiveData({ initialDashboard, workspaceId }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [connection, setConnection] = useState({
    status: "connecting",
    label: "Connecting live data",
    detail: "Opening the live workspace channel.",
  });
  const lastEventRef = useRef(Date.now());

  useEffect(() => {
    setDashboard(initialDashboard);
  }, [initialDashboard]);

  async function refreshSnapshot() {
    if (!workspaceId) return dashboard;
    const response = await fetch(`/api/v1/workspaces/${workspaceId}/workspace`, { cache: "no-store" });
    const payload = await parseResponse(response);
    setDashboard(payload);
    lastEventRef.current = Date.now();
    return payload;
  }

  useEffect(() => {
    if (!workspaceId) return undefined;

    let isActive = true;
    let stream = null;
    let pollTimer = null;

    const setLive = (status, label, detail) => {
      if (!isActive) return;
      setConnection({ status, label, detail });
    };

    const triggerRefresh = async () => {
      try {
        await refreshSnapshot();
      } catch {
        // Keep the current snapshot if a background refresh fails.
      }
    };

    const connect = () => {
      stream = new EventSource(`/api/v1/workspaces/${workspaceId}/stream`);

      stream.addEventListener("open", () => {
        setLive("live", "Live sync on", "Listening for fresh market and workspace updates.");
      });

      for (const eventName of ["workspace_snapshot", "refresh_completed", "freshness_changed"]) {
        stream.addEventListener(eventName, () => {
          lastEventRef.current = Date.now();
          setLive("live", "Syncing latest session", "A newer market session was detected. Updating the workspace.");
          void triggerRefresh();
        });
      }

      stream.addEventListener("refresh_started", () => {
        lastEventRef.current = Date.now();
        setLive("polling", "Refreshing live data", "Pulling the newest market session into the workspace.");
      });

      stream.addEventListener("refresh_failed", (event) => {
        lastEventRef.current = Date.now();
        let detail = "The latest market session is still catching up. Using the last completed snapshot for now.";
        try {
          const payload = JSON.parse(event.data);
          if (payload?.message) {
            detail = sanitizeLiveDetail(
              payload.message,
              "The latest market session is still catching up. Using the last completed snapshot for now.",
            );
          }
        } catch {
          // Ignore malformed event payloads.
        }
        setLive("warn", "Using last completed session", detail);
      });

      stream.onerror = () => {
        if (!isActive) return;
        setLive("polling", "Live sync paused", "The live channel dropped. Keeping the workspace updated with periodic checks.");
        stream?.close();
        stream = null;
      };
    };

    connect();

    pollTimer = window.setInterval(() => {
      const staleForMs = Date.now() - lastEventRef.current;
      if (staleForMs < 90000 && stream) return;
      void triggerRefresh();
    }, 90000);

    return () => {
      isActive = false;
      if (pollTimer) window.clearInterval(pollTimer);
      stream?.close();
    };
  }, [workspaceId]);

  return {
    connection,
    dashboard,
    refreshSnapshot,
    setDashboard,
  };
}

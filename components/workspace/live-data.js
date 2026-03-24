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

export function useWorkspaceLiveData({ initialDashboard, workspaceId }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [connection, setConnection] = useState({
    status: "connecting",
    label: "Connecting",
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
        setLive("live", "Live channel active", "Listening for workspace freshness updates.");
      });

      for (const eventName of ["workspace_snapshot", "refresh_completed", "freshness_changed"]) {
        stream.addEventListener(eventName, () => {
          lastEventRef.current = Date.now();
          setLive("live", "Live channel active", "Workspace freshness changed. Syncing the latest snapshot.");
          void triggerRefresh();
        });
      }

      stream.addEventListener("refresh_started", () => {
        lastEventRef.current = Date.now();
        setLive("polling", "Refresh running", "The backend is rebuilding the latest analysis snapshot.");
      });

      stream.addEventListener("refresh_failed", (event) => {
        lastEventRef.current = Date.now();
        let detail = "Live refresh failed. Falling back to snapshot polling.";
        try {
          const payload = JSON.parse(event.data);
          if (payload?.message) detail = payload.message;
        } catch {
          // Ignore malformed event payloads.
        }
        setLive("warn", "Polling fallback", detail);
      });

      stream.onerror = () => {
        if (!isActive) return;
        setLive("polling", "Polling fallback", "The live channel dropped. Using timed workspace polling until it recovers.");
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

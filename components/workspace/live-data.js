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
    label: "Conectando datos",
    detail: "Abriendo el canal del espacio.",
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
    let reconnectTimer = null;
    let reconnectAttempt = 0;

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

    const scheduleReconnect = () => {
      if (!isActive || reconnectTimer) return;
      const delayMs = Math.min(30000, 1500 * (2 ** reconnectAttempt));
      reconnectAttempt += 1;
      setLive(
        "polling",
        "Reconectando datos",
        "El canal en vivo se cortó. El espacio seguirá revisando cambios y reintentará la conexión automáticamente.",
      );
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (!isActive) return;
        connect();
        void triggerRefresh();
      }, delayMs);
    };

    const connect = () => {
      if (!isActive || stream) return;
      stream = new EventSource(`/api/v1/workspaces/${workspaceId}/stream`);

      stream.addEventListener("open", () => {
        reconnectAttempt = 0;
        setLive("live", "Sincronización activa", "Escuchando cambios de mercado y del espacio.");
      });

      for (const eventName of ["workspace_snapshot", "refresh_completed", "freshness_changed"]) {
        stream.addEventListener(eventName, () => {
          lastEventRef.current = Date.now();
          setLive("live", "Actualizando sesión", "Se detectó una sesión de mercado más reciente.");
          void triggerRefresh();
        });
      }

      stream.addEventListener("refresh_started", () => {
        lastEventRef.current = Date.now();
        setLive("polling", "Actualizando datos", "Trayendo la sesión de mercado más reciente.");
      });

      stream.addEventListener("refresh_failed", (event) => {
        lastEventRef.current = Date.now();
        let detail = "La última sesión de mercado todavía se está cargando. Por ahora se usa la sesión completa anterior.";
        try {
          const payload = JSON.parse(event.data);
          if (payload?.message) {
            detail = sanitizeLiveDetail(
              payload.message,
              "La última sesión de mercado todavía se está cargando. Por ahora se usa la sesión completa anterior.",
            );
          }
        } catch {
          // Ignore malformed event payloads.
        }
        setLive("warn", "Usando sesión anterior", detail);
      });

      stream.onerror = () => {
        if (!isActive) return;
        stream?.close();
        stream = null;
        scheduleReconnect();
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
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
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

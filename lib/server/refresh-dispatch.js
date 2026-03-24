import { triggerBackendRefresh } from "./backend";

export async function queueWorkspaceRefresh(source = "manual") {
  const startedAt = new Date().toISOString();

  void triggerBackendRefresh().catch((error) => {
    console.error(`Background refresh failed (${source})`, error);
  });

  return {
    ok: true,
    queued: true,
    startedAt,
    source,
    message: "Live refresh started in the background.",
  };
}

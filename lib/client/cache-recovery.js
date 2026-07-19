export function buildCacheRecoveryScript(version) {
  const serializedVersion = JSON.stringify(String(version || ""));

  return `
    (() => {
      const VERSION = ${serializedVersion};
      const SESSION_KEY = "__bls_cache_recovery_attempt__";
      const QUERY_FLAG = "cache_recovered";

      const recoveryAttempted = () => {
        try {
          return window.sessionStorage.getItem(SESSION_KEY) === VERSION;
        } catch {
          return false;
        }
      };

      const markRecoveryAttempted = () => {
        try {
          window.sessionStorage.setItem(SESSION_KEY, VERSION);
        } catch {}
      };

      const isChunkLoadFailure = (reason, event) => {
        const targetUrl = event?.target?.src || event?.target?.href || "";
        const isNextAsset = targetUrl.includes("/_next/static/chunks/") || targetUrl.includes("/_next/static/css/");
        if (isNextAsset) return true;

        const message = [reason?.name, reason?.message, String(reason || "")].filter(Boolean).join(" ");
        return /ChunkLoadError|Loading (?:CSS )?chunk .* failed|CSS_CHUNK_LOAD_FAILED|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
      };

      const cleanupClientCaches = async () => {
        try {
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
          }
        } catch {}

        try {
          if ("caches" in window) {
            const cacheKeys = await window.caches.keys();
            await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey).catch(() => false)));
          }
        } catch {}
      };

      const normalizeUrl = () => {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has(QUERY_FLAG)) {
            url.searchParams.delete(QUERY_FLAG);
            window.history.replaceState({}, "", url.toString());
          }
        } catch {}
      };

      const recover = async () => {
        if (recoveryAttempted()) return;
        markRecoveryAttempted();
        await cleanupClientCaches();

        try {
          const url = new URL(window.location.href);
          if (!url.searchParams.has(QUERY_FLAG)) {
            url.searchParams.set(QUERY_FLAG, "1");
            window.location.replace(url.toString());
            return;
          }
        } catch {}

        normalizeUrl();
      };

      const handleLoadFailure = (event) => {
        const reason = event?.reason || event?.error || event?.message;
        if (isChunkLoadFailure(reason, event)) void recover();
      };

      normalizeUrl();
      window.addEventListener("error", handleLoadFailure, true);
      window.addEventListener("unhandledrejection", handleLoadFailure);
    })();
  `;
}

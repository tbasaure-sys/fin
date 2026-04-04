import "./globals.css";

const appName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "Allocator Workspace";
const cacheRecoveryVersion = "2026-04-03-v1";

export const metadata = {
  title: appName,
  description: "A private investment workspace that puts your portfolio, market context, and decision support in one place.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const VERSION = ${JSON.stringify(cacheRecoveryVersion)};
                const KEY = "__bls_cache_recovery__";
                const QUERY_FLAG = "cache_recovered";

                const markRecovered = () => {
                  try {
                    window.localStorage.setItem(KEY, VERSION);
                  } catch {}
                };

                const alreadyRecovered = () => {
                  try {
                    return window.localStorage.getItem(KEY) === VERSION;
                  } catch {
                    return false;
                  }
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

                  try {
                    window.sessionStorage.clear();
                  } catch {}

                  try {
                    window.localStorage.clear();
                  } catch {}

                  markRecovered();
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

                const run = async () => {
                  if (alreadyRecovered()) {
                    normalizeUrl();
                    return;
                  }

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

                void run();
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

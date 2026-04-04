export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const recoveryHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BLS Prime Recovery</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #08111d;
        color: #f4f7fb;
        font-family: Arial, sans-serif;
      }
      main {
        max-width: 540px;
        padding: 28px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        line-height: 1.6;
      }
      small {
        color: rgba(255, 255, 255, 0.7);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Recovering browser cache</h1>
      <p>We are clearing stale local cache and browser storage for this site, then sending you back to login.</p>
      <small>If this page stays open for more than a few seconds, refresh once and try again.</small>
    </main>
    <script>
      (async () => {
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

        window.setTimeout(() => {
          window.location.replace("/login?recovered=1");
        }, 600);
      })();
    </script>
  </body>
</html>`;

export function GET() {
  return new Response(recoveryHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      "Clear-Site-Data": "\"cache\", \"storage\"",
    },
  });
}

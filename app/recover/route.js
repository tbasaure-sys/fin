export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sharedStyles = [
  "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#08111d;color:#f4f7fb;font-family:Arial,sans-serif}",
  "main{max-width:600px;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04)}",
  "h1{margin:0 0 12px;font-size:30px}",
  "p{line-height:1.65;color:rgba(244,247,251,.82)}",
  ".actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}",
  "a{display:inline-flex;min-height:44px;align-items:center;padding:0 18px;border:1px solid rgba(255,255,255,.16);color:#f4f7fb;text-decoration:none}",
  "a.primary{background:#f4f0e7;color:#08111d;border-color:#f4f0e7;font-weight:700}",
  "small{display:block;margin-top:18px;color:rgba(255,255,255,.62);line-height:1.5}",
].join("");

function documentShell(body, script = "") {
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="robots" content="noindex,nofollow" />',
    "<title>BLS Prime Recovery</title>",
    "<style>" + sharedStyles + "</style>",
    "</head>",
    "<body>",
    body,
    script,
    "</body>",
    "</html>",
  ].join("\n");
}

function previewHtml() {
  return documentShell([
    "<main>",
    "<h1>Recuperar BLS Prime</h1>",
    "<p>Esta herramienta desregistra service workers, limpia caches del sitio y elimina estado local de la sesión. Conserva tu preferencia de idioma.</p>",
    "<p>This tool unregisters service workers, clears site caches, and removes local session state. It preserves your language preference.</p>",
    '<div class="actions">',
    '<a class="primary" href="/recover?confirm=1">Limpiar y continuar</a>',
    '<a href="/">Volver sin borrar / Go back without clearing</a>',
    "</div>",
    "<small>Usa esta opción solo si la aplicación quedó atrapada en una versión antigua o no carga fuera de modo incógnito.</small>",
    "</main>",
  ].join("\n"));
}

function confirmedHtml() {
  const script = [
    "<script>",
    "(async () => {",
    'const LANGUAGE_KEY = "blsprime_language_preference";',
    "let preferredLanguage = null;",
    "try { preferredLanguage = window.localStorage.getItem(LANGUAGE_KEY); } catch {}",
    'try { if ("serviceWorker" in navigator) {',
    "const registrations = await navigator.serviceWorker.getRegistrations();",
    "await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));",
    "} } catch {}",
    'try { if ("caches" in window) {',
    "const cacheKeys = await window.caches.keys();",
    "await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey).catch(() => false)));",
    "} } catch {}",
    "try { window.sessionStorage.clear(); } catch {}",
    "try {",
    "window.localStorage.clear();",
    "if (preferredLanguage) window.localStorage.setItem(LANGUAGE_KEY, preferredLanguage);",
    '} catch {}',
    'window.location.replace("/aurora?recovered=1");',
    "})();",
    "</script>",
  ].join("\n");

  return documentShell([
    "<main>",
    "<h1>Recuperando el navegador</h1>",
    "<p>La limpieza fue confirmada. BLS Prime volverá a abrir AURORA cuando termine.</p>",
    "<small>Si esta página no avanza, vuelve a cargar una vez.</small>",
    "</main>",
  ].join("\n"), script);
}

export function GET(request) {
  const confirmed = new URL(request.url).searchParams.get("confirm") === "1";
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
    "X-Robots-Tag": "noindex, nofollow",
  };

  if (confirmed) headers["Clear-Site-Data"] = '"cache"';

  return new Response(confirmed ? confirmedHtml() : previewHtml(), {
    status: 200,
    headers,
  });
}

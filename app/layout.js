import "./globals.css";
import { headers } from "next/headers";
import { LanguageLayer } from "@/components/language-layer";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

const rawAppName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const appName = /allocator workspace/i.test(rawAppName) ? "BLS Prime" : rawAppName;
const cacheRecoveryVersion = "2026-07-09-trust-v1";
const appDescription =
  "An institutional equity research terminal connecting valuation, factor discovery, portfolio stress, and auditable decision memory.";
const rawPublicAppUrl = process.env.BLS_PRIME_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.blsprime.com";
const publicAppUrl = (/^[a-z][a-z\d+.-]*:\/\//i.test(rawPublicAppUrl) ? rawPublicAppUrl : `https://${rawPublicAppUrl}`).replace(/\/$/, "");

export const metadata = {
  metadataBase: new URL(publicAppUrl),
  title: {
    default: `${appName} | Institutional Equity Research Terminal`,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  openGraph: {
    type: "website",
    siteName: appName,
    title: `${appName} | Institutional Equity Research Terminal`,
    description: appDescription,
    images: [{ url: "/images/bls-prime-command-center.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${appName} | Institutional Equity Research Terminal`,
    description: appDescription,
    images: ["/images/bls-prime-command-center.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: appName,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#0b0f16",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  const requestLocale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return (
    <html lang={requestLocale}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const VERSION = ${JSON.stringify(cacheRecoveryVersion)};
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
                  if (targetUrl && /\/_next\/static\/(?:chunks|css)\//i.test(targetUrl)) return true;

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
      <body>
        <LanguageLayer initialLanguage={requestLocale} />
        {children}
      </body>
    </html>
  );
}

import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/400-italic.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";
import "./globals.css";
import { headers } from "next/headers";
import { LanguageLayer } from "@/components/language-layer";
import {ProductMeasurement} from '@/components/product-measurement';
import { SiteFooter } from "@/components/public-shell/site-footer";
import { buildCacheRecoveryScript } from "@/lib/client/cache-recovery";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

const rawAppName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const appName = /allocator workspace/i.test(rawAppName) ? "BLS Prime" : rawAppName;
const cacheRecoveryVersion = "2026-07-09-trust-v1";
const APP_COPY = {
  es: {
    tagline: "Espacio de decisión de inversión",
    description:
      "Valoración, búsqueda de oportunidades y riesgo de cartera en un solo proceso, con datos fechados y supuestos visibles.",
  },
  en: {
    tagline: "Investment decision workspace",
    description:
      "Valuation, opportunity discovery, and portfolio risk in a single process, with dated data and visible assumptions.",
  },
};
const rawPublicAppUrl = process.env.BLS_PRIME_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.blsprime.com";
const publicAppUrl = (/^[a-z][a-z\d+.-]*:\/\//i.test(rawPublicAppUrl) ? rawPublicAppUrl : `https://${rawPublicAppUrl}`).replace(/\/$/, "");

export function generateMetadata() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const copy = APP_COPY[locale];
  const title = `${appName} | ${copy.tagline}`;

  return {
    metadataBase: new URL(publicAppUrl),
    title: {
      default: title,
      template: `%s | ${appName}`,
    },
    description: copy.description,
    applicationName: appName,
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "es_ES",
      siteName: appName,
      title,
      description: copy.description,
      images: [{ url: "/images/bls-prime-command-center.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: copy.description,
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
}

export const viewport = {
  themeColor: "#0c120e",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  const requestLocale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return (
    <html lang={requestLocale}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: buildCacheRecoveryScript(cacheRecoveryVersion),
          }}
        />
      </head>
      <body>
        <LanguageLayer initialLanguage={requestLocale} />
        {children}
        <SiteFooter initialLanguage={requestLocale} />
        <ProductMeasurement />
      </body>
    </html>
  );
}

import { headers } from "next/headers";
import { PublicSiteHeader } from "@/components/public-shell/public-site-header";

import { BreakpointHero } from "@/components/breakpoint/breakpoint-hero";
import styles from "@/components/breakpoint/breakpoint.module.css";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default function BreakpointTickerPage({ params }) {
  const rawTicker = String(params?.ticker || "").trim().toUpperCase();
  const initialTicker = /^[A-Z][A-Z0-9.-]{0,9}$/.test(rawTicker) ? rawTicker : "";
  const language = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return <><PublicSiteHeader initialLanguage={language} /><main className={styles.resultShell}><BreakpointHero initialTicker={initialTicker} language={language} /></main></>;
}

import { headers } from "next/headers";
import Link from "next/link";

import { BreakpointHero } from "@/components/breakpoint/breakpoint-hero";
import styles from "@/components/breakpoint/breakpoint.module.css";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default function BreakpointTickerPage() {
  const language = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return <main className={styles.resultShell}><header className={styles.resultTop}><Link href={`/?lang=${language}`} className={styles.wordmark}>BLS Prime</Link></header><BreakpointHero language={language} /></main>;
}

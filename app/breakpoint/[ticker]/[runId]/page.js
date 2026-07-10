import { headers } from "next/headers";

import { BreakpointResult } from "@/components/breakpoint/breakpoint-result";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const ticker = String(params?.ticker || "equity").toUpperCase();
  return {
    title: `${ticker} Breakpoint`,
    description: `What ${ticker} must deliver for today's market price to hold under BLS Prime's auditable research surface.`,
    alternates: { canonical: `/breakpoint/${encodeURIComponent(ticker)}/${encodeURIComponent(params?.runId || "run")}` },
  };
}

export default function BreakpointRunPage({ params }) {
  const language = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  return <BreakpointResult runId={params?.runId} language={language} />;
}

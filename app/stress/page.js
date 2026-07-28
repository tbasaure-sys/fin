import { headers } from "next/headers";

import { StressEnginePublicPage } from "@/components/stress-engine-public-page";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const metadata = {
  title: "Portfolio Stress Engine",
  description:
    "Regime-conditioned portfolio stress testing with synthetic paths, CVaR, drawdown probability, tail attribution, and visible model gates.",
  alternates: { canonical: "/stress" },
};

export default function StressPage() {
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return <StressEnginePublicPage initialLanguage={initialLanguage} />;
}

import { StressEnginePublicPage } from "@/components/stress-engine-public-page";

export const metadata = {
  title: "Portfolio Stress Engine",
  description:
    "Regime-conditioned portfolio stress testing with synthetic paths, CVaR, drawdown probability, tail attribution, and visible model gates.",
  alternates: { canonical: "/stress" },
};

export default function StressPage() {
  return <StressEnginePublicPage />;
}

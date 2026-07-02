import { StressEnginePublicPage } from "@/components/stress-engine-public-page";

export const metadata = {
  title: "Stress Engine | BLS Prime",
  description:
    "Regime-conditioned portfolio stress testing with synthetic paths, CVaR, drawdown probability, tail attribution, and visible model gates.",
};

export default function StressPage() {
  return <StressEnginePublicPage />;
}

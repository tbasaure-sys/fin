import ValuationOsLabPage from "@/app/valuation-os-lab/page";

export const metadata = {
  title: "AURORA Valuation Engine",
  description:
    "Auditable intrinsic-value research with explicit assumptions, bear/base/bull ranges, ROIC, free cash flow, and margin of safety.",
  alternates: { canonical: "/aurora" },
};

export default function AuroraPage() {
  return <ValuationOsLabPage />;
}

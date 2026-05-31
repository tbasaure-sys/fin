import { FactorLabWorkstation } from "@/components/factorlab-workstation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FactorLab | BLS Prime",
  description:
    "Point-in-time factor screening workspace for deterministic candidate ranking and structured refusals.",
};

export default function FactorLabPage() {
  return (
    <main className="factorlab-route">
      <FactorLabWorkstation />
    </main>
  );
}

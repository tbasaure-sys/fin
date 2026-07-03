import { FactorLabWorkstation } from "@/components/factorlab-workstation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FactorLab | BLS Prime",
  description:
    "Point-in-time discovery workspace for neglected asymmetric opportunities, red-flag gates, and structured research queues.",
};

export default function FactorLabPage() {
  return (
    <main className="factorlab-route">
      <FactorLabWorkstation />
    </main>
  );
}

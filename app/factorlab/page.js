import { FactorLabWorkstation } from "@/components/factorlab-workstation";
import { headers } from "next/headers";

import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FactorLab Discovery Engine",
  description:
    "Point-in-time discovery workspace for neglected asymmetric opportunities, red-flag gates, and structured research queues.",
  alternates: { canonical: "/factorlab" },
};

export default function FactorLabPage() {
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return (
    <main className="factorlab-route">
      <FactorLabWorkstation initialLanguage={initialLanguage} />
    </main>
  );
}

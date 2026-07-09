import { headers } from "next/headers";
import { PublicHomeExperience } from "@/components/public-home-experience";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "BLS Prime | Institutional Equity Research Terminal" },
  description:
    "Connect valuation, factor discovery, portfolio stress, and an auditable investment decision trail in one research cockpit.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const config = getServerConfig();
  const publicBrand = /allocator workspace/i.test(config.appName) ? "BLS Prime" : config.appName;
  const initialLanguage = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");

  return <PublicHomeExperience brand={publicBrand} initialLanguage={initialLanguage} />;
}

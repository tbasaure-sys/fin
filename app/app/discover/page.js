import { headers } from "next/headers";

import { FactorLabWorkstation } from "@/components/factorlab-workstation";
import { buildFactorLabSharePath, parseFactorLabFilters } from "@/lib/factorlab-workspace";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import { requireServerAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FactorLab | BLS Prime",
  robots: { index: false, follow: false },
};

export default async function PrivateFactorLabPage({ searchParams }) {
  const initialLanguage = normalizeLocale(searchParams?.lang || headers().get(LANGUAGE_REQUEST_HEADER), "es");
  const initialFilters = parseFactorLabFilters(searchParams);
  const nextPath = buildFactorLabSharePath(initialFilters, initialLanguage, "/app/discover");
  const authSession = await requireServerAuthSession(nextPath);

  return (
    <FactorLabWorkstation
      initialFilters={initialFilters}
      initialLanguage={initialLanguage}
      publicMode={false}
      workspaceId={authSession.workspace.id}
    />
  );
}

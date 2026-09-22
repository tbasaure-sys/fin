import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/server/auth/session";
import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";
import { ResearchWorkspace } from "@/components/research/research-workspace";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Investigación de empresas",
  description:
    "Cifras financieras, documentos originales, comparaciones, tesis y valoración en un solo espacio.",
};
export default async function ResearchPage({ searchParams = {} }) {
  const language = normalizeLocale(
    headers().get(LANGUAGE_REQUEST_HEADER),
    "es",
  );
  const next = new URLSearchParams({ lang: language });
  if (typeof searchParams.ticker === "string") next.set("ticker", searchParams.ticker);
  if(searchParams.view==="thesis")next.set("view","thesis");
  if(searchParams.view==="news") {next.set("view","news");if(["stock","portfolio","market","watchlist"].includes(searchParams.scope))next.set("scope",searchParams.scope);}
  if (!await getServerAuthSession()) {
    redirect(`/login?intent=signin&lang=${language}&next=${encodeURIComponent(`/research?${next}`)}`);
  }
  return (
    <ResearchWorkspace
      key={`${searchParams.ticker || ""}:${searchParams.view || ""}:${searchParams.scope || ""}`}
      initialView={["news","thesis"].includes(searchParams.view)?searchParams.view:"overview"}
      initialScope={["stock","portfolio","market","watchlist"].includes(searchParams.scope)?searchParams.scope:"stock"}
      initialLanguage={language}
      ticker={
        typeof searchParams.ticker === "string" ? searchParams.ticker.trim().toUpperCase() : ""
      }
    />
  );
}

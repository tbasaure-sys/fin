import CompanyDecisionWorkspace from "@/components/company-decision-workspace";
import { requireServerAuthSession } from "@/lib/server/auth/session";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

function cleanTicker(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 16) || "EMPRESA";
}
export default async function PrivateCompanyPage({ params }) {
  const ticker = cleanTicker(params?.ticker);
  const nextPath = `/app/company/${encodeURIComponent(ticker)}`;
  const authSession = await requireServerAuthSession(nextPath);

  return (
    <div className={styles.route}>
      <header className={styles.privateHeader}>
        <a href="/app#aurora"><strong>BLS Prime</strong><span>Company decision workspace</span></a>
        <nav aria-label="Navegación del workspace"><a href="/app#aurora">AURORA</a><a href="/app#holdings">Portafolio</a></nav>
      </header>
      <CompanyDecisionWorkspace publicMode={false} ticker={ticker} workspaceId={authSession.workspace.id} />
    </div>
  );
}

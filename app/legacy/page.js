import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function LegacyPage() {
  const { backendBaseUrl } = getServerConfig();

  return (
    <main className="legacy-shell">
      <div className="legacy-header">
        <div>
          <p className="eyebrow">Legacy Surface</p>
          <h1>Classic Workstation</h1>
        </div>
        <a className="legacy-link" href={backendBaseUrl} target="_blank" rel="noreferrer">
          Open Railway dashboard
        </a>
      </div>
      <div className="legacy-frame">
        <iframe title="Legacy BLS Prime dashboard" src={backendBaseUrl} />
      </div>
    </main>
  );
}


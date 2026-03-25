import { requireServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default async function LegacyPage() {
  await requireServerAuthSession("/legacy");
  const { appName, backendBaseUrl } = getServerConfig();

  return (
    <main className="legacy-shell">
      <div className="legacy-header">
        <div>
          <p className="eyebrow">Legacy Workspace</p>
          <h1>Classic {appName} surface</h1>
        </div>
        <a className="legacy-link" href={backendBaseUrl} target="_blank" rel="noreferrer">
          Open legacy dashboard
        </a>
      </div>
      <p className="legacy-note">
        This keeps the older workstation available for comparison and continuity while the upgraded interface becomes the main experience.
      </p>
      <div className="legacy-frame">
        <iframe title={`Legacy ${appName} dashboard`} src={backendBaseUrl} />
      </div>
    </main>
  );
}

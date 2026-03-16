import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function AccessPage() {
  const config = getServerConfig();

  return (
    <main className="access-shell">
      <div className="access-card">
        <p className="eyebrow">Private Alpha</p>
        <h1>BLS Prime is running behind a shared access link.</h1>
        <p className="access-copy">
          This alpha does not use full account auth yet. Access is granted through a private invitation URL,
          and once opened the session stays active on this browser.
        </p>
        <div className="access-grid">
          <div className="access-panel">
            <span>Access model</span>
            <strong>Private link only</strong>
          </div>
          <div className="access-panel">
            <span>Workspace mode</span>
            <strong>{config.alphaMode}</strong>
          </div>
        </div>
        <div className="access-note">
          <strong>Need a fresh link?</strong>
          <span>Contact {config.inviteContact} and ask for the current BLS Prime alpha invitation.</span>
        </div>
      </div>
    </main>
  );
}

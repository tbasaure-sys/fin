import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function AccessPage() {
  const config = getServerConfig();

  return (
    <main className="access-shell">
      <div className="access-card">
        <p className="eyebrow">Private Access</p>
        <h1>BLS Prime is shared through a private invitation link.</h1>
        <p className="access-copy">
          This workspace is still in alpha, so it uses a private link instead of full account sign-in.
          Once the link is opened on this browser, the session remains active here.
        </p>
        <div className="access-grid">
          <div className="access-panel">
            <span>How access works</span>
            <strong>Private invitation link</strong>
          </div>
          <div className="access-panel">
            <span>Workspace mode</span>
            <strong>{config.alphaMode}</strong>
          </div>
        </div>
        <div className="access-note">
          <strong>Need a fresh invitation?</strong>
          <span>Contact {config.inviteContact} and ask for the latest BLS Prime access link.</span>
        </div>
      </div>
    </main>
  );
}

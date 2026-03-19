import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerAuthSession();

  return (
    <main className="access-shell">
      <div className="access-card marketing-card">
        <p className="eyebrow">BLS Prime</p>
        <h1>Clear portfolio decisions, with the real workspace kept private.</h1>
        <p className="access-copy">
          The public site explains the product. The private workspace holds your portfolio, your watchlist, your holdings updates, and your portfolio-specific guidance.
        </p>
        <div className="access-grid">
          <div className="access-panel">
            <span>Public</span>
            <strong>Product overview</strong>
          </div>
          <div className="access-panel">
            <span>Private</span>
            <strong>Your workspace</strong>
          </div>
        </div>
        <div className="hero-cta-row">
          <Link className="primary-button" href={session ? "/app" : "/login"}>
            {session ? "Open workspace" : "Member sign in"}
          </Link>
          <Link className="ghost-button" href="/legacy">Legacy</Link>
        </div>
        {session ? (
          <form method="post" action="/api/auth/logout">
            <button className="ghost-button" type="submit">Sign out</button>
          </form>
        ) : null}
      </div>
    </main>
  );
}

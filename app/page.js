import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerAuthSession();

  return (
    <main className="brand-page">
      <section className="landing-hero">
        <div className="landing-visual-plane" aria-hidden="true">
          <div className="landing-visual-grid" />
          <div className="landing-visual-scan" />
          <div className="landing-visual-orbit" />
        </div>

        <div className="landing-shell">
          <header className="landing-header">
            <Link className="brand-lockup" href="/">
              <span className="brand-lockup-name">BLS Prime</span>
            </Link>
            <div className="hero-cta-row">
              {session ? (
                <form method="post" action="/api/auth/logout">
                  <button className="ghost-button" type="submit">Sign out</button>
                </form>
              ) : null}
            </div>
          </header>

          <div className="landing-copy">
            <p className="landing-kicker">Private portfolio workspace</p>
            <p className="brand-wordmark">BLS Prime</p>
            <h1>See what to do with your portfolio before you add risk.</h1>
            <p className="landing-support">
              A private workspace for clear portfolio decisions, live market pressure, and the next move worth making.
            </p>
            <div className="hero-cta-row">
              <Link className="primary-button" href={session ? "/app" : "/login"}>
                {session ? "Open workspace" : "Enter private workspace"}
              </Link>
              <Link className="ghost-button" href="/login">Member sign in</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

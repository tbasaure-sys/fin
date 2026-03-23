import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerAuthSession();

  return (
    <main className="brand-page decision-brand-page">
      <section className="decision-landing-hero">
        <div className="decision-landing-backdrop" aria-hidden="true">
          <div className="decision-landing-photo" />
          <div className="decision-landing-scan" />
        </div>

        <header className="decision-landing-header">
          <Link className="brand-lockup" href="/">
            <span className="brand-lockup-name">BLS Prime</span>
          </Link>

          <div className="hero-cta-row">
            {session ? (
              <form action="/api/auth/logout" method="post">
                <button className="ghost-button" type="submit">Sign out</button>
              </form>
            ) : (
              <Link className="ghost-button" href="/login">Member sign in</Link>
            )}
          </div>
        </header>

        <div className="decision-landing-composition">
          <div className="decision-landing-copy">
            <p className="landing-kicker">Decision OS for capital under uncertainty</p>
            <p className="brand-wordmark">BLS Prime</p>
            <h1>Operate your portfolio with one clear daily surface.</h1>
            <p className="landing-support">
              Keep the private book current, know what to do today, and stage decisions before you act.
            </p>
            <div className="hero-cta-row">
              <Link className="primary-button" href={session ? "/app" : "/login"}>
                {session ? "Open workspace" : "Open workspace"}
              </Link>
              <Link className="ghost-button" href={session ? "/app" : "/login"}>{session ? "View portfolio" : "Member sign in"}</Link>
            </div>
            <p className="landing-plan-caption">
              {session ? "Your private workspace is ready." : "Simple sign in, private workspace, everything available from day one."}
            </p>
          </div>
        </div>
      </section>

      <section className="decision-landing-strip">
        <article>
          <span className="support-label">Private portfolio</span>
          <p>See the real book, top positions, live holdings updates, and the stored history behind it.</p>
        </article>
        <article>
          <span className="support-label">Today&apos;s decision</span>
          <p>One serious daily call: what to do now, why, and what would need to change before you widen risk.</p>
        </article>
        <article>
          <span className="support-label">Staged actions</span>
          <p>Prepare trades, keep them queued, and build a private decision log without forcing action too early.</p>
        </article>
      </section>
    </main>
  );
}

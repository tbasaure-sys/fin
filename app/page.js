import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

const FRONTIER_VISUAL = [
  {
    id: "unlocked",
    label: "Unlocked",
    lines: [
      "Stage only the repairs that already cleared legitimacy.",
      "Size stays earned, never assumed.",
    ],
  },
  {
    id: "staged",
    label: "Staged",
    lines: [
      "Escrow holds the option while the state proves itself.",
      "Recovery must improve before conviction grows.",
    ],
  },
  {
    id: "illegitimate",
    label: "Illegitimate",
    lines: [
      "Tempting risk stays visible instead of getting rationalized away.",
      "Every blocked move carries an explicit disproof path.",
    ],
  },
];

export default async function HomePage() {
  const session = await getServerAuthSession();

  return (
    <main className="brand-page decision-brand-page">
      <section className="decision-landing-hero">
        <div className="decision-landing-backdrop" aria-hidden="true">
          <div className="decision-landing-grid" />
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
            <h1>The decision surface for your live portfolio.</h1>
            <p className="landing-support">
              BLS Prime turns your live book, the market state, and your own decision memory into one serious operating system for action, restraint, and staged conviction.
            </p>
            <div className="hero-cta-row">
              <Link className="primary-button" href={session ? "/app" : "/login"}>
                {session ? "Open Decision OS" : "Enter Decision OS"}
              </Link>
              <Link className="ghost-button" href="/login">Private workspace</Link>
            </div>
          </div>

          <div className="decision-landing-visual" aria-hidden="true">
            <div className="frontier-visual-frame">
              {FRONTIER_VISUAL.map((lane) => (
                <section className={`frontier-visual-lane lane-${lane.id}`} key={lane.id}>
                  <span className="frontier-visual-label">{lane.label}</span>
                  {lane.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="decision-landing-strip">
        <article>
          <span className="support-label">Action frontier</span>
          <p>Stop reading generic recommendations. See which actions are legitimate now, which belong in escrow, and which are still wrong.</p>
        </article>
        <article>
          <span className="support-label">Portfolio X-Ray</span>
          <p>Read the book by what is actually carrying it: role, concentration, fragility, and recovery contribution.</p>
        </article>
        <article>
          <span className="support-label">Capital twin</span>
          <p>Shadow the live book through recovery, breakdown, phantom rebound, and improving sponsorship before you act.</p>
        </article>
      </section>
    </main>
  );
}

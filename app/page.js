import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

const PLAN_CARDS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    blurb: "See the portfolio, the current call, and whether the product is worth trusting.",
    features: [
      "Private sign-in",
      "Portfolio view and live chart",
      "Today’s decision surface",
      "Delayed or partial operating features",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$39/mo",
    blurb: "The working product: update the book naturally, stage actions, and keep a real decision log.",
    features: [
      "Natural-language trade updates",
      "Staged actions and execution prep",
      "Activity log and decision memory",
      "Mandate controls and private workspace tools",
    ],
    cta: "Start Pro trial",
    featured: true,
  },
  {
    id: "founder",
    name: "Founder",
    price: "$149/mo",
    blurb: "Early access for users who want direct setup help and closer iteration on the product.",
    features: [
      "Everything in Pro",
      "Priority support",
      "Direct onboarding help",
      "Founding member access as the product matures",
    ],
    cta: "Request Founder access",
  },
];

function normalizePlanId(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["founder", "founding", "founding_member"].includes(text)) return "founder";
  if (["pro", "pro_trial", "trial", "paid"].includes(text)) return "pro";
  if (["free", "starter"].includes(text)) return "free";
  return "";
}

function resolvePlan(session) {
  const candidates = [
    session?.plan?.id,
    session?.plan?.tier,
    session?.subscription?.plan,
    session?.workspace?.plan?.id,
    session?.workspace?.plan,
    session?.user?.plan,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePlanId(candidate);
    if (normalized) return normalized;
  }

  if (session?.user?.email) return "pro";
  return "free";
}

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
  const currentPlan = resolvePlan(session);

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
              <Link className="ghost-button" href={session ? "/app" : "/login"}>{session ? "View workspace" : "Private workspace"}</Link>
            </div>
            <p className="landing-plan-caption">
              {session ? `Current access: ${currentPlan === "founder" ? "Founder" : currentPlan === "pro" ? "Pro" : "Free"}` : "Free access opens the portfolio and today’s call. Pro unlocks the operating features."}
            </p>
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

      <section className="decision-pricing-strip">
        <div className="decision-pricing-intro">
          <p className="landing-kicker">Pricing</p>
          <h2>Charge for the workflow, not the concept.</h2>
          <p>The paid value is simple: keep the private book current, stage decisions before acting, and maintain a real log of what happened after each call.</p>
        </div>

        <div className="decision-pricing-grid">
          {PLAN_CARDS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const primaryHref = plan.id === "founder"
              ? "mailto:founders@blsprime.com?subject=BLS%20Prime%20Founder%20Access"
              : session
                ? "/app"
                : "/login";

            return (
              <article className={`pricing-card ${plan.featured ? "is-featured" : ""} ${isCurrent ? "is-current" : ""}`} key={plan.id}>
                <div className="pricing-card-head">
                  <div>
                    <span className="support-label">{plan.name}</span>
                    <h3>{plan.price}</h3>
                  </div>
                  {isCurrent ? <span className="info-chip">Current</span> : null}
                </div>
                <p className="pricing-card-blurb">{plan.blurb}</p>
                <ul className="pricing-feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link className={plan.featured ? "primary-button" : "ghost-button"} href={primaryHref}>
                  {isCurrent ? "Open workspace" : plan.cta}
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

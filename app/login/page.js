import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }) {
  const next = typeof searchParams?.next === "string" ? searchParams.next : "/app";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

  return (
    <main className="auth-page decision-auth-page">
      <div className="decision-auth-stage">
        <section className="decision-auth-copy">
          <p className="landing-kicker">Private Decision OS access</p>
          <p className="brand-wordmark">BLS Prime</p>
          <h1>Enter your private decision workspace.</h1>
          <p className="landing-support">
            Your holdings, staged actions, counterfactual ledger, and mandate stay scoped to your signed-in workspace.
          </p>
        </section>

        <form className="access-card auth-panel decision-auth-panel" method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />
          <p className="eyebrow">Member sign in</p>
          <h2>Open BLS Prime.</h2>
          <p className="support-copy">Use the private access code configured for this deployment.</p>
          {error ? <p className="access-error">{error}</p> : null}
          <div className="access-form">
            <label className="access-field">
              <span>Name</span>
              <input name="name" type="text" placeholder="Tomas" autoComplete="name" />
            </label>
            <label className="access-field">
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
            </label>
            <label className="access-field">
              <span>Access code</span>
              <input name="accessCode" type="password" placeholder="Private access code" required />
            </label>
          </div>
          <div className="hero-cta-row">
            <button className="primary-button" type="submit">Enter workspace</button>
            <Link className="ghost-button" href="/">Back</Link>
          </div>
        </form>
      </div>
    </main>
  );
}

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }) {
  const next = typeof searchParams?.next === "string" ? searchParams.next : "/app";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

  return (
    <main className="auth-page">
      <div className="auth-stage">
        <section className="auth-copy">
          <p className="landing-kicker">Private workspace access</p>
          <p className="brand-wordmark">BLS Prime</p>
          <h1>Sign in to your private workspace.</h1>
          <p className="landing-support">
            Your holdings, actions, and saved context stay behind sign-in.
          </p>
          <div className="auth-ambient-copy" aria-hidden="true">
            <span>Plan</span>
            <span>Risk</span>
            <span>Portfolio</span>
            <span>Ideas</span>
          </div>
        </section>

        <form className="access-card auth-panel" method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />
          <p className="eyebrow">Member sign in</p>
          <h2>Open your private workspace.</h2>
          <p className="support-copy">Use the access code you set for this deployment.</p>
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

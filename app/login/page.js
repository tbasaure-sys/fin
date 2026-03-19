import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }) {
  const next = typeof searchParams?.next === "string" ? searchParams.next : "/app";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

  return (
    <main className="access-shell">
      <div className="access-card">
        <p className="eyebrow">Member Sign In</p>
        <h1>Open your private BLS Prime workspace.</h1>
        <p className="access-copy">
          The public site stays open. Your portfolio, holdings, watchlists, and command history now live behind sign-in.
        </p>
        {error ? <p className="access-error">{error}</p> : null}
        <form className="access-form" method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />
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
          <div className="hero-cta-row">
            <button className="primary-button" type="submit">Enter workspace</button>
            <Link className="ghost-button" href="/">Back</Link>
          </div>
        </form>
      </div>
    </main>
  );
}

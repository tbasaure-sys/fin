import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/app/login-page.module.css";
import { getServerConfig } from "@/lib/server/config";
import { getServerAuthSession } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  const config = getServerConfig();
  const next = typeof searchParams?.next === "string" ? searchParams.next : "/app";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";
  const session = await getServerAuthSession();

  if (session) {
    redirect(next.startsWith("/") ? next : "/app");
  }

  return (
    <main className={styles.page}>
      <div className={styles.stage}>

        <Link href="/" className={styles.backLink}>
          ← Back to home
        </Link>

        {/* ── Left column: friendly copy ─── */}
        <section className={styles.copy}>
          <Link href="/" className={styles.logoMark}>
            <span className={styles.logoIcon} aria-hidden="true">
              <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 14 L9 4 L16 14" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className={styles.logoText}>{config.appName}</span>
          </Link>

          <p className={styles.kicker}>Private workspace access</p>

          <h1 className={styles.headline}>
            Your portfolio,<br />
            <em>your workspace.</em>
          </h1>

          <p className={styles.lead}>
            Sign in to open your private investment workspace — where your
            holdings, market context, and decisions all live together.
          </p>

          <div className={styles.benefits}>
            <div className={styles.benefit}>
              <div className={styles.benefitIcon}>🔒</div>
              <div className={styles.benefitBody}>
                <strong>Completely private</strong>
                <p>Your workspace is yours alone — nobody else sees your holdings or activity.</p>
              </div>
            </div>
            <div className={styles.benefit}>
              <div className={styles.benefitIcon}>⚡</div>
              <div className={styles.benefitBody}>
                <strong>Always up to date</strong>
                <p>Your portfolio data refreshes automatically so you always see the current picture.</p>
              </div>
            </div>
            <div className={styles.benefit}>
              <div className={styles.benefitIcon}>🎯</div>
              <div className={styles.benefitBody}>
                <strong>Clear next steps</strong>
                <p>Get plain-English guidance on what to consider for your specific portfolio.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Right column: form card ─── */}
        <form className={styles.card} method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />

          <p className={styles.cardEyebrow}>Create account or sign in</p>
          <h2 className={styles.cardTitle}>Open your workspace in {config.appName}</h2>
          <p className={styles.cardSub}>
            First time here? We'll create your account automatically.
            Already have one? This signs you straight in.
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Your name</span>
              <input
                className={styles.fieldInput}
                name="name"
                type="text"
                placeholder={config.loginNamePlaceholder || "Jane Smith"}
                autoComplete="name"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Email address</span>
              <input
                className={styles.fieldInput}
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Access code</span>
              <input
                className={styles.fieldInput}
                name="accessCode"
                type="password"
                placeholder="Your private access code"
                required
              />
            </label>
          </div>

          <div className={styles.footnote}>
            <strong>How this works</strong>
            Enter your email, name, and the access code you received. If your
            email is new, we create a private workspace for you. If you've been
            here before, you're signed straight back in.
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} name="intent" type="submit" value="signup">
              Create account
            </button>
            <button className={styles.btnSecondary} name="intent" type="submit" value="signin">
              Sign in
            </button>
          </div>
        </form>

      </div>
    </main>
  );
}

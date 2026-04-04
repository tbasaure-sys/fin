import Link from "next/link";
import styles from "@/app/login-page.module.css";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage({ searchParams }) {
  const config = getServerConfig();
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";
  const sent = searchParams?.sent === "1";
  const devResetUrl = typeof searchParams?.devResetUrl === "string" ? searchParams.devResetUrl : "";

  return (
    <main className={styles.page}>
      <div className={styles.stage}>
        <Link href="/login" className={styles.backLink}>
          Back to login
        </Link>

        <section className={styles.copy}>
          <Link href="/" className={styles.logoMark}>
            <span className={styles.logoIcon} aria-hidden="true">
              <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 14 L9 4 L16 14" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className={styles.logoText}>{config.appName}</span>
          </Link>

          <p className={styles.kicker}>Password recovery</p>
          <h1 className={styles.headline}>
            Recover access
            <br />
            <em>to your workspace.</em>
          </h1>
          <p className={styles.lead}>
            Enter your email and we will send you a secure link so you can set a
            new password without needing support to intervene.
          </p>
        </section>

        <form className={styles.card} method="post" action="/api/auth/forgot-password">
          <p className={styles.cardEyebrow}>Reset password</p>
          <h2 className={styles.cardTitle}>Get your recovery link</h2>
          <p className={styles.cardSub}>
            If the email exists, we will create a secure reset link and deliver it.
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}
          {sent ? (
            <p className={styles.success}>
              If the account exists, the reset instructions are on the way.
            </p>
          ) : null}
          {devResetUrl ? (
            <p className={styles.success}>
              Development fallback: <a className={styles.textLink} href={devResetUrl}>open your reset link</a>.
            </p>
          ) : null}

          <div className={styles.form}>
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
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} type="submit">
              Send reset link
            </button>
          </div>

          <div className={styles.metaRow}>
            <Link className={styles.textLink} href="/login">
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

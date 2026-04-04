import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/app/login-page.module.css";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage({ searchParams }) {
  const config = getServerConfig();
  const token = typeof searchParams?.token === "string" ? searchParams.token : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

  if (!token) {
    redirect("/forgot-password?error=Missing+reset+token.");
  }

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

          <p className={styles.kicker}>Choose a new password</p>
          <h1 className={styles.headline}>
            Set a new password
            <br />
            <em>and get back in.</em>
          </h1>
          <p className={styles.lead}>
            This secure link lets you replace the old password and sign back into
            your workspace right away.
          </p>
        </section>

        <form className={styles.card} method="post" action="/api/auth/reset-password">
          <input type="hidden" name="token" value={token} />

          <p className={styles.cardEyebrow}>Reset password</p>
          <h2 className={styles.cardTitle}>Create your new password</h2>
          <p className={styles.cardSub}>
            Use at least 8 characters. After saving it, you will be signed in automatically.
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>New password</span>
              <input
                className={styles.fieldInput}
                name="password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Confirm password</span>
              <input
                className={styles.fieldInput}
                name="confirmPassword"
                type="password"
                placeholder="Repeat your new password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnPrimary} type="submit">
              Save new password
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

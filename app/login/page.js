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
          Back to home
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

          <p className={styles.kicker}>Account access</p>

          <h1 className={styles.headline}>
            Your capital OS,
            <br />
            <em>protected by your password.</em>
          </h1>

          <p className={styles.lead}>
            Sign in once, then return to the same money plan, portfolio,
            research desk, and decision memory from web or mobile.
          </p>

          <div className={styles.benefits}>
            <div className={styles.benefit}>
              <div className={styles.benefitIcon}>PW</div>
              <div className={styles.benefitBody}>
                <strong>Your own credentials</strong>
                <p>Each user gets their own password instead of one shared access code for everyone.</p>
              </div>
            </div>
            <div className={styles.benefit}>
              <div className={styles.benefitIcon}>GO</div>
              <div className={styles.benefitBody}>
                <strong>One private workspace</strong>
                <p>Your finance plan, holdings, research, and staged decisions all come back after login.</p>
              </div>
            </div>
            <div className={styles.benefit}>
              <div className={styles.benefitIcon}>OS</div>
              <div className={styles.benefitBody}>
                <strong>Web and mobile ready</strong>
                <p>The native app uses the same account and the same workspace APIs as the website.</p>
              </div>
            </div>
          </div>
        </section>

        <form className={styles.card} method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />

          <p className={styles.cardEyebrow}>Your private workspace</p>
          <h2 className={styles.cardTitle}>Welcome to {config.appName}</h2>

          <div className={styles.pathPicker}>
            <div className={styles.pathCard} data-path="new">
              <strong>First time here?</strong>
              <p>Create your account below - it only takes a minute.</p>
            </div>
            <div className={styles.pathCard} data-path="returning">
              <strong>Already have an account?</strong>
              <p>Sign in with your email and password.</p>
            </div>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Your name <span className={styles.fieldOptional}>(only needed for new accounts)</span></span>
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
              <span className={styles.fieldLabel}>Password <span className={styles.fieldOptional}>(8 characters minimum)</span></span>
              <input
                className={styles.fieldInput}
                name="password"
                type="password"
                placeholder="Choose a secure password"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
          </div>

          <div className={styles.actionGuide}>
            <div className={styles.actionOption}>
              <div className={styles.actionOptionLabel}>First time here?</div>
              <button className={styles.btnPrimary} name="intent" type="submit" value="signup">
                Create my account
              </button>
              <p className={styles.actionHint}>Creates your private workspace in one step.</p>
            </div>
            <div className={styles.actionDivider}>or</div>
            <div className={styles.actionOption}>
              <div className={styles.actionOptionLabel}>Already have an account?</div>
              <button className={styles.btnSecondary} name="intent" type="submit" value="signin">
                Sign in
              </button>
              <p className={styles.actionHint}>Use the email and password you set before.</p>
            </div>
          </div>

          <div className={styles.metaRow}>
            <Link className={styles.textLink} href="/forgot-password">
              Forgot your password?
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

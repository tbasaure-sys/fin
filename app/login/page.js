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
        <section className={styles.copy}>
          <p className={styles.kicker}>Private workspace access</p>
          <p className={styles.wordmark}>{config.appName}</p>
          <h1>Create your account or sign in.</h1>
          <p className={styles.support}>
            Your holdings, staged actions, counterfactual ledger, and mandate stay scoped to your signed-in workspace.
          </p>

          <div className={styles.copyNotes}>
            <article>
              <span>Private book</span>
              <p>The authenticated workspace resolves to your portfolio context, not a shared demo state.</p>
            </article>
            <article>
              <span>Fresh analysis</span>
              <p>Railway remains the analysis source of truth and the app shows freshness state directly.</p>
            </article>
            <article>
              <span>First visit or return</span>
              <p>New users can create an account with their name, email, and the private access code. Returning users use the same form.</p>
            </article>
          </div>
        </section>

        <form className={styles.panel} method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />
          <p className={styles.panelKicker}>Create account or sign in</p>
          <h2>Open your workspace in {config.appName}.</h2>
          <p className={styles.panelSupport}>If your email is new, this form creates your account. If it already exists, it signs you in.</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.form}>
            <label className={styles.field}>
              <span>Name</span>
              <input name="name" type="text" placeholder={config.loginNamePlaceholder} autoComplete="name" />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
            </label>
            <label className={styles.field}>
              <span>Access code</span>
              <input name="accessCode" type="password" placeholder="Private access code" required />
            </label>
          </div>
          <div className={styles.panelFootnote}>
            <span>How it works</span>
            <p>Your email becomes your account identity. On first access we create a private workspace for you, then reuse it on later sign-ins.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.primaryButton} name="intent" type="submit" value="signup">Create account</button>
            <button className={styles.secondaryButton} name="intent" type="submit" value="signin">Sign in</button>
          </div>
        </form>
      </div>
    </main>
  );
}

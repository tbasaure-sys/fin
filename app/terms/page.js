import Link from "next/link";

import { getServerConfig } from "@/lib/server/config";
import styles from "@/app/public-home.module.css";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  const config = getServerConfig();

  return (
    <main className={`${styles.page} ${styles.legalPage}`}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandName}>{config.appName}</span>
        </Link>
        <div className={styles.navActions}>
          <Link className={styles.btnGhost} href="/aurora">AURORA</Link>
          <Link className={styles.btnGhost} href="/">Home</Link>
        </div>
      </nav>

      <section className={styles.legalHero}>
        <p className={styles.tag}>Terms of Service</p>
        <h1>Research software, not financial advice.</h1>
        <p>
          These terms explain how {config.appName} should be used. The short version:
          the product helps you organize information and think more clearly, but you remain responsible for every financial decision.
        </p>
        <span>Effective date: April 20, 2026</span>
      </section>

      <section className={styles.legalBody}>
        <article>
          <h2>1. Educational and research use only</h2>
          <p>
            {config.appName} provides portfolio organization, market context, risk analytics,
            equity research outputs, and AI-assisted explanations for informational and educational purposes.
            It is not a registered investment adviser, broker, dealer, tax adviser, or law firm.
          </p>
        </article>

        <article>
          <h2>2. No personalized financial advice</h2>
          <p>
            Nothing in the product is financial, investment, tax, accounting, or legal advice.
            Outputs should not be treated as a recommendation to buy, sell, hold, hedge, rebalance, or otherwise transact in any security or asset.
            You should make decisions independently or with a qualified professional who understands your full circumstances.
          </p>
        </article>

        <article>
          <h2>3. No trading or execution</h2>
          <p>
            The workspace does not place trades, route orders, manage money, or execute transactions.
            Any staged action, memo, valuation, model, alert, or checklist is a research artifact only.
          </p>
        </article>

        <article>
          <h2>4. Data and model limitations</h2>
          <p>
            Market data, financial statements, third-party APIs, user-entered holdings, AI outputs, and derived calculations may be delayed,
            incomplete, stale, wrong, or unavailable. Deterministic calculations can still be wrong if the source data or assumptions are wrong.
            You should verify important information against primary sources before acting.
          </p>
        </article>

        <article>
          <h2>5. AI-assisted analysis</h2>
          <p>
            AI may summarize, critique, or explain sourced data and deterministic model outputs.
            AI can make mistakes, omit context, or overstate confidence. Treat AI text as a draft research aid, not an authority.
          </p>
        </article>

        <article>
          <h2>6. Your responsibility</h2>
          <p>
            You are responsible for the accuracy of holdings you enter, the assumptions you accept,
            the professionals you consult, and any decision you make outside the product.
            Past performance, model output, valuation estimates, and risk scores do not guarantee future results.
          </p>
        </article>

        <article>
          <h2>7. Acceptable use</h2>
          <p>
            Do not use the workspace to automate trading, manipulate markets, violate laws, reverse engineer protected services,
            overload third-party data providers, or make decisions for another person without proper permission.
          </p>
        </article>
      </section>
    </main>
  );
}

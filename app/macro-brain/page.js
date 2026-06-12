import Link from "next/link";

import styles from "./macro-brain.module.css";
import { macroBrainSnapshot as snapshot } from "@/lib/macro-brain-snapshot";

export const metadata = {
  title: "Macro Brain | BLS Prime",
  description: "A short macro note that shows what changed, what to watch, and what was recorded.",
};

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function ideaStatus(state) {
  if (state === "open") return "Still open";
  if (state === "watch") return "Needs watching";
  return "Paused";
}

export default function MacroBrainPage() {
  const openIdeas = snapshot.theses.filter((item) => item.state === "open").length;
  const watchedIdeas = snapshot.theses.filter((item) => item.state === "watch").length;
  const dataPointLabel = `${formatNumber(snapshot.observations)} data points`;

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Macro Brain navigation">
        <Link className={styles.brand} href="/">
          BLS Prime
        </Link>
        <div className={styles.navLinks}>
          <a href="#example">Example</a>
          <a href="#features">What it does</a>
          <a href="#record">Record</a>
        </div>
        <Link className={styles.navAction} href="/app">
          Workspace
        </Link>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>Macro Brain</p>
          <h1>A short morning note for macro ideas.</h1>
          <p>
            It shows what moved, which ideas need attention, what data matters next, and keeps a record of the call.
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryButton} href="#example">
              See the example
            </a>
            <a className={styles.secondaryButton} href="#features">
              What it does
            </a>
          </div>
          <small>Research-only. Not financial advice. No trades placed.</small>
        </div>

        <aside className={styles.note} aria-label="Macro Brain example note">
          <div className={styles.noteHeader}>
            <span>Example run</span>
            <strong>{formatDate(snapshot.runDate)}</strong>
          </div>
          <p>{snapshot.shortRead}</p>
          <dl>
            <div>
              <dt>Signals</dt>
              <dd>{snapshot.seriesCount}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{openIdeas}</dd>
            </div>
            <div>
              <dt>Watch</dt>
              <dd>{watchedIdeas}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.example} id="example">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>Example</p>
          <h2>One page. Four checks.</h2>
        </div>

        <div className={styles.grid}>
          <section className={styles.panel}>
            <h3>What changed</h3>
            <div className={styles.signalList}>
              {snapshot.impulseChanges.map((item) => (
                <div className={styles.signalRow} data-direction={item.direction} key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.plain}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <h3>Ideas</h3>
            <div className={styles.ideaList}>
              {snapshot.theses.map((idea) => (
                <article key={idea.id}>
                  <div>
                    <strong>{idea.title}</strong>
                    <span>{ideaStatus(idea.state)}</span>
                  </div>
                  <p>{idea.why}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <h3>Next checks</h3>
            <div className={styles.checkList}>
              {snapshot.nextChecks.slice(0, 4).map((item) => (
                <div key={item.event}>
                  <strong>{item.event}</strong>
                  <span>{item.timing}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <h3>Stress</h3>
            <p>{snapshot.stability.read}</p>
            <div className={styles.statusLine}>
              <span>{snapshot.stability.status}</span>
              <strong>{snapshot.stability.pressure}%</strong>
            </div>
          </section>
        </div>
      </section>

      <section className={styles.features} id="features">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>What it does</p>
          <h2>Only the parts that exist now.</h2>
        </div>

        <div className={styles.featureList}>
          <article>
            <span>01</span>
            <strong>Shows the biggest market moves.</strong>
            <p>No long dashboard. Just the changes worth reading first.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Tracks a few live ideas.</strong>
            <p>Each idea says what supports it and what is pushing back.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Ranks what to watch next.</strong>
            <p>The calendar focuses on the releases that can actually change the ideas.</p>
          </article>
          <article>
            <span>04</span>
            <strong>Keeps a dated record.</strong>
            <p>Every call can be checked later instead of remembered generously.</p>
          </article>
        </div>
      </section>

      <section className={styles.record} id="record">
        <p className={styles.kicker}>Record</p>
        <h2>{snapshot.ledger.question}</h2>
        <p>{snapshot.ledger.rule}</p>
        <div className={styles.meta}>
          <span>{dataPointLabel}</span>
          <span>{snapshot.ledger.liveTheses} ideas</span>
          <span>Partial liquidity</span>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";

import styles from "./macro-brain.module.css";
import { loadMacroBrainSnapshot } from "@/lib/server/macro-brain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export default async function MacroBrainPage() {
  const snapshot = await loadMacroBrainSnapshot();
  const openIdeas = snapshot.theses.filter((item) => item.state === "open").length;
  const watchedIdeas = snapshot.theses.filter((item) => item.state === "watch").length;
  const dataPointLabel = `${formatNumber(snapshot.observations)} data points`;
  const pulseBars = snapshot.impulseChanges.slice(0, 6).map((item, index) => ({
    ...item,
    height: `${Math.max(22, Math.min(84, item.intensity * 34))}%`,
    delay: `${index * 80}ms`,
  }));

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Macro Brain navigation">
        <Link className={styles.brand} href="/">
          BLS Prime
        </Link>
        <div className={styles.navLinks}>
          <a href="#today">Today</a>
          <a href="#record">Log</a>
        </div>
        <Link className={styles.navAction} href="/app">
          Workspace
        </Link>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>Macro Brain</p>
          <h1>Macro Brain</h1>
          <p>One morning page: what moved, what matters next, what gets saved.</p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href="/app#macrobrain">
              Open in workspace
            </Link>
            <a className={styles.secondaryButton} href="#today">See today</a>
          </div>
          <small>Research-only. Not financial advice. No trades placed.</small>
        </div>

        <div className={styles.heroVisual} aria-label="Macro Brain signal picture">
          <div className={styles.visualHeader}>
            <span>{formatDate(snapshot.runDate)}</span>
            <strong>{snapshot.stability.status}</strong>
          </div>
          <div className={styles.pulseBars}>
            {pulseBars.map((item) => (
              <span
                data-direction={item.direction}
                key={item.label}
                style={{ "--bar-height": item.height, "--bar-delay": item.delay }}
                title={`${item.label}: ${item.plain}`}
              />
            ))}
          </div>
          <div className={styles.visualFacts}>
            <span><strong>{snapshot.seriesCount}</strong> signals</span>
            <span><strong>{openIdeas}</strong> open</span>
            <span><strong>{watchedIdeas}</strong> watch</span>
          </div>
        </div>
      </section>

      <section className={styles.example} id="today">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>Today</p>
          <h2>{snapshot.shortRead}</h2>
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
          <p className={styles.kicker}>Functions</p>
          <h2>Only what is active now.</h2>
        </div>

        <div className={styles.featureList}>
          <article>
            <span>01</span>
            <strong>Moves</strong>
          </article>
          <article>
            <span>02</span>
            <strong>Ideas</strong>
          </article>
          <article>
            <span>03</span>
            <strong>Next data</strong>
          </article>
          <article>
            <span>04</span>
            <strong>Dated log</strong>
          </article>
        </div>
      </section>

      <section className={styles.record} id="record">
        <p className={styles.kicker}>Log</p>
        <h2>{snapshot.ledger.question}</h2>
        <div className={styles.meta}>
          <span>{dataPointLabel}</span>
          <span>{snapshot.ledger.liveTheses} ideas</span>
          <span>Partial liquidity</span>
        </div>
      </section>
    </main>
  );
}

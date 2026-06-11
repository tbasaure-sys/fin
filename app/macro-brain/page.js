import Link from "next/link";

import styles from "./macro-brain.module.css";
import { macroBrainSnapshot as snapshot } from "@/lib/macro-brain-snapshot";

export const metadata = {
  title: "Macro Brain | BLS Prime",
  description:
    "A plain-language daily macro license: what changed, which thesis is still allowed, and what evidence can revoke it.",
};

function pct(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function stateLabel(state) {
  if (state === "licensed") return "Enough room";
  if (state === "conditional") return "Watch closely";
  return "No license";
}

export default function MacroBrainPage() {
  const licensed = snapshot.theses.filter((item) => item.state === "licensed").length;
  const conditional = snapshot.theses.filter((item) => item.state === "conditional").length;
  const topDefeater = snapshot.defeaters[0];

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Macro Brain navigation">
        <Link className={styles.brand} href="/">
          BLS Prime
        </Link>
        <div className={styles.navLinks}>
          <a href="#daily-read">Daily read</a>
          <a href="#theses">Theses</a>
          <a href="#ledger">Ledger</a>
        </div>
        <Link className={styles.navAction} href="/app">
          Open workspace
        </Link>
      </nav>

      <section className={styles.hero} id="daily-read">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Macro Brain / {formatDate(snapshot.runDate)}</p>
          <h1>A daily license for macro conviction.</h1>
          <p className={styles.lede}>
            Macro Brain does not ask whether an idea feels smart. It asks how much doubt the idea can absorb before it touches a boundary you already agreed is forbidden.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#theses">
              See today&apos;s licenses
            </a>
            <a className={styles.secondaryButton} href="#defeaters">
              What can change my mind?
            </a>
          </div>
        </div>

        <div className={styles.decisionPlane} aria-label="Macro Brain daily state">
          <div className={styles.planeTop}>
            <span>Today&apos;s read</span>
            <strong>{snapshot.seriesCount} live signals</strong>
          </div>
          <p>{snapshot.dailyRead}</p>
          <div className={styles.planeStats}>
            <div>
              <span>Licensed</span>
              <strong>{licensed}</strong>
            </div>
            <div>
              <span>Conditional</span>
              <strong>{conditional}</strong>
            </div>
            <div>
              <span>Next defeater</span>
              <strong>{topDefeater.event}</strong>
            </div>
          </div>
          <div className={styles.capacityLine} aria-hidden="true">
            <i style={{ width: `${100 - snapshot.stability.doubtUsed}%` }} />
          </div>
          <small>Regime room remaining: {pct(100 - snapshot.stability.doubtUsed)}</small>
        </div>
      </section>

      <section className={styles.strip} aria-label="How Macro Brain works">
        <div>
          <span>1</span>
          <strong>Watch the change in the change.</strong>
          <p>Levels are background. Impulse is the first thing on the page.</p>
        </div>
        <div>
          <span>2</span>
          <strong>License the thesis, not the mood.</strong>
          <p>Each idea gets tested against the evidence that could defeat it.</p>
        </div>
        <div>
          <span>3</span>
          <strong>Write it down before the outcome.</strong>
          <p>The ledger turns judgment into something falsifiable.</p>
        </div>
      </section>

      <section className={styles.section} id="impulse">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>What changed</p>
          <h2>The morning starts with movement, not opinion.</h2>
          <p>
            The list below is the short version of the batch: which market pressures are accelerating, fading, or turning.
          </p>
        </div>
        <div className={styles.impulseList}>
          {snapshot.impulseChanges.map((item, index) => (
            <article className={styles.impulseRow} data-direction={item.direction} key={`${item.label}-${item.plain}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.label}</strong>
              <p>{item.plain}</p>
              <em>{item.direction === "up" ? "Rising" : "Fading"}</em>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.liquidityBand}>
        <div>
          <p className={styles.eyebrow}>Liquidity</p>
          <h2>{snapshot.liquidity.status}</h2>
        </div>
        <p>{snapshot.liquidity.summary}</p>
        <div className={styles.liquidityParts}>
          {snapshot.liquidity.components.map((component) => (
            <span key={component.label}>
              <strong>{component.label}</strong>
              {component.stance}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.section} id="theses">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Live theses</p>
          <h2>Conviction gets a license, not a slogan.</h2>
          <p>
            A thesis is allowed only while the remaining margin is larger than the doubt it must honestly absorb.
          </p>
        </div>
        <div className={styles.thesisStack}>
          {snapshot.theses.map((thesis) => (
            <article className={styles.thesisRow} data-state={thesis.state} key={thesis.id}>
              <div className={styles.thesisMain}>
                <span>{thesis.id} / {stateLabel(thesis.state)}</span>
                <h3>{thesis.title}</h3>
                <p>{thesis.why}</p>
              </div>
              <div className={styles.thesisGauge}>
                <div>
                  <span>Doubt used</span>
                  <strong>{pct(thesis.doubtUsed)}</strong>
                </div>
                <i aria-hidden="true">
                  <b style={{ width: pct(thesis.doubtUsed) }} />
                </i>
                <small>{thesis.confirmations} confirming / {thesis.contradictions} arguing back</small>
              </div>
              <div className={styles.thesisBreak}>
                <span>Can break if</span>
                <p>{thesis.canBreak}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.sectionSplit} id="defeaters">
        <div className={styles.defeaterPanel}>
          <p className={styles.eyebrow}>Calendar</p>
          <h2>Only the releases that can change a live thesis matter today.</h2>
          <div className={styles.defeaterList}>
            {snapshot.defeaters.map((item, index) => (
              <article key={item.event}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.event}</strong>
                <p>{item.timing}</p>
                <em>{item.value.toFixed(2)}</em>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.stabilityPanel}>
          <p className={styles.eyebrow}>Know when not to know</p>
          <h2>{snapshot.stability.status}</h2>
          <p>{snapshot.stability.read}</p>
          <div className={styles.stabilityGauge}>
            <span>Boundary pressure</span>
            <strong>{pct(snapshot.stability.doubtUsed)}</strong>
            <i>
              <b style={{ width: pct(snapshot.stability.doubtUsed) }} />
            </i>
          </div>
          <div className={styles.modeList}>
            {snapshot.stability.fragileMode.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ledger} id="ledger">
        <p className={styles.eyebrow}>Ledger</p>
        <h2>The product is the record.</h2>
        <p>{snapshot.ledger.rule}</p>
        <blockquote>{snapshot.ledger.question}</blockquote>
        <div className={styles.ledgerMeta}>
          <span>{formatNumber(snapshot.observations)} observations in today&apos;s run</span>
          <span>{snapshot.ledger.liveTheses} live theses</span>
          <span>Research-only, no trades placed</span>
        </div>
      </section>
    </main>
  );
}

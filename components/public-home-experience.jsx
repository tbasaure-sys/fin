"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/home-page.module.css";

const PERCEIVED_SEGMENTS = [
  { label: "Technology", value: 28, color: "#4b78ff" },
  { label: "Financials", value: 18, color: "#7f65ff" },
  { label: "Healthcare", value: 15, color: "#4dc8b1" },
  { label: "Consumer", value: 12, color: "#ef8d60" },
  { label: "Industrials", value: 9, color: "#f0be4f" },
  { label: "Other", value: 18, color: "#8b93a1" },
];

const STRUCTURAL_SEGMENTS = [
  { label: "AI cyclicality", value: 46, color: "#e8b84b" },
  { label: "Rate sensitivity", value: 18, color: "#4b78ff" },
  { label: "Crowded growth", value: 14, color: "#7f65ff" },
  { label: "Consumer beta", value: 12, color: "#4dc8b1" },
  { label: "True ballast", value: 10, color: "#8b93a1" },
];

const HERO_MODES = {
  seen: {
    title: "What you see",
    score: 78,
    label: "Perceived diversification",
    summary: "Looks broad across sectors and wrappers.",
    signal: "Surface risk reads calm.",
    segments: PERCEIVED_SEGMENTS,
  },
  actual: {
    title: "What actually exists",
    score: 43,
    label: "Real diversification",
    summary: "Capital crowds into the same structural trade.",
    signal: "Hidden overlap is doing the real work.",
    segments: STRUCTURAL_SEGMENTS,
  },
};

const EXAMPLE_CLUSTERS = [
  {
    name: "AI beta",
    x: 90,
    y: 82,
    color: "#e8b84b",
    members: ["NVDA", "MSFT", "TSM"],
  },
  {
    name: "Rate duration",
    x: 268,
    y: 68,
    color: "#4b78ff",
    members: ["QQQ", "Long growth", "Software"],
  },
  {
    name: "Consumer stress",
    x: 242,
    y: 210,
    color: "#4dc8b1",
    members: ["AMZN", "Retail", "Ad spend"],
  },
  {
    name: "Surface wrappers",
    x: 138,
    y: 196,
    color: "#7f65ff",
    members: ["ETF", "Sector", "Theme"],
  },
];

const AGENT_NODES = [
  { label: "Valuation", x: 180, y: 46, accent: "gold" },
  { label: "Macro", x: 314, y: 118, accent: "blue" },
  { label: "Sentiment", x: 300, y: 258, accent: "purple" },
  { label: "Risk", x: 180, y: 328, accent: "teal" },
  { label: "Structure", x: 52, y: 258, accent: "gold" },
  { label: "Liquidity", x: 38, y: 118, accent: "blue" },
  { label: "Decision", x: 180, y: 188, accent: "core", center: true },
];

const SCENARIOS = {
  "2022 rate shock": {
    perceived: [100, 98, 96, 94, 92, 90, 88],
    actual: [100, 94, 88, 82, 79, 77, 75],
    perceivedDrawdown: "-12%",
    actualDrawdown: "-25%",
    note: "Rate duration and crowded growth separated from the neat sector story first.",
  },
  "2008 stress": {
    perceived: [100, 96, 92, 86, 82, 84, 87],
    actual: [100, 92, 80, 68, 63, 67, 71],
    perceivedDrawdown: "-18%",
    actualDrawdown: "-37%",
    note: "Balance-sheet dependence clustered faster than the wrappers suggested.",
  },
  "AI unwind": {
    perceived: [100, 99, 97, 95, 93, 92, 91],
    actual: [100, 95, 88, 81, 77, 74, 72],
    perceivedDrawdown: "-9%",
    actualDrawdown: "-28%",
    note: "The portfolio looked diversified until the same narrative premium got repriced everywhere at once.",
  },
};

function buildConicGradient(segments) {
  let angle = 0;
  const stops = segments.map(({ value, color }) => {
    const start = angle;
    angle += value * 3.6;
    return `${color} ${start}deg ${angle}deg`;
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

function buildLinePoints(values, width, height) {
  const left = 12;
  const right = width - 12;
  const top = 18;
  const bottom = height - 18;
  return values
    .map((value, index) => {
      const x = left + ((right - left) / (values.length - 1)) * index;
      const normalized = (value - 60) / 40;
      const y = bottom - normalized * (bottom - top);
      return `${x},${y}`;
    })
    .join(" ");
}

function Ring({ segments, title, label, score, active }) {
  const backgroundImage = useMemo(() => buildConicGradient(segments), [segments]);

  return (
    <div className={styles.ringCard} data-active={active ? "true" : "false"}>
      <div className={styles.ringShell}>
        <div className={styles.ringFill} style={{ backgroundImage }} />
        <div className={styles.ringInner}>
          <strong>{score}</strong>
          <span>{label}</span>
        </div>
      </div>
      <p>{title}</p>
    </div>
  );
}

export function RealityGapHero() {
  const [mode, setMode] = useState("seen");
  const userInteracted = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!userInteracted.current) {
        setMode("actual");
      }
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, []);

  const active = HERO_MODES[mode];
  const perceivedGradient = useMemo(() => buildConicGradient(PERCEIVED_SEGMENTS), []);
  const actualGradient = useMemo(() => buildConicGradient(STRUCTURAL_SEGMENTS), []);

  return (
    <div className={styles.heroInterface}>
      <div className={styles.interfaceHeader}>
        <div>
          <p className={styles.interfaceLabel}>Cognitive shock</p>
          <h2>Reality gap</h2>
        </div>
        <span className={styles.interfaceMeta}>Perceived 78 / Real 43</span>
      </div>

      <div className={styles.interfaceToggle} role="tablist" aria-label="Reality gap views">
        {Object.entries(HERO_MODES).map(([key, item]) => (
          <button
            key={key}
            className={styles.interfaceToggleBtn}
            data-active={mode === key ? "true" : "false"}
            onClick={() => {
              userInteracted.current = true;
              setMode(key);
            }}
            role="tab"
            type="button"
          >
            {item.title}
          </button>
        ))}
      </div>

      <div className={styles.interfaceBody}>
        <div className={styles.morphPanel}>
          <div className={styles.morphRing}>
            <div
              className={styles.morphLayer}
              data-active={mode === "seen" ? "true" : "false"}
              style={{ backgroundImage: perceivedGradient }}
            />
            <div
              className={styles.morphLayer}
              data-active={mode === "actual" ? "true" : "false"}
              style={{ backgroundImage: actualGradient }}
            />
            <div className={styles.morphCenter}>
              <strong>{active.score}</strong>
              <span>{active.label}</span>
            </div>
          </div>

          <div className={styles.morphCopy}>
            <p>{active.summary}</p>
            <span>{active.signal}</span>
          </div>
        </div>

        <div className={styles.interfaceMetrics}>
          <div className={styles.metricPair}>
            <span>Perceived diversification score</span>
            <strong>78 / 100</strong>
          </div>
          <div className={styles.metricPair}>
            <span>Real diversification score</span>
            <strong>43 / 100</strong>
          </div>
          <div className={styles.metricPair}>
            <span>Stress regime</span>
            <strong>Overlap high</strong>
          </div>
        </div>
      </div>

      <div className={styles.exposureStack}>
        {active.segments.map((item) => (
          <div className={styles.exposureRow} key={item.label}>
            <div className={styles.exposureMeta}>
              <span>{item.label}</span>
              <strong>{item.value}%</strong>
            </div>
            <div className={styles.exposureBar}>
              <span style={{ width: `${item.value}%`, background: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExposureContrast() {
  return (
    <div className={styles.exposureContrast}>
      <div className={styles.comparePanel}>
        <div className={styles.compareHeader}>
          <span>Classic allocation</span>
          <strong>What the wrapper story says</strong>
        </div>
        <Ring
          segments={PERCEIVED_SEGMENTS}
          title="Sector mix and ETF labels"
          label="Surface score"
          score="72"
          active
        />
        <div className={styles.compareLegend}>
          {PERCEIVED_SEGMENTS.map((item) => (
            <div className={styles.legendRow} key={item.label}>
              <span className={styles.legendDot} style={{ background: item.color }} />
              <p>{item.label}</p>
              <strong>{item.value}%</strong>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.comparePanel}>
        <div className={styles.compareHeader}>
          <span>Real exposure</span>
          <strong>What actually drives behavior</strong>
        </div>
        <div className={styles.clusterPanel}>
          <svg
            aria-label="Structural exposure cluster map"
            className={styles.clusterMap}
            viewBox="0 0 360 280"
            role="img"
          >
            {EXAMPLE_CLUSTERS.map((cluster, index) => (
              <g key={cluster.name}>
                <line
                  x1="180"
                  x2={cluster.x}
                  y1="140"
                  y2={cluster.y}
                  className={styles.clusterLink}
                  style={{ animationDelay: `${index * 120}ms` }}
                />
                <circle cx={cluster.x} cy={cluster.y} fill={cluster.color} opacity="0.14" r="38" />
                <circle cx={cluster.x} cy={cluster.y} fill={cluster.color} opacity="0.9" r="9" />
              </g>
            ))}
            <circle className={styles.clusterCore} cx="180" cy="140" r="28" />
            <text className={styles.clusterCoreText} x="180" y="145">
              Core
            </text>
          </svg>

          <div className={styles.clusterLegend}>
            {EXAMPLE_CLUSTERS.map((cluster) => (
              <div className={styles.clusterLegendRow} key={cluster.name}>
                <div>
                  <span className={styles.legendDot} style={{ background: cluster.color }} />
                  <strong>{cluster.name}</strong>
                </div>
                <p>{cluster.members.join(" / ")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentDebateGraph() {
  return (
    <div className={styles.agentGraphCard}>
      <svg
        aria-label="Multi-agent debate graph"
        className={styles.agentGraph}
        viewBox="0 0 360 372"
        role="img"
      >
        {AGENT_NODES.filter((node) => !node.center).map((node, index) => (
          <line
            key={`${node.label}-line`}
            x1="180"
            x2={node.x}
            y1="188"
            y2={node.y}
            className={styles.agentLine}
            style={{ animationDelay: `${index * 100}ms` }}
          />
        ))}

        {AGENT_NODES.map((node, index) => (
          <g key={node.label}>
            <circle
              className={styles.agentAura}
              cx={node.x}
              cy={node.y}
              data-tone={node.accent}
              r={node.center ? 44 : 34}
              style={{ animationDelay: `${index * 160}ms` }}
            />
            <circle
              className={styles.agentNode}
              cx={node.x}
              cy={node.y}
              data-tone={node.accent}
              r={node.center ? 26 : 19}
            />
            <text className={styles.agentLabel} x={node.x} y={node.y + (node.center ? 4 : 36)}>
              {node.label}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.agentTranscript}>
        <div>
          <span>Valuation</span>
          <p>The upside is real, but it is paying peak multiples for crowded confidence.</p>
        </div>
        <div>
          <span>Risk</span>
          <p>The portfolio already owns this shock through names that do not look related.</p>
        </div>
        <div>
          <span>Structure</span>
          <p>What looks like diversification is one correlation cluster with better branding.</p>
        </div>
      </div>
    </div>
  );
}

export function CounterfactualMode() {
  const [scenario, setScenario] = useState("2022 rate shock");
  const active = SCENARIOS[scenario];
  const perceivedPoints = useMemo(() => buildLinePoints(active.perceived, 430, 220), [active.perceived]);
  const actualPoints = useMemo(() => buildLinePoints(active.actual, 430, 220), [active.actual]);

  return (
    <div className={styles.counterCard}>
      <div className={styles.counterTabs} role="tablist" aria-label="Counterfactual scenarios">
        {Object.keys(SCENARIOS).map((item) => (
          <button
            key={item}
            className={styles.counterTab}
            data-active={scenario === item ? "true" : "false"}
            onClick={() => setScenario(item)}
            role="tab"
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className={styles.counterVisual}>
        <svg
          aria-label="Perceived versus structural drawdown chart"
          className={styles.counterChart}
          viewBox="0 0 430 220"
          role="img"
        >
          {[46, 92, 138, 184].map((y) => (
            <line key={y} className={styles.counterGrid} x1="12" x2="418" y1={y} y2={y} />
          ))}
          <polyline className={styles.counterPerceived} points={perceivedPoints} />
          <polyline className={styles.counterActual} points={actualPoints} />
        </svg>

        <div className={styles.counterMetrics}>
          <div>
            <span>Perceived drawdown</span>
            <strong>{active.perceivedDrawdown}</strong>
          </div>
          <div>
            <span>Structural drawdown</span>
            <strong>{active.actualDrawdown}</strong>
          </div>
          <p>{active.note}</p>
        </div>
      </div>
    </div>
  );
}

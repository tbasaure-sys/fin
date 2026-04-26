"use client";

import { useRef, useState } from "react";

import styles from "@/app/home-page.module.css";

const WORKSPACE_ITEMS = [
  { label: "Inputs", target: "inputs" },
  { label: "Attention", target: "attention" },
  { label: "Layers", target: "layers" },
  { label: "Consensus", target: "consensus" },
  { label: "Decision", target: "decision" },
];

const TABS = [
  { label: "Brief", target: "decision" },
  { label: "Layers", target: "layers" },
  { label: "Consensus", target: "consensus" },
];

const LEAD_STATS = [
  { label: "Final call", value: "Reduce" },
  { label: "Confidence", value: "72%" },
  { label: "Action status", value: "Staged" },
];

const INPUT_ROWS = [
  { title: "Market data", detail: "Price, volume, volatility" },
  { title: "Fundamentals", detail: "Cash flow, debt, margins" },
  { title: "News and sentiment", detail: "Real-time narrative shift" },
  { title: "Your portfolio", detail: "Holdings, limits, exposures" },
  { title: "Policy rules", detail: "What actions are allowed" },
];

const AGENT_ROWS = [
  { label: "Valuation layer", detail: "Is the price fair?", stance: "Support", value: "78%" },
  { label: "Risk layer", detail: "What can break first?", stance: "Warn", value: "62%" },
  { label: "Macro layer", detail: "Is the regime helping?", stance: "Neutral", value: "55%" },
  { label: "Flow layer", detail: "Are buyers real or crowded?", stance: "Warn", value: "71%" },
];

const SUPPORT_ITEMS = [
  {
    title: "Transformer-style decision engine",
    body: "The workspace reads many signals at once, then lets the important ones carry more weight.",
  },
  {
    title: "Layered debate",
    body: "Specialist layers test valuation, risk, macro, flows, and your own rules before a call is made.",
  },
  {
    title: "Attention to what matters",
    body: "Instead of showing every number, BLS Prime highlights the signals that changed the decision.",
  },
  {
    title: "Explainable action",
    body: "The final answer comes with the layers, weights, rule check, and next step that produced it.",
  },
];

export function WorkspacePreview({ brand }) {
  const [activePreviewSection, setActivePreviewSection] = useState("decision");
  const sectionRefs = useRef({});
  const activeTab = TABS.find((item) => item.target === activePreviewSection)?.target || TABS[0].target;

  function selectPreviewSection(target) {
    setActivePreviewSection(target);
    sectionRefs.current[target]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }

  return (
    <div className={styles.previewShell}>
      <aside className={styles.previewSidebar}>
        <div>
          <div className={styles.previewSidebarBrand}>{brand}</div>
          <div className={styles.previewSidebarHint}>Multi-layer transformer</div>
        </div>

        <nav className={styles.previewSidebarNav} aria-label="Workspace navigation">
          {WORKSPACE_ITEMS.map((item) => (
            <button
              className={styles.previewSidebarItem}
              data-active={activePreviewSection === item.target}
              key={item.label}
              onClick={() => selectPreviewSection(item.target)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.previewSidebarMeta}>
          <span>5 signal layers</span>
          <span>4 specialist layers</span>
          <span>1 explainable decision</span>
        </div>
      </aside>

      <div className={styles.previewMain}>
        <div className={styles.previewTopRow}>
          <div>
            <span className={styles.previewSectionLabel}>Decision engine</span>
            <strong>Powered by multi-layer transformers</strong>
          </div>

          <div className={styles.previewTopMeta}>
            <span>Apr 22</span>
            <span>Updated brief</span>
          </div>
        </div>

        <div className={styles.previewToolbar}>
          <div className={styles.previewTabs}>
            {TABS.map((item) => (
              <button
                className={styles.previewTab}
                data-active={activeTab === item.target}
                key={item.label}
                onClick={() => selectPreviewSection(item.target)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.previewSearch}>Ask: which layers changed the decision?</div>
        </div>

        <div className={styles.previewHeroGrid}>
          <section
            className={styles.previewLeadPanel}
            data-highlight={activePreviewSection === "decision"}
            ref={(node) => {
              sectionRefs.current.decision = node;
            }}
          >
            <p className={styles.previewModuleTag}>Final decision</p>
            <h3>Reduce risk. The rebound is still too fragile.</h3>
            <p>
              The layers disagree on valuation, but the attention layer gives more weight to risk,
              crowded flows, and your policy rules. The system stages a smaller action instead of a broad add.
            </p>

            <div className={styles.previewLeadStats}>
              {LEAD_STATS.map((item) => (
                <div className={styles.previewLeadStat} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <aside
            className={styles.previewReferencePanel}
            data-highlight={activePreviewSection === "inputs"}
            ref={(node) => {
              sectionRefs.current.inputs = node;
            }}
          >
            <p className={styles.previewModuleTag}>1. Inputs</p>
            <h3>The engine starts with five plain sources.</h3>
            <div className={styles.previewReferenceList}>
              {INPUT_ROWS.map((item) => (
                <article className={styles.previewReferenceRow} key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <div className={styles.previewDetailGrid}>
          <section
            className={styles.previewChartPanel}
            data-highlight={activePreviewSection === "attention"}
            ref={(node) => {
              sectionRefs.current.attention = node;
            }}
          >
            <p className={styles.previewModuleTag}>2. Attention layers</p>
            <h3>The model finds what changed the decision.</h3>
            <div className={styles.previewTransformerMap} aria-label="Transformer attention map">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <span key={`left-${item}`} />
              ))}
              <div className={styles.previewAttentionCore}>
                {[0, 1, 2].map((item) => (
                  <i key={`core-${item}`} />
                ))}
              </div>
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <span key={`right-${item}`} />
              ))}
            </div>
            <p className={styles.previewSmallCopy}>
              In human terms: it pays less attention to noise and more attention to the few signals
              that actually change what you should do.
            </p>
          </section>

          <section
            className={styles.previewTablePanel}
            data-highlight={activePreviewSection === "layers"}
            ref={(node) => {
              sectionRefs.current.layers = node;
            }}
          >
            <p className={styles.previewModuleTag}>3. Layer outputs</p>
            <h3>Specialist layers test the same move.</h3>
            <div className={styles.previewAgentList}>
              {AGENT_ROWS.map((item) => (
                <article className={styles.previewAgentRow} data-stance={item.stance.toLowerCase()} key={item.label}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <em>{item.stance}</em>
                  <b>{item.value}</b>
                </article>
              ))}
            </div>
          </section>

          <section
            className={styles.previewResearchPanel}
            data-highlight={activePreviewSection === "consensus"}
            ref={(node) => {
              sectionRefs.current.consensus = node;
            }}
          >
            <p className={styles.previewModuleTag}>4. Aggregation</p>
            <h3>Consensus forms only after the layers are weighted.</h3>
            <div className={styles.previewConsensusGrid}>
              {["Valuation", "Risk", "Macro", "Flow"].map((item, index) => (
                <div className={styles.previewConsensusRow} key={item}>
                  <span>{item}</span>
                  <i style={{ width: `${64 - index * 11}%` }} />
                  <strong>{22 - index * 3}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section
            className={styles.previewRepairPanel}
            data-highlight={activePreviewSection === "decision"}
            ref={(node) => {
              sectionRefs.current.action = node;
            }}
          >
            <p className={styles.previewModuleTag}>5. Action plan</p>
            <h3>What the decision becomes in the real portfolio.</h3>
            <div className={styles.previewTable}>
              {[
                { label: "Trim", detail: "Reduce the fragile winner first", value: "-1.5%" },
                { label: "Wait", detail: "Do not add broad risk yet", value: "24h" },
                { label: "Review", detail: "Re-run when flow and repair agree", value: "Next" },
              ].map((item) => (
                <div className={styles.previewTableRow} key={item.label}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function SupportStrip() {
  return (
    <div className={styles.supportStrip}>
      {SUPPORT_ITEMS.map((item, index) => (
        <article className={styles.supportItem} key={item.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{item.title}</strong>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

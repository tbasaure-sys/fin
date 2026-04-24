"use client";

import { useRef, useState } from "react";

import styles from "@/app/home-page.module.css";

const WORKSPACE_ITEMS = [
  { label: "Decision", target: "decision" },
  { label: "Rules", target: "rules" },
  { label: "Visibility", target: "visibility" },
  { label: "Real rebound", target: "rebound" },
  { label: "Repair", target: "repair" },
];

const TABS = [
  { label: "Brief", target: "decision" },
  { label: "Rules", target: "rules" },
  { label: "Repair", target: "repair" },
];

const LEAD_STATS = [
  { label: "Allowed to add", value: "No" },
  { label: "Visible bets", value: "2/4" },
  { label: "Best repair", value: "Switch" },
];

const REFERENCES = [
  { title: "Rule check", detail: "The move must pass your own guardrails before it can be treated as legitimate." },
  { title: "Visibility check", detail: "The market must be clear enough to reward the reason you own the position." },
  { title: "Rebound check", detail: "Price recovery is not enough if the structure underneath has not improved." },
];

const REPAIR_ROWS = [
  { label: "Trim", detail: "Crowded winner that bounced without repairing", value: "-1.5%" },
  { label: "Add", detail: "Quality name whose structure improved first", value: "+1.0%" },
  { label: "Hold back", detail: "Keep cash until the rebound becomes real", value: "+0.5%" },
];

const SUPPORT_ITEMS = [
  {
    title: "Rules before action",
    body: "The app tells you whether a move is allowed by your own guardrails before emotion gets a vote.",
  },
  {
    title: "Know when a bet is hidden",
    body: "Some ideas are right but invisible because the market is moving everything together.",
  },
  {
    title: "Separate real repair from fake calm",
    body: "A rebound can look good on the screen while the portfolio underneath is still fragile.",
  },
];

export function WorkspacePreview({ brand }) {
  const [activePreviewSection, setActivePreviewSection] = useState(WORKSPACE_ITEMS[0].target);
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
          <div className={styles.previewSidebarHint}>Capital judgment system</div>
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
          <span>Rules enforced</span>
          <span>Visibility checked</span>
          <span>Repair staged</span>
        </div>
      </aside>

      <div className={styles.previewMain}>
        <div className={styles.previewTopRow}>
          <div>
            <span className={styles.previewSectionLabel}>Sample workspace</span>
            <strong>A plain-English review before capital moves</strong>
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

          <div className={styles.previewSearch}>Ask: am I allowed to add risk?</div>
        </div>

        <div className={styles.previewHeroGrid}>
          <section
            className={styles.previewLeadPanel}
            data-highlight={activePreviewSection === "decision"}
            ref={(node) => {
              sectionRefs.current.decision = node;
            }}
          >
            <p className={styles.previewModuleTag}>Today&apos;s decision</p>
            <h3>Wait. The rebound is not real enough yet.</h3>
            <p>
              You may have cash available, but the rules still block a broad add.
              The market is bouncing before the portfolio structure has repaired.
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
            <p className={styles.previewModuleTag}>Inputs</p>
            <h3>What the answer checks</h3>
            <div className={styles.previewReferenceList}>
              {REFERENCES.map((item) => (
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
            data-highlight={activePreviewSection === "rules"}
            ref={(node) => {
              sectionRefs.current.rules = node;
            }}
          >
            <p className={styles.previewModuleTag}>Rules</p>
            <h3>Your guardrails decide what has standing.</h3>
            <div className={styles.previewRuleStack}>
              <article>
                <span>Rule 4</span>
                <strong>No large add while fake-rebound risk is high.</strong>
              </article>
              <article>
                <span>Evidence</span>
                <strong>Too weak to suspend the rule.</strong>
              </article>
              <article>
                <span>Result</span>
                <strong>Action blocked. Review again after structure improves.</strong>
              </article>
            </div>
          </section>

          <section
            className={styles.previewTablePanel}
            data-highlight={activePreviewSection === "visibility"}
            ref={(node) => {
              sectionRefs.current.visibility = node;
            }}
          >
            <p className={styles.previewModuleTag}>Visibility</p>
            <h3>Two ideas are right, but the market cannot see them yet.</h3>
            <div className={styles.previewVisibilityMeter} aria-label="Market clarity">
              <span style={{ width: "32%" }} />
            </div>
            <p className={styles.previewSmallCopy}>
              When everything moves together, a good company thesis can become temporarily invisible.
              The risk remains, but the reward cannot show up yet.
            </p>
          </section>

          <section
            className={styles.previewResearchPanel}
            data-highlight={activePreviewSection === "rebound"}
            ref={(node) => {
              sectionRefs.current.rebound = node;
            }}
          >
            <p className={styles.previewModuleTag}>Real or fake calm?</p>
            <h3>Prices improved. The repair did not.</h3>
            <p>
              BLS Prime separates a comforting price bounce from a real improvement in the portfolio.
              That prevents you from adding risk just because the screen looks calmer.
            </p>
          </section>

          <section
            className={styles.previewRepairPanel}
            data-highlight={activePreviewSection === "repair"}
            ref={(node) => {
              sectionRefs.current.repair = node;
            }}
          >
            <p className={styles.previewModuleTag}>Repair candidate</p>
            <h3>One small switch can improve the book without adding new cash.</h3>
            <div className={styles.previewTable}>
              {REPAIR_ROWS.map((item) => (
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

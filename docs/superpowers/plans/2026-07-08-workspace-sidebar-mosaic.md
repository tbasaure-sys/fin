# Workspace Sidebar MOSAIC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `/app` into three primary sidebar tabs: Holdings, AURORA, and MOSAIC.

**Architecture:** Keep the existing `components/terminal-app.jsx` workspace state machine and API calls, but change the top-level navigation taxonomy and panel composition. Holdings will own portfolio, holdings editing, decisions, and stress testing; AURORA will own candidate/research/valuation panels; MOSAIC will own Macro Brain, MOSAIC pressure, liquidity, theses, defeaters, and sources.

**Tech Stack:** Next.js App Router, React 18 client component, CSS modules, existing Node test runner.

## Global Constraints

- Do not change macro, stress, or valuation engine logic.
- Do not add dependencies.
- Preserve `/api/macro-brain`, `/api/mosaic`, and workspace API routes.
- Keep old hash links usable by mapping them to the nearest new tab.
- Show fallback macro data honestly when live macro is unavailable.
- Do not expose raw local filesystem paths in normal user-facing UI.
- Do not touch unrelated dirty worktree files.

---

### Task 1: Replace Workspace Navigation With Three Primary Tabs

**Files:**
- Modify: `components/terminal-app.jsx`
- Modify: `tests-node/aurora-copy-map-ui.test.mjs`

**Interfaces:**
- Consumes: existing `WorkspaceSidebar`, `selectWorkspaceSection(sectionId)`, `activeWorkspaceSection`.
- Produces: top-level sections `holdings`, `aurora`, `mosaic`; legacy hash mapping into those ids.

- [ ] **Step 1: Update navigation constants**

In `components/terminal-app.jsx`, replace `WORKSPACE_NAV` with exactly three entries:

```js
const WORKSPACE_NAV = [
  {
    id: "holdings",
    href: "#holdings",
    label: "Holdings",
    priority: "Portfolio",
    detail: "Positions and stress",
    title: "Holdings",
    body: "Portfolio, performance, holdings, decisions, and stress testing.",
  },
  {
    id: "aurora",
    href: "#aurora",
    label: "AURORA",
    priority: "Valuation",
    detail: "Company research",
    title: "AURORA",
    body: "Valuation, research, candidates, and company-level judgment.",
  },
  {
    id: "mosaic",
    href: "#mosaic",
    label: "MOSAIC",
    priority: "Macro",
    detail: "External context",
    title: "MOSAIC",
    body: "Macro Brain, global pressure, liquidity, theses, defeaters, and sources.",
  },
];
```

Set `WORKSPACE_NAV_ADVANCED` to an empty array so the sidebar has no separate advanced top-level section.

- [ ] **Step 2: Update bilingual copy keys**

In `WORKSPACE_SHELL_COPY.en.nav` and `.es.nav`, define only `holdings`, `aurora`, and `mosaic` as primary copy keys. Example English tuple:

```js
holdings: ["Holdings", "Positions and stress", "What owns my risk?", "Portfolio, positions, decisions, and stress testing.", "Portfolio"],
aurora: ["AURORA", "Company research", "What is this business worth?", "Valuation, research, candidates, and company-level judgment.", "Valuation"],
mosaic: ["MOSAIC", "External context", "What is changing outside?", "Macro Brain, global pressure, liquidity, theses, defeaters, and sources.", "Macro"],
```

Example Spanish tuple:

```js
holdings: ["Holdings", "Cartera y stress", "¿Qué domina mi riesgo?", "Cartera, posiciones, decisiones y stress test.", "Cartera"],
aurora: ["AURORA", "Research de compañías", "¿Cuánto vale este negocio?", "Valoración, research, candidatos y juicio por compañía.", "Valoración"],
mosaic: ["MOSAIC", "Contexto externo", "¿Qué está cambiando afuera?", "Macro Brain, presión global, liquidez, tesis, defeaters y fuentes.", "Macro"],
```

- [ ] **Step 3: Update legacy hash mapping**

Update `LEGACY_HASH_REDIRECT` so old links continue working:

```js
const LEGACY_HASH_REDIRECT = {
  today: "holdings",
  cashflow: "holdings",
  money: "holdings",
  portfolio: "holdings",
  risk: "holdings",
  diversification: "holdings",
  stress: "holdings",
  "stress-engine": "holdings",
  decisions: "holdings",
  positions: "holdings",
  cartera: "holdings",
  candidates: "aurora",
  research: "aurora",
  factorlab: "aurora",
  macro: "mosaic",
  macrobrain: "mosaic",
  mosaic: "mosaic",
};
```

- [ ] **Step 4: Update tests for new hashes**

In `tests-node/aurora-copy-map-ui.test.mjs`, update the Stress Engine CTA assertions:

```js
assert.match(gateSource, /PORTFOLIO_WORKSPACE_HREF\s*=\s*"\/app#holdings"/);
assert.match(loginSource, /DEFAULT_NEXT\s*=\s*"\/app#holdings"/);
assert.match(terminalSource, /stress:\s*"holdings"/);
assert.match(terminalSource, /macro:\s*"mosaic"/);
assert.match(terminalSource, /factorlab:\s*"aurora"/);
```

If `stress-account-gate.jsx` and `app/login/page.js` still point to `#risk`, update them to `#holdings` in this task as well.

- [ ] **Step 5: Run focused test**

Run:

```powershell
npm run test:web -- tests-node/aurora-copy-map-ui.test.mjs
```

Expected: the copy-map test passes.

---

### Task 2: Recompose Panels Under Holdings, AURORA, and MOSAIC

**Files:**
- Modify: `components/terminal-app.jsx`

**Interfaces:**
- Consumes: existing panel components `PortfolioPanel`, `HoldingsPanel`, `StressEnginePanel`, `SimplePhantomDiversificationPanel`, `TodayDecisionPanel`, `FactorLabWorkspacePanel`, `ResearchLoopPanel`, `EquityResearchPanel`, `MosaicObservatoryPanel`, `MacroBrainWorkspacePanel`.
- Produces: `activeWorkspacePanels` switch cases for `holdings`, `aurora`, and `mosaic`.

- [ ] **Step 1: Replace the active section switch**

In `components/terminal-app.jsx`, replace cases for `risk`, `candidates`, `macro`, `decisions`, `holdings`, and `today` with:

```jsx
switch (activeWorkspaceSection) {
  case "aurora":
    activeWorkspacePanels = (
      <>
        <FactorLabWorkspacePanel portfolioModule={portfolioModule} />
        <ResearchLoopPanel workspaceId={workspaceId} />
        <EquityResearchPanel dashboard={dashboard} workspaceId={workspaceId} />
      </>
    );
    break;
  case "mosaic":
    activeWorkspacePanels = (
      <MosaicCommandCenter />
    );
    break;
  case "holdings":
  default:
    activeWorkspacePanels = (
      <>
        <PortfolioPanel
          compact
          onRangeChange={setPortfolioRange}
          language={language}
          onOpenRisk={() => selectWorkspaceSection("holdings")}
          portfolioModule={portfolioModule}
          range={portfolioRange}
          showAuroraAction
          xray={dashboard?.xray}
        />
        <StressEnginePanel portfolioValueUsd={portfolioModule?.analytics?.totalValueUsd} workspaceId={workspaceId} />
        <SimplePhantomDiversificationPanel portfolioModule={portfolioModule} workspaceId={workspaceId} />
        <HoldingsPanel
          holdingDraft={holdingDraft}
          onHoldingDraftChange={updateHoldingDraft}
          onSubmitHoldingDraft={submitHoldingDraft}
          onSubmitTrade={submitTradeInstruction}
          onTradeInstructionChange={setTradeInstruction}
          pendingTrade={Boolean(pendingKey?.startsWith("trade:"))}
          portfolioModule={portfolioModule}
          holdingDraftError={holdingDraftError}
          tradeInstructionError={tradeInstructionError}
          tradeInstruction={tradeInstruction}
        />
        <TodayDecisionPanel
          blockedAction={blockedAction}
          onDefer={(action) => recordDecision(action, "deferred")}
          onReject={(action) => recordDecision(action, "rejected")}
          onStage={stageAction}
          pendingKey={pendingKey}
          primaryAction={primaryAction}
          stateSummary={stateSummary}
        />
        {escrowPanel}
      </>
    );
    break;
}
```

- [ ] **Step 2: Remove obsolete empty-portfolio redirect**

Replace the effect that redirects from `risk` to `holdings` with a no-op or delete it:

```js
useEffect(() => {
  if (!portfolioModule || holdingsCount > 0 || activeWorkspaceSection !== "holdings") return;
}, [activeWorkspaceSection, holdingsCount, portfolioModule]);
```

Prefer deleting the effect if no hooks ordering issue is introduced.

- [ ] **Step 3: Run build syntax check**

Run:

```powershell
npm run build
```

Expected: build completes or fails only for pre-existing unrelated environment configuration. Syntax must be clean.

---

### Task 3: Build MOSAIC Command Center Wrapper

**Files:**
- Modify: `components/terminal-app.jsx`
- Modify: `components/workspace/shell.module.css`

**Interfaces:**
- Consumes: `useMosaicLiveSnapshot()`, `useMacroBrainLiveSnapshot()`, `MosaicObservatoryPanel`, `MacroBrainWorkspacePanel`.
- Produces: `MosaicCommandCenter` component that shows world read, MOSAIC, Macro Brain, liquidity, theses, defeaters, and source trust.

- [ ] **Step 1: Add helper formatters**

Near `mosaicScoreLabel`, add:

```js
function macroPercentLabel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${Math.round(parsed)}%`;
}

function macroSignedLabel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed > 0 ? `+${Math.round(parsed)}` : `${Math.round(parsed)}`;
}
```

- [ ] **Step 2: Add `MacroLiquidityPanel`**

Add a component that accepts `snapshot` from Macro Brain and renders `snapshot.liquidity.summary` plus component rows:

```jsx
function MacroLiquidityPanel({ snapshot }) {
  const liquidity = snapshot?.liquidity || {};
  const rows = safeList(liquidity.components);
  return (
    <section className={styles.mosaicCommandPanel}>
      <div className={styles.mosaicCommandPanelHead}>
        <p className={styles.kicker}>Liquidity</p>
        <h3>Liquidez macro</h3>
        <span>{liquidity.status || "Sin lectura"}</span>
      </div>
      <p className={styles.mosaicCommandCopy}>{liquidity.summary || "La lectura de liquidez todavía no está disponible."}</p>
      <div className={styles.mosaicCommandRows}>
        {rows.map((item) => (
          <div className={styles.mosaicCommandRow} key={item.label}>
            <strong>{item.label}</strong>
            <span>{item.stance}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add `MacroThesisPanel`**

Render thesis rows with title, expression, confidence, confirmations, contradictions, and invalidation.

- [ ] **Step 4: Add `MacroDefeaterPanel`**

Render `snapshot.nextChecks` as ordered rows with event, timing, and value.

- [ ] **Step 5: Add `MacroSourcesPanel`**

Render Macro Brain source status and MOSAIC provider/source-gap summaries. Do not render raw `sourcePath`.

- [ ] **Step 6: Add `MosaicCommandCenter`**

Implement:

```jsx
function MosaicCommandCenter() {
  const macro = useMacroBrainLiveSnapshot();
  const mosaic = useMosaicLiveSnapshot();
  const pressure = Number(macro.snapshot?.stability?.pressure);
  return (
    <div className={styles.mosaicCommandCenter}>
      <section className={styles.panel}>
        <div className={styles.mosaicCommandHero}>
          <div>
            <p className={styles.kicker}>MOSAIC</p>
            <h2>Contexto externo</h2>
            <p>{macro.snapshot?.shortRead || mosaic.snapshot?.headline}</p>
          </div>
          <div className={styles.mosaicCommandStats}>
            <span><strong>{mosaic.snapshot?.index ?? "-"}</strong> desequilibrio</span>
            <span><strong>{mosaic.snapshot?.conflict ?? "-"}</strong> conflicto</span>
            <span><strong>{macroPercentLabel(pressure)}</strong> stress PSM</span>
          </div>
        </div>
      </section>
      <MosaicObservatoryPanel />
      <MacroBrainWorkspacePanel />
      <MacroLiquidityPanel snapshot={macro.snapshot} />
      <MacroThesisPanel snapshot={macro.snapshot} />
      <MacroDefeaterPanel snapshot={macro.snapshot} />
      <MacroSourcesPanel macro={macro.snapshot} mosaic={mosaic.snapshot} />
    </div>
  );
}
```

This first pass may call the existing hooks separately inside child panels and wrapper. If duplicate polling becomes noisy, refactor to pass snapshots into `MosaicObservatoryPanel` and `MacroBrainWorkspacePanel` in a later pass.

- [ ] **Step 7: Add CSS classes**

Add styles for:

```css
.mosaicCommandCenter
.mosaicCommandHero
.mosaicCommandStats
.mosaicCommandPanel
.mosaicCommandPanelHead
.mosaicCommandCopy
.mosaicCommandRows
.mosaicCommandRow
```

Use existing color tokens, `border-radius: 14px`, and responsive grid collapse at existing media breakpoints.

- [ ] **Step 8: Run tests**

Run:

```powershell
npm run test:web
npm run build
```

Expected: web tests pass and build succeeds.


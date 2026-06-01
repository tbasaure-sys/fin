# BLS Prime v2 Build Blueprint

Date: 2026-05-31

Source of truth: `docs/BLS_PRIME_PRODUCT_ARCHITECTURE_REDESIGN_REVIEW.md`

Mandate: BLS Prime v2 is a private decision workspace. It is not a dashboard, research platform, screener, model showroom, or educational glossary. It exists to answer, in plain language:

- What should I do today?
- Can I invest?
- What is my biggest risk?
- Am I truly diversified?
- What deserves attention?
- What could be wrong?

This document is the buildable architecture for the v2 rebuild.

## 0. Product Definition

BLS Prime v2 is a daily decision brief for capital. The system reads the user's money plan, holdings, portfolio structure, risk overlap, research candidates, prior decisions, and evidence quality. It returns one canonical object: a Decision Packet.

Every screen either:

1. Feeds the packet.
2. Explains the packet.
3. Records a decision against the packet.
4. Shows what happened after the decision.

Anything that does none of those four things is secondary or advanced.

## Phase 1: Target Product Architecture

### Final Primary Navigation

The review proposed five primary destinations. Keep the five, but rename one for precision:

1. Today's Brief
   - User question: What should I do today?
   - Product role: default home, canonical Decision Packet, changed-since-last-time, next action.

2. Can I Invest?
   - User question: Can I put more money to work?
   - Product role: monthly money plan, reserve status, safe contribution, funding source, cash blockers.

3. Biggest Risk
   - User question: What can hurt me most?
   - Product role: dominant exposure, concentration, hidden overlap, stress behavior, what reduces risk.

4. Opportunities
   - User question: What deserves attention?
   - Product role: candidate shortlist, why surfaced, why rejected, research packet, evidence quality.

5. Decisions
   - User question: What have I staged, rejected, accepted, or learned?
   - Product role: staged moves, decision memory, outcomes, recheck triggers, audit trail.

### Secondary Navigation

Secondary navigation is utility, not daily workflow:

- Portfolio Data
  - Holdings, prices, cost basis, import/edit, data health.

- Rules
  - User policy, limits, mandates, sizing constraints.

- Advanced
  - Model diagnostics, FactorLab internals, raw rule builder, state contract, JSON exports.

- Help
  - Contextual help, methodology, terms. This replaces a mandatory glossary.

### Navigation Challenge And Decision

Do not split "Biggest Risk" and "Truly Diversified" into separate primary nav items. They are different user questions, but in the product they share the same evidence spine: holdings, concentration, stress overlap, repeated exposures, and recovery room. Splitting them would recreate the current problem: the user has to decide which model surface to inspect.

Final decision:

- Primary nav item: Biggest Risk
- Inside it: two tabs or sections:
  - What can hurt me most?
  - Am I truly diversified?

### Core Objects

The core objects are:

- `DecisionPacket`
  - The canonical current answer. It assembles the daily recommendation, constraints, evidence, next action, and memory hooks.

- `MoneyRead`
  - The user's investable capacity for the current month.

- `RiskRead`
  - The largest plain-language risk and what would reduce it.

- `DiversificationRead`
  - Visible diversification versus real diversification and hidden overlap.

- `OpportunityCandidate`
  - A candidate idea, why it surfaced, why it may be wrong, and what to do next.

- `AssumptionCheck`
  - The main assumption that could break the packet.

- `ActionCandidate`
  - A possible action: wait, add, trim, repair, investigate, reject, monitor, update data.

- `DecisionEvent`
  - User response to a packet or action: accepted, staged, rejected, deferred, executed, cancelled.

- `OutcomeEvent`
  - What happened after the decision at fixed horizons.

- `EvidenceItem`
  - A source, calculation, model output, or rejected evidence item supporting or weakening the packet.

- `AuditEntry`
  - A versioned record of how the packet was created, changed, or superseded.

### User Flows

#### Flow A: Login To Value

1. User signs in.
2. App loads `DecisionPacket.current`.
3. If the packet is complete, Today's Brief shows the current recommendation and five answer tiles.
4. If data is incomplete, Today's Brief shows the best available answer plus the single missing input that unlocks value.
5. User can stage, reject, defer, or inspect.

Success state: user knows the answer within 60 seconds.

#### Flow B: Can I Invest?

1. User opens Can I Invest.
2. App shows investable amount, safe contribution, reserve status, and blocker.
3. User updates income, expenses, reserve, target contribution.
4. MoneyRead updates.
5. DecisionPacket recomputes.

Success state: the money answer changes the decision, not just a form.

#### Flow C: Biggest Risk

1. User opens Biggest Risk.
2. App shows one dominant risk.
3. App names positions involved.
4. App shows whether the portfolio is truly diversified.
5. App gives one risk-reducing action or says no action needed.

Success state: user can explain the portfolio's main vulnerability in one sentence.

#### Flow D: Opportunities

1. User opens Opportunities.
2. App shows candidates, not factors.
3. User picks a candidate.
4. App shows why surfaced, portfolio fit, what could be wrong, evidence rejected, and research.
5. User investigates, stages, rejects, or monitors.

Success state: user sees ideas as decisions with constraints, not a ranked list.

#### Flow E: Decisions And Memory

1. User opens Decisions.
2. App shows staged moves, recent decisions, and observed outcomes.
3. User can execute, cancel, defer, or review.
4. OutcomeEvent is attached after fixed horizons.
5. Memory adjusts future packet phrasing and confidence.

Success state: the product gets more trustworthy because it remembers.

### Decision Hierarchy

The product must resolve decisions in this order:

1. Data availability
   - If the system lacks enough data, say what is missing and what can still be answered.

2. Hard constraints
   - No action can override user rules, reserve breach, unavailable evidence, or invalid date logic.

3. Money permission
   - The product must know whether new capital is available before suggesting adds.

4. Risk permission
   - The product must know whether the current risk state allows more exposure.

5. Diversification truth
   - The product must know whether a new action adds a new bet or repeats an existing one.

6. Opportunity quality
   - Only after money, risk, and diversification gates pass should candidates compete.

7. Trust check
   - The product must name what could be wrong and when to recheck.

8. Action
   - The output is act, wait, repair, investigate, update data, or reject.

## Phase 2: Canonical Object: Decision Packet

### Purpose

The Decision Packet is the system of record for what BLS Prime believes the user should know now. It replaces the dashboard as the product center.

Dashboard data remains an input. It is not the product surface.

### Inputs

Required inputs:

- `workspace_summary`
- `state_summary`
- `personal_finance`
- `modules.portfolio`
- `xray`
- `recoverability_balance_sheet`
- `confidence_panel`
- `frontier`
- `escrow.items`
- `memory.recentEvents`
- `decisionEvents`

Optional inputs:

- `modules.risk`
- `modules.screener`
- `equity_research_runs`
- `position_stories`
- `counterfactual_ledger`
- `capital_twin`
- `mandate`
- `alerts`
- `watchlist`
- backend state v2
- analog/fiber evidence

### Outputs

The packet outputs:

- one current answer
- one recommended next action
- money permission
- biggest risk
- real diversification read
- opportunity shortlist
- assumption check
- evidence strength
- changed-since-last-time
- blocked actions
- staged actions
- audit trail
- memory hooks

### Data Structure

Version: `decision_packet.v1`

```json
{
  "id": "packet_01H...",
  "workspaceId": "workspace_123",
  "schemaVersion": "decision_packet.v1",
  "packetVersion": 1,
  "status": "current",
  "asOf": "2026-05-31T20:00:00.000Z",
  "marketDataAsOf": "2026-05-31",
  "language": "en",
  "headline": {
    "label": "Today",
    "title": "Wait before adding broad risk.",
    "summary": "You have investable cash, but the portfolio is still too dependent on the same few risks.",
    "stance": "wait",
    "tone": "warn"
  },
  "recommendation": {
    "actionType": "wait",
    "title": "Wait before adding broad risk",
    "body": "Review hidden overlap first. If overlap improves, stage a smaller add.",
    "primaryCta": {
      "label": "Review biggest risk",
      "target": "#risk"
    },
    "secondaryCtas": [
      { "label": "Ask why", "target": "chat:packet" },
      { "label": "Stage smaller move", "target": "action:stage" }
    ],
    "confidence": "usable",
    "urgency": "today"
  },
  "answers": {
    "canInvest": {
      "status": "allowed_with_limits",
      "title": "$2,500 available this month",
      "summary": "Reserve is funded, but broad adds are limited by overlap.",
      "amount": 2500,
      "currency": "USD",
      "reserveStatus": "healthy",
      "safeContribution": 1000,
      "blocker": null,
      "target": "#invest"
    },
    "biggestRisk": {
      "status": "watch",
      "title": "Too much of the book depends on the same growth/rate trade.",
      "summary": "Five names look separate but behave similarly under stress.",
      "dominantRisk": "Repeated growth and rates exposure",
      "positions": ["AAPL", "MSFT", "NVDA"],
      "riskReducer": "Do not add broad tech exposure until overlap falls.",
      "urgency": "monitor",
      "target": "#risk"
    },
    "diversification": {
      "status": "overstated",
      "title": "The portfolio looks broader than it behaves.",
      "visibleBets": 12,
      "realBets": 5,
      "hiddenOverlapPct": 0.32,
      "plainSummary": "Some positions repeat the same risk instead of adding protection.",
      "target": "#risk:diversification"
    },
    "opportunities": {
      "status": "investigate",
      "title": "Two ideas deserve attention, but neither is cleared for a broad add.",
      "count": 2,
      "target": "#opportunities"
    },
    "wrongness": {
      "status": "open",
      "title": "The main assumption: current overlap remains the binding constraint.",
      "couldBeWrongIf": "A lower-correlation candidate or hedge changes the risk mix.",
      "watch": ["real diversification improves", "cash reserve falls", "candidate evidence weakens"],
      "target": "#evidence"
    }
  },
  "changedSinceLastTime": [
    {
      "id": "change_cash_001",
      "type": "money",
      "title": "Investable cash improved",
      "summary": "Monthly room increased by $500.",
      "tone": "good"
    },
    {
      "id": "change_overlap_001",
      "type": "risk",
      "title": "Hidden overlap worsened",
      "summary": "The same few positions now explain more of stress behavior.",
      "tone": "warn"
    }
  ],
  "actions": {
    "primary": {
      "id": "action_review_overlap",
      "type": "review",
      "title": "Review biggest risk",
      "summary": "Confirm whether new money would repeat an existing bet.",
      "target": "#risk",
      "status": "available",
      "source": "packet"
    },
    "available": [],
    "blocked": [
      {
        "id": "blocked_broad_add",
        "type": "add",
        "title": "Do not add broad risk yet",
        "reason": "Hidden overlap is still high.",
        "reopensWhen": "Real diversification improves or add is funded by a risk-reducing trim."
      }
    ],
    "staged": []
  },
  "opportunities": [
    {
      "id": "opp_aapl_001",
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "status": "investigate",
      "whySurfaced": ["Quality is stable", "Valuation moved closer to target"],
      "whatCouldBeWrong": ["Adds to an already crowded exposure"],
      "portfolioFit": "repeats_existing_risk",
      "evidenceStrength": "usable",
      "trustBadges": [
        {
          "type": "date_safe",
          "label": "Uses only data available at the decision date"
        }
      ],
      "target": "#opportunities/aapl"
    }
  ],
  "evidence": {
    "strength": "usable",
    "summary": "Enough to guide sizing and waiting; not enough to widen risk.",
    "supports": [],
    "weakens": [],
    "rejected": [
      {
        "id": "reject_lead_001",
        "title": "Rejected future-looking signal",
        "reason": "This rule used data that would not have existed at the decision date.",
        "visibility": "secondary"
      }
    ],
    "sources": []
  },
  "memory": {
    "lastPacketId": "packet_previous",
    "relatedDecisionEventIds": [],
    "openOutcomeIds": [],
    "profileHint": "The system is still learning your decision pattern."
  },
  "audit": {
    "createdBy": "decision_packet_builder.v1",
    "inputSnapshotHash": "sha256:...",
    "sourceDashboardVersion": "dashboard.v1",
    "modelVersions": {
      "normalizer": "v1",
      "decisionOs": "v1",
      "opportunityDesk": "v1"
    },
    "warnings": [],
    "generatedAt": "2026-05-31T20:00:00.000Z"
  }
}
```

### Packet Statuses

- `draft`
  - Built but not shown because required inputs are missing.

- `current`
  - Active packet shown on Today's Brief.

- `staged`
  - A packet with one or more user-staged actions.

- `accepted`
  - User accepted or executed the primary action.

- `rejected`
  - User rejected the recommendation.

- `deferred`
  - User chose to wait and recheck.

- `superseded`
  - A newer packet replaced it.

- `observed`
  - At least one outcome horizon has been attached.

- `expired`
  - The packet is stale relative to market/data age rules.

### State Transitions

```text
draft -> current
current -> staged
current -> accepted
current -> rejected
current -> deferred
current -> superseded
staged -> accepted
staged -> cancelled
staged -> expired
accepted -> observed
rejected -> observed
deferred -> superseded
superseded -> archived
```

Rules:

- Only one packet per workspace may be `current`.
- New current packet supersedes the previous current packet.
- User action always writes a `DecisionEvent`.
- Outcome attachment never mutates the packet body; it appends `OutcomeEvent`.
- Packet text is immutable after creation except status fields.

### Persistence Model

Add migration `db/migrations/0014_decision_packets.sql`.

```sql
CREATE TABLE IF NOT EXISTS bls_decision_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  packet_key TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'decision_packet.v1',
  packet_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'current',
  as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  market_data_as_of TEXT,
  input_snapshot_hash TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, packet_key, packet_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS bls_decision_packets_current_idx
  ON bls_decision_packets (workspace_id)
  WHERE status = 'current';

CREATE INDEX IF NOT EXISTS bls_decision_packets_workspace_idx
  ON bls_decision_packets (workspace_id, as_of DESC);

CREATE TABLE IF NOT EXISTS bls_decision_packet_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  packet_id UUID REFERENCES bls_decision_packets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_decision_packet_audit_workspace_idx
  ON bls_decision_packet_audit (workspace_id, created_at DESC);
```

Decision events can keep using the existing workspace decision event table. Add `packetId` and `packetVersion` into the JSON payload first; add physical columns later only if querying needs it.

### Builder Contract

Create:

- `lib/server/decision-packet.js`
- `contracts/decision_packet_v1.schema.json`
- `app/api/v1/workspaces/[workspaceId]/decision-packet/route.js`

Server API:

```js
export function buildDecisionPacket(dashboard, options = {}) {}
export async function getCurrentDecisionPacket(workspaceId) {}
export async function createDecisionPacketForWorkspace(workspaceId, dashboard) {}
export async function recordDecisionPacketEvent(workspaceId, packetId, event) {}
```

`getWorkspaceDashboard()` should return:

```js
{
  ...dashboard,
  decision_packet: currentPacket
}
```

During migration, if no persisted packet exists, build one in memory from the dashboard.

### Versioning

Version fields:

- `schemaVersion`
  - Shape of the packet. Starts with `decision_packet.v1`.

- `packetVersion`
  - Per-packet increment when the same packet key is rebuilt materially.

- `builderVersion`
  - Internal builder implementation version.

- `inputSnapshotHash`
  - Hash of normalized inputs used to create the packet.

- `sourceDashboardVersion`
  - Version of the source normalized dashboard contract.

Versioning policy:

- Add fields only in minor builder changes.
- Breaking shape changes require `decision_packet.v2`.
- UI must ignore unknown fields.
- Packet body is append-only by version, not edited in place.

### Audit Trail

Audit entries:

- `packet_created`
- `packet_shown`
- `packet_superseded`
- `action_staged`
- `action_accepted`
- `action_rejected`
- `action_deferred`
- `outcome_attached`
- `evidence_rejected`
- `packet_build_failed`

Each audit entry includes:

- `workspaceId`
- `packetId`
- `eventType`
- `actor`: system or user id
- `timestamp`
- `payload`
- `source`

### Decision Memory Integration

Existing functions:

- `appendWorkspaceDecisionEvent`
- `getWorkspaceDecisionEvents`
- `getWorkspaceEscrowDecisions`
- `getWorkspaceCounterfactualLedger`

Decision Packet integration:

- Every user response includes `packetId`.
- Every staged action includes `packetId`, `actionId`, and `inputSnapshotHash`.
- Outcome events attach to `packetId` and `decisionEventId`.
- Memory profile uses packet outcomes to adjust:
  - confidence phrasing
  - repeated user behavior
  - common rejected actions
  - overtrading / underacting warnings

## Phase 3: New Today's Brief

### Above The Fold

Desktop above the fold must include:

1. Current recommendation
2. One-sentence reason
3. Five answer tiles:
   - Can I invest?
   - Biggest risk
   - Truly diversified?
   - What changed?
   - Next step
4. Primary action button
5. Evidence strength badge
6. Stale/data warning if present

Nothing else.

No glossary prompt. No model map. No raw module grid. No advanced labels.

### Desktop Wireframe

```text
+--------------------------------------------------------------------------+
| BLS Prime                                      Updated 4:10 PM  Ask       |
+----------------------+---------------------------------------------------+
| Today's Brief        | Today: Wait before adding broad risk              |
| Can I Invest?        | You have cash, but overlap is still the blocker. |
| Biggest Risk         | [Review biggest risk] [Ask why]                 |
| Opportunities        | Evidence: Usable     Data: Fresh                |
| Decisions            |                                                   |
|----------------------| +---------------+ +---------------+             |
| Portfolio Data       | | Can I invest? | | Biggest risk |             |
| Rules                | | $2,500 room   | | Growth/rates |             |
| Advanced             | | Limit add     | | 3 positions  |             |
| Help                 | +---------------+ +---------------+             |
|                      | +---------------+ +---------------+             |
|                      | | Diversified?  | | What changed |             |
|                      | | Looks 12/real5| | Cash up/risk |             |
|                      | +---------------+ +---------------+             |
|                      | +-----------------------------------+             |
|                      | | Next step: Review hidden overlap  |             |
|                      | +-----------------------------------+             |
+----------------------+---------------------------------------------------+
```

### Below The Fold

Below the fold:

1. Why this answer
   - 3 evidence bullets.

2. What could be wrong
   - main assumption, falsifier, recheck trigger.

3. Staged or blocked actions
   - current staged moves, blocked moves, what reopens them.

4. Opportunity preview
   - top 2 candidates with reason and warning.

5. Data health
   - missing inputs, stale data, connected holdings, last market date.

6. Advanced disclosure
   - "Show methodology" button.

### Component Tree

Create:

```text
components/workspace-v2/
  workspace-shell.jsx
  workspace-nav.jsx
  todays-brief.jsx
  decision-packet-card.jsx
  answer-tile.jsx
  evidence-strength.jsx
  changed-since-last-time.jsx
  action-strip.jsx
  can-i-invest-panel.jsx
  biggest-risk-panel.jsx
  opportunities-panel.jsx
  decisions-panel.jsx
  portfolio-data-panel.jsx
  advanced-panel.jsx
  empty-state.jsx
```

Phase 1 can keep these inside `components/terminal-app.jsx` to reduce churn, but phase 2 should split them.

### Today's Brief State Logic

State priority:

1. Loading
   - show skeleton, not stale content.

2. Fatal unavailable
   - show "We cannot build today's brief yet" and one recovery action.

3. Missing setup
   - show partial packet and one setup step.

4. Stale data
   - show packet but badge "Using last complete market snapshot."

5. Ready
   - show current packet.

6. User action pending
   - lock action buttons, keep packet visible.

7. Packet superseded
   - show banner "Newer brief available" and refresh.

### Empty States

No holdings:

```text
Today's answer: Add positions to unlock portfolio risk.
Can I invest? We can still calculate monthly room.
Biggest risk: Not available until positions are added.
Next step: Add your first position.
```

No money plan:

```text
Today's answer: Portfolio risk can be read, but new-money guidance is blocked.
Can I invest? Add income, expenses, and reserve.
Next step: Set money plan.
```

No backend snapshot:

```text
Today's answer: Using limited data.
Can I invest? Available if money plan exists.
Biggest risk: Last known portfolio read unavailable.
Next step: Refresh or update positions.
```

No opportunities:

```text
No idea is cleared for attention right now.
Reason: either evidence is weak, fit is poor, or the portfolio already has enough exposure.
```

### Loading States

Skeleton sequence:

- Header skeleton: 1 line.
- Recommendation skeleton: 2 lines.
- Five tile skeletons.
- No shimmer over full page; keep it calm.
- If refreshing in background, keep old packet visible and show small "Updating..." badge.

### Mobile Version

Mobile hierarchy:

```text
[Today: Wait before adding broad risk]
[Reason]
[Primary button]
[Evidence badge]

[Can I invest?]
[Biggest risk]
[Truly diversified?]
[What changed?]
[Next step]

[Why this answer]
[What could be wrong]
[Staged actions]
[Opportunities]
```

Mobile nav:

- Bottom tab bar:
  - Today
  - Invest
  - Risk
  - Ideas
  - Decisions

Secondary items move into a menu.

## Phase 4: Navigation Rebuild

### Current To Future Map

| Current module | Current file/function | Future location |
| --- | --- | --- |
| `TruthInterfacePanel` | `components/terminal-app.jsx` | Replace with `TodaysBrief` powered by `decision_packet`. |
| `TodayDecisionPanel` | `components/terminal-app.jsx` | Merge into Today's Brief below fold and Decisions. |
| `PersonalFinancePanel` | `components/terminal-app.jsx` | `CanIInvestPanel`; keep form but reframe as invest permission. |
| `PortfolioPanel` | `components/terminal-app.jsx` | Secondary `PortfolioDataPanel`; summary feeds Biggest Risk. |
| `SimplePhantomDiversificationPanel` | `components/terminal-app.jsx` | Biggest Risk -> "Am I truly diversified?" section. |
| `PhantomDiversificationPanel` | `components/terminal-app.jsx` | Advanced methodology only. |
| `DiversificationClockCard` | `components/terminal-app.jsx` | Mini visualization inside Biggest Risk, not home. |
| `EquityResearchPanel` | `components/equity-research-panel.jsx` | Opportunities -> candidate detail/research. |
| `FactorLabWorkspacePanel` | `components/terminal-app.jsx` | Replace with `OpportunityDeskPanel`; old one moves to Advanced. |
| `FactorLabWorkstation` | `components/factorlab-workstation.jsx` | Advanced standalone, not public product path. |
| `HoldingsPanel` | `components/terminal-app.jsx` | Secondary `PortfolioDataPanel`. |
| `escrowItems` display | `terminal-app.jsx` and API escrow routes | Rename surface to Staged Actions inside Decisions. Keep API initially. |
| `ledgerItems` | `terminal-app.jsx` | Decisions -> Recent outcomes. |
| `AlertsPanel` | `terminal-app.jsx` | Today's Brief data warning or Decisions audit feed. |
| `RecoverabilityMapFigure` | `terminal-app.jsx` | Advanced or Risk detail only. |
| `PortfolioChat` | `components/portfolio-chat.jsx` | Global "Ask about this brief" with packet context. |

### New Workspace Nav

Replace `WORKSPACE_NAV` with:

```js
const WORKSPACE_NAV = [
  {
    id: "today",
    legacyIds: ["brief"],
    label: "Today's Brief",
    shortLabel: "Today",
    question: "What should I do today?",
    detail: "Answer and next step",
  },
  {
    id: "invest",
    legacyIds: ["cashflow", "money"],
    label: "Can I Invest?",
    shortLabel: "Invest",
    question: "How much can I put to work?",
    detail: "Cash, reserve, funding",
  },
  {
    id: "risk",
    legacyIds: ["portfolio", "diversification"],
    label: "Biggest Risk",
    shortLabel: "Risk",
    question: "What can hurt me most?",
    detail: "Risk and real diversification",
  },
  {
    id: "opportunities",
    legacyIds: ["research", "factorlab"],
    label: "Opportunities",
    shortLabel: "Ideas",
    question: "What deserves attention?",
    detail: "Candidates and research",
  },
  {
    id: "decisions",
    legacyIds: ["holdings-today"],
    label: "Decisions",
    shortLabel: "Decisions",
    question: "What did I stage or learn?",
    detail: "Staged actions and memory",
  },
];
```

Secondary:

```js
const WORKSPACE_UTILITY_NAV = [
  { id: "data", legacyIds: ["holdings"], label: "Portfolio Data" },
  { id: "rules", legacyIds: ["mandate", "policy"], label: "Rules" },
  { id: "advanced", legacyIds: ["factorlab-advanced", "state", "frontier"], label: "Advanced" },
  { id: "help", legacyIds: ["glossary", "guide"], label: "Help" },
];
```

### URL Strategy

Canonical URL stays `/app`.

Hash routes:

- `/app#today`
- `/app#invest`
- `/app#risk`
- `/app#risk:diversification`
- `/app#opportunities`
- `/app#opportunities:AAPL`
- `/app#decisions`
- `/app#data`
- `/app#rules`
- `/app#advanced`

Standalone `/factorlab` remains during migration but becomes:

- `/factorlab` redirects to `/app#advanced:factorlab` if authenticated.
- If not authenticated, `/login?next=/app%23advanced%3Afactorlab`.
- Public nav should no longer promote FactorLab. If a link remains, label it "Opportunity Desk" and route to `/app#opportunities`.

### Backward Compatibility

Hash aliases:

```js
const LEGACY_SECTION_ALIASES = {
  cashflow: "invest",
  money: "invest",
  portfolio: "risk",
  diversification: "risk",
  research: "opportunities",
  factorlab: "opportunities",
  holdings: "data",
};
```

During transition:

- Old hashes still work.
- On old hash load, set active section to new destination.
- Optionally replace URL hash silently after render.

Do not break:

- `/app#factorlab` from public links.
- `/login?next=/app%23factorlab`.
- API routes.
- Existing decision and escrow persistence.

## Phase 5: Rebuild FactorLab As Opportunity Desk

### Purpose

Opportunity Desk answers:

> What deserves attention, and why might it be wrong?

It is not a factor lab, screener, or operator workbench in primary UI.

### Information Architecture

Primary Opportunity Desk layout:

1. Shortlist
   - Candidate name/ticker.
   - Status: Investigate, Watch, Rejected, Blocked, Stageable.
   - Why surfaced.
   - What could be wrong.
   - Portfolio fit.
   - Evidence strength.

2. Candidate Detail
   - Plain-language thesis.
   - Why now.
   - Fit with current portfolio.
   - Biggest objection.
   - What would change the view.

3. Research
   - Memo.
   - Value.
   - Debate.
   - Sources.
   - Audit.

4. Trust
   - Evidence used.
   - Evidence rejected.
   - Data date.
   - Missing evidence.
   - "Would this have been knowable?"

5. Advanced
   - Rule builder.
   - Factor definitions.
   - Point-in-time diagnostics.
   - Raw JSON and DAG.

### Candidate Workflow

1. Candidate appears in shortlist.
2. User sees:
   - "Why it surfaced"
   - "What could be wrong"
   - "Portfolio fit"
3. User chooses:
   - Investigate
   - Stage
   - Reject
   - Monitor
4. The choice writes a DecisionEvent linked to current packet.
5. If staged, it becomes a Staged Action in Decisions.

### Research Workflow

1. User opens candidate.
2. EquityResearchPanel loads inside candidate detail.
3. Research is framed as:
   - What supports this?
   - What argues against it?
   - What data is missing?
   - What would make this actionable?
4. User exits back to shortlist without losing context.

### Trust Workflow

Every candidate must show:

- Data as-of date.
- Evidence strength.
- At least one "what could be wrong."
- Rejected evidence if any.
- Portfolio fit.

Trust badge examples:

- "Date-safe"
- "Uses only available data"
- "Weak source coverage"
- "Repeats existing risk"
- "Blocked by money plan"
- "Rejected future-looking signal"

### Advanced Workflow

Advanced users can open:

- Rule builder.
- Operator catalog.
- DAG.
- Spec JSON.
- Point-in-time audit.

This is under `/app#advanced:factorlab`, not the main Opportunities screen.

### What Stays

- Date-safety / lookahead rejection.
- Explainable rules.
- Candidate scoring.
- Ability to inspect rule logic.
- Ranking as an internal mechanism.

### What Moves

- FactorLab name moves to Advanced.
- Rule builder moves to Advanced.
- Operator catalog moves to Advanced.
- DAG and JSON move to Advanced.

### What Becomes Advanced

- `log_return`
- `rolling_std`
- `neutralize`
- `asof_join`
- `top_k`
- Parquet/CSV source mode
- 63 operator catalog
- Spec JSON

### What Disappears From Primary UI

- Synthetic entity IDs.
- "Mom Z", "Quality Z", "Resvol" labels.
- "Refusal" as a tab.
- Developer workbench layout.

## Phase 6: Plain-Language System

### Naming Dictionary

| Current term | Replacement | Reason | Visibility |
| --- | --- | --- | --- |
| Decision Cockpit | Today's Brief | The user wants today's answer, not cockpit metaphor. | Primary |
| Respuesta actual | Today's answer | Direct and plain. | Primary |
| Respuesta ejecutiva | Main answer | Less corporate. | Primary |
| Plan de dinero | Can I Invest? | Converts tool into question. | Primary |
| Caja invertible | Available to invest | User-native. | Primary |
| Reserva de caja | Cash reserve | Standard language. | Primary |
| Reserva de opcionalidad | Room to wait | Explains benefit. | Primary |
| Independence Real | Real diversification | Clearer user question. | Primary |
| Solapamiento | Hidden overlap | Names the problem. | Primary |
| Solapamiento estructural | Hidden overlap under stress | More concrete. | Secondary |
| Phantom Diversification | Hidden overlap | Avoids proprietary jargon. | Hidden |
| Recoverability | Room to recover | Explains why it matters. | Secondary |
| Recoverability balance sheet | Recovery room | Less accounting/model-heavy. | Advanced |
| Structural breadth | Independent bets | Plain. | Secondary |
| Risk topology | Risks that move together | Descriptive. | Advanced |
| X-Ray | Portfolio scan | Less gimmicky. | Secondary |
| Frontier | Allowed actions | User cares what is open. | Secondary |
| Confidence panel | Evidence strength | Names value. | Primary |
| Evidence drawer | Why this answer | User-native. | Secondary |
| Escrow | Staged actions | Avoids legal/finance baggage. | Primary |
| Movements prepared | Staged moves | Direct. | Primary |
| FactorLab | Opportunity Desk | User cares about ideas. | Hidden/Advanced |
| Ranking | Shortlist | Less model-centric. | Primary |
| Rejection | Rejected evidence | Explains what was rejected. | Secondary |
| Lookahead | Future-looking evidence | Plain. | Secondary |
| Operator catalog | Rule library | Advanced but understandable. | Advanced |
| DAG view | Rule path | Less technical. | Advanced |
| Spec JSON | Exported rule | Advanced/export. | Advanced |
| Mom Z | Price strength | Plain. | Secondary |
| Quality Z | Business quality | Plain. | Secondary |
| Resvol | Volatility | Plain. | Secondary |
| State contract | Data snapshot | User does not need contract concept. | Hidden |
| Mandate | Your rules | User-owned. | Secondary |
| Policy | Your rules | User-owned. | Secondary |
| Legitimacy | Allowed by your rules | Concrete. | Hidden |
| Failure modes | What can break | Concrete. | Secondary |
| Repairs | Ways to fix it | Concrete. | Primary/Secondary |
| Twin | What changes if you do it | Outcome-oriented. | Advanced |
| Analog evidence | Similar past states | Plain. | Secondary |
| Visible fiber | Similar states that later split | Advanced explanation. | Advanced |
| Stance | Current answer | More direct. | Primary |
| Authority | How strongly the system can speak | Needs explanation. | Advanced |
| Guardrails | Your rules | Keep as secondary if context supports it. | Secondary |

### Visibility Rules

Primary:

- Can appear above the fold.
- Must answer a user question.
- Must require no glossary.

Secondary:

- Can appear below the fold.
- Must be explainable in one sentence.

Advanced:

- Can appear behind disclosure.
- Intended for expert inspection.

Hidden:

- Internal only.
- Never appears in normal UI.

## Phase 7: Implementation Roadmap

### Phase 1: Quick Wins

Initiatives:

- Replace nav labels with v2 labels.
- Add legacy hash alias map.
- Rename visible "FactorLab" entry to "Opportunities."
- Rename "Escrow" surfaces to "Staged actions."
- Hide glossary prompt from default first view.
- Add "What changed since last time" placeholder on Today's Brief.

Complexity: Low

Dependencies:

- `components/terminal-app.jsx`
- `components/workspace/shell.module.css`
- `components/language-layer.jsx`

Risk:

- Broken hash links.
- Spanish/English phrase drift.

Expected user impact:

- Immediate comprehension improvement.

### Phase 2: Navigation Refactor

Initiatives:

- Replace `WORKSPACE_NAV`.
- Add `WORKSPACE_UTILITY_NAV`.
- Move current panel switch cases to new destinations.
- Introduce `normalizeWorkspaceSection(hash)`.
- Add utility nav rendering.

Complexity: Medium

Dependencies:

- Existing `activeWorkspacePanels` switch.
- Existing hash routing in `terminal-app.jsx`.

Risk:

- Users with old links may land in wrong section.
- More content per section could become too dense.

Expected user impact:

- The product becomes question-first.

### Phase 3: Today's Brief

Initiatives:

- Build `decision_packet` in server response.
- Replace `TruthInterfacePanel` with `TodaysBrief`.
- Add five answer tiles.
- Add empty/loading/stale states.
- Add packet-aware chat prompts.

Complexity: High

Dependencies:

- `lib/server/decision-packet.js`
- `lib/server/dashboard-service.js`
- `components/terminal-app.jsx`
- `components/workspace/shell.module.css`
- tests for dashboard response.

Risk:

- Packet builder may oversimplify or misstate a decision.
- Existing dashboard fields can be sparse.

Expected user impact:

- Largest improvement. User gets value within one minute.

### Phase 4: Opportunity Desk

Initiatives:

- Create `OpportunityDeskPanel`.
- Convert screener/FactorLab outputs into candidates.
- Embed `EquityResearchPanel` in candidate detail.
- Move old FactorLab to Advanced.
- Change public link from FactorLab to Opportunities.

Complexity: Medium/High

Dependencies:

- `components/equity-research-panel.jsx`
- `components/factorlab-workstation.jsx`
- `components/terminal-app.jsx`
- future opportunity normalizer.

Risk:

- If candidates remain synthetic, trust drops.
- Research panel may feel too heavy inside Opportunities.

Expected user impact:

- Opportunity discovery becomes understandable.

### Phase 5: Decision Memory

Initiatives:

- Add `packetId` to decision events.
- Create decision packet persistence migration.
- Attach staged actions to packet actions.
- Add outcome horizon placeholders.
- Build Decisions screen around staged/rejected/observed.

Complexity: High

Dependencies:

- `workspace-store.js`
- Neon migration
- existing `escrow` routes
- `decision-packet.js`

Risk:

- Migration risk in existing user workspaces.
- Event duplication if old and new flows both write decisions.

Expected user impact:

- Repeat usage improves because the product remembers and closes loops.

### Phase 6: Advanced Mode

Initiatives:

- Create `AdvancedPanel`.
- Move FactorLab workbench into Advanced.
- Move model terms and raw diagnostics behind disclosure.
- Add methodology views for evidence, date safety, and hidden overlap.

Complexity: Medium

Dependencies:

- Navigation refactor.
- Existing FactorLab components.

Risk:

- Expert users may feel functionality disappeared if migration messaging is weak.

Expected user impact:

- Normal users see less machinery; expert users still have access.

## Phase 8: Codebase Execution Plan

### Files To Modify First

1. `components/terminal-app.jsx`
   - Replace nav constants.
   - Add legacy hash aliases.
   - Replace section switch mapping.
   - Add `TodaysBrief` shell.
   - Rename visible labels.

2. `components/workspace/shell.module.css`
   - Add v2 brief layout.
   - Add answer tile grid.
   - Add mobile bottom nav styles.
   - Add utility nav styles.

3. `lib/server/dashboard-service.js`
   - Include `decision_packet` in dashboard payload.
   - Build fallback packet on dashboard fallback.

4. `lib/server/decision-os.js`
   - Stop exposing v2-inappropriate labels as product copy.
   - Keep model objects as inputs.

5. `components/language-layer.jsx`
   - Add v2 dictionary entries.
   - Ensure no new Spanglish appears.

6. `components/public-home-experience.jsx`
   - Replace public FactorLab link with Opportunity Desk path.

### Files To Create

1. `lib/server/decision-packet.js`
   - Packet builder, fallback builder, summary helpers.

2. `contracts/decision_packet_v1.schema.json`
   - JSON schema for packet.

3. `app/api/v1/workspaces/[workspaceId]/decision-packet/route.js`
   - GET current packet.
   - POST rebuild or record packet event later.

4. `db/migrations/0014_decision_packets.sql`
   - Packet persistence and audit.

5. `components/workspace-v2/todays-brief.jsx`
   - Once split from `terminal-app.jsx`.

6. `components/workspace-v2/opportunity-desk.jsx`
   - New Opportunity Desk.

7. `components/workspace-v2/decision-memory.jsx`
   - Decisions screen.

8. `docs/BLS_PRIME_LANGUAGE_STANDARD.md`
   - Extract naming dictionary after implementation stabilizes.

### Files To Split Later

`components/terminal-app.jsx` is too large and carries too many product concerns. Split after the first working v2 pass:

- `components/workspace-v2/workspace-shell.jsx`
- `components/workspace-v2/navigation.jsx`
- `components/workspace-v2/todays-brief.jsx`
- `components/workspace-v2/can-i-invest.jsx`
- `components/workspace-v2/biggest-risk.jsx`
- `components/workspace-v2/opportunity-desk.jsx`
- `components/workspace-v2/portfolio-data.jsx`
- `components/workspace-v2/advanced.jsx`

Do not split before the first v2 behavior works; otherwise the refactor will obscure product validation.

### Files To Remove Or Deprecate

Do not delete immediately.

Deprecate:

- `components/factorlab-workstation.jsx` as public-facing product.
- `app/factorlab/page.js` as promoted standalone destination.

Keep temporarily:

- `/factorlab` route as compatibility redirect or advanced route.
- existing escrow API routes.
- existing module API routes.

### Technical Debt

- `terminal-app.jsx` mixes nav, state, forms, charting, decisions, and language cleanup.
- Current dashboard object exposes internal model names directly to UI.
- FactorLab is static/synthetic in places and can damage trust.
- Escrow naming is baked into APIs and UI.
- Normalizers contain product copy; copy bugs can originate server-side.
- Decision events are not yet packet-centered.
- Spanish cleanup depends partly on render-time language layer rather than source-level naming discipline.

### Migration Risks

- Hash links from public site and emails.
- Existing staged actions in escrow format.
- Users familiar with FactorLab path.
- Missing data causing weak Decision Packets.
- Old model terms still leaking from server payload.
- Duplicated nav if utility and primary destinations overlap.

### UX Regression Risks

- Over-collapsing advanced detail could frustrate expert users.
- Biggest Risk section could become too broad if not structured.
- Today's Brief could become too static unless "what changed" is real.
- Opportunity Desk could feel fake if candidates are not real names.
- Mobile bottom nav could hide secondary data editing too deeply.

### First Patch Sequence

Patch 1:

- Add `lib/server/decision-packet.js`.
- Add in-memory packet builder.
- Add `decision_packet` to `getWorkspaceDashboard()`.
- No UI change yet.

Patch 2:

- Replace `WORKSPACE_NAV`.
- Add hash aliasing.
- Map old panels into new sections.
- Keep existing components.

Patch 3:

- Replace `TruthInterfacePanel` with `TodaysBrief` reading `dashboard.decision_packet`.
- Keep old modules below fold or mapped sections.

Patch 4:

- Create `OpportunityDeskPanel`.
- Move old `FactorLabWorkspacePanel` into Advanced.

Patch 5:

- Add persistence migration and packet audit.
- Attach `packetId` to decision events and staged actions.

Patch 6:

- Split `terminal-app.jsx` into workspace-v2 components.

## Phase 9: Design Constitution

These are permanent product rules for BLS Prime v2.

1. Answer before explaining.
   - The first visible text must be the user's answer, not the system's method.

2. Every primary screen must answer a user question.
   - If a screen cannot be phrased as a user question, it is secondary or advanced.

3. No internal model names in primary UI.
   - Model names belong in Advanced or audit trails.

4. The user receives value before learning vocabulary.
   - If a term needs a glossary, it cannot be above the fold.

5. One current answer beats many panels.
   - The Decision Packet is the product center.

6. Money permission comes before opportunity.
   - Do not suggest adding risk before the investable amount and reserve are known.

7. Risk permission comes before ranking.
   - Do not rank ideas as actionable if the current risk state blocks them.

8. Diversification must be plain.
   - Say "looks like 12 bets, behaves like 5" instead of exposing methodology first.

9. Evidence must include what could be wrong.
   - Every recommendation needs a falsifier or recheck trigger.

10. Rejected evidence builds trust.
    - Show rejected future-looking evidence as a trust feature in plain language.

11. Staged is not executed.
    - Staged actions must always feel reversible and unexecuted.

12. Decision memory is a product surface.
    - The product must remember what was recommended, chosen, rejected, and observed.

13. Advanced mode is real, but separate.
    - Expert depth remains available without polluting first use.

14. Empty states must still answer something.
    - Missing holdings does not block money guidance; missing money plan does not block risk reading.

15. Avoid repeated slogans.
    - Repetition of catchy advice reduces trust.

16. Speak in consequences, not abstractions.
    - "This repeats your biggest risk" beats "correlation cluster elevated."

17. No synthetic candidates in primary UI.
    - If a candidate is synthetic, label it as demo or keep it out of normal product.

18. The system must know when not to be loud.
    - Evidence strength controls tone and action assertiveness.

19. The first minute is sacred.
    - Do not spend first-minute attention on methodology, setup tours, or glossary.

20. Progressive disclosure is the default.
    - Summary first, then why, then evidence, then methodology.

21. Product copy is correctness.
    - Robotic, mixed-language, or placeholder copy is a product bug.

22. The interface should reduce anxiety.
    - Screens should make the next step calmer and more obvious.

23. The app does not pretend to predict perfectly.
    - It guides decisions under uncertainty and names uncertainty explicitly.

24. Every action needs a "why now" and "what reopens/closes it."
    - This creates trust and memory.

25. The product is a workspace, not a terminal.
    - Dense is acceptable; self-exposing machinery is not.

## Build Definition Of Done

BLS Prime v2 is ready when a first-time private-workspace user can say, within 60 seconds:

- I know what the product thinks I should do today.
- I know whether I can invest more.
- I know the biggest risk.
- I know whether my diversification is real or overstated.
- I know what deserves attention.
- I know what could be wrong.
- I know what button to press next.

Engineering definition:

- `decision_packet` exists in the workspace payload.
- Today's Brief renders from `decision_packet`, not from scattered dashboard fields.
- Primary nav is question-first.
- Old hashes route correctly.
- Opportunity Desk replaces FactorLab in normal UI.
- Staged actions and decision events carry packet identifiers.
- Advanced mode contains the model machinery.
- Tests cover packet fallback, hash aliasing, and no forbidden primary labels.

## Immediate Next Engineering Task

Start with the smallest vertical slice:

1. Add `lib/server/decision-packet.js`.
2. Build a packet from the existing dashboard object.
3. Attach it as `dashboard.decision_packet`.
4. Render a simple Today's Brief from that packet.
5. Keep old panels accessible underneath.

This gives v2 its spine without breaking the current product.

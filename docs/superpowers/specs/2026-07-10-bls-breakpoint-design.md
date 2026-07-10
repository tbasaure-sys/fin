# BLS Breakpoint — Public Acquisition Feature Design

Date: 2026-07-10

Repository: `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin`

Status: Proposed for user review

## 1. Decision

Add **BLS Breakpoint** as the primary public feature and acquisition entry point for BLS Prime.

Breakpoint answers one question:

> What is the smallest economically feasible change in beliefs that makes today's price stop clearing my required return?

This is an addition to BLS Prime, not a rebrand or replacement.

- The product name remains **BLS Prime**.
- The current institutional visual identity remains.
- AURORA, FactorLab, Stress Engine, portfolio tools, authentication, and the private terminal remain available.
- Breakpoint becomes the first proof of value on the public homepage.
- Existing modules move to a secondary section below Breakpoint and remain reachable through navigation and direct routes.
- The first Breakpoint result is public and requires no account.
- Account creation appears only after the visitor has received and interacted with a result.

## 2. Problem Being Solved

BLS Prime currently exposes substantial research machinery, but a zero-user product cannot ask a stranger to understand a terminal before proving value.

The public experience currently asks the visitor to understand multiple modules:

- AURORA for valuation;
- FactorLab for candidate ranking;
- Stress Engine for portfolio risk;
- the private terminal for the integrated workflow.

This structure is coherent for an activated user, but it is too much product taxonomy for a first visit. The visitor still needs to answer:

> Why should I try this unknown product right now?

Breakpoint supplies a cold-start answer with one universally understood input: a ticker.

The design optimizes for:

1. value before signup;
2. an understandable result in under 90 seconds;
3. utility without prior user history;
4. trust through inspectable evidence and assumptions;
5. a result worth sharing or challenging;
6. a natural bridge into the existing BLS Prime terminal.

## 3. Product Thesis

Every stock price can be represented by a family of operating futures, not one arbitrary implied scenario.

Breakpoint identifies:

- the operating beliefs most responsible for value;
- the feasible family of states that can justify current price;
- the nearest sparse change that crosses a required-return boundary;
- the evidence for and against the decisive belief;
- the next observable metric that could move the boundary.

The public proposition is:

> **Enter a ticker. See exactly what has to be true at today's price.**

The supporting interaction promise is:

> **Change one belief. Watch the decision flip.**

The system does not issue a personalized buy or sell instruction. It exposes the boundary between market-implied beliefs and a user-selected required return.

## 4. Intended First User

The initial audience is a serious self-directed equity investor who:

- follows individual public companies;
- already has a ticker or thesis in mind;
- understands revenue, margins, cash flow, and return at a practical level;
- does not want to build a complete spreadsheet before testing an idea;
- wants to know what today's price demands, not receive a generic rating;
- will inspect evidence when a conclusion surprises them.

Breakpoint must still be understandable to a financially literate non-technical visitor. Internal vocabulary such as manifold, posterior, sparsity penalty, kernel, and calibration packet must never appear in the primary result.

## 5. Approaches Considered

### Approach A — Breakpoint replaces the entire public and private product

This would produce the simplest product story but would discard working terminal capabilities and force a premature rebrand.

Decision: rejected.

### Approach B — Breakpoint exists only as another module card

This preserves the existing hierarchy but fails the acquisition goal. A visitor would still need to choose among four modules before receiving value.

Decision: rejected.

### Approach C — Breakpoint is the public front door; the terminal remains the deeper system

The homepage presents Breakpoint as the primary interactive feature. Existing modules remain visible in a secondary “Inside the terminal” section and retain their routes. Breakpoint results contain contextual paths into AURORA and, when relevant, Stress Engine or the private workspace.

Decision: selected.

## 6. Product Hierarchy

The new hierarchy is:

```text
BLS Prime
├── Public Breakpoint experience
│   ├── Ticker entry
│   ├── Breakpoint result
│   ├── Assumption interaction
│   ├── Evidence inspection
│   └── Fork/share
└── BLS Prime Terminal
    ├── AURORA
    ├── FactorLab
    ├── Stress Engine
    └── Portfolio workspace
```

Breakpoint is the lead feature, not a new brand above BLS Prime.

Approved naming:

- Product: **BLS Prime**
- Feature: **Breakpoint** or **BLS Breakpoint**
- Deep product: **BLS Prime Terminal**

Disallowed framing:

- renaming the company or app to Breakpoint;
- removing BLS Prime from the wordmark or metadata;
- presenting AURORA, FactorLab, or Stress as deprecated;
- inventing a separate Breakpoint account or subscription identity;
- replacing the private terminal with the public result page.

## 7. Information Architecture

### `/`

The public homepage remains the BLS Prime homepage.

Its order becomes:

1. BLS Prime navigation and language control.
2. Breakpoint hero with ticker input.
3. Breakpoint example or live result preview.
4. Explanation of the three result layers.
5. “Inside the BLS Prime Terminal” with AURORA, FactorLab, and Stress Engine.
6. Existing workflow explanation, trust/disclaimer, and footer.

The existing module cards are retained but become visually secondary. They must not compete with the Breakpoint input above the fold.

### `/breakpoint/[ticker]`

Public, indexable base result for a supported ticker.

Examples:

```text
/breakpoint/TXN
/breakpoint/MSFT
```

The base page renders the latest accepted immutable Breakpoint run for the ticker. It includes a timestamp and run receipt.

### `/breakpoint/[ticker]/[runId]`

Public immutable run URL. This is the authoritative share target for a specific price, data vintage, hurdle, horizon, and engine version.

### Fork state

A fork changes one or more user-controlled assumptions while preserving the parent run.

MVP fork URLs use a signed, URL-safe state token referencing the immutable parent run:

```text
/breakpoint/TXN/[runId]?fork=[signedState]
```

Fork pages are shareable but use `noindex,follow` to avoid search duplication. The base ticker page remains canonical.

### Existing routes

These remain intact:

- `/aurora`
- `/factorlab`
- `/stress`
- `/login`
- `/app`
- `/terms`

No existing deep link should change as part of Breakpoint V1.

## 8. Public Navigation

Desktop navigation:

- BLS Prime wordmark → `/`
- Breakpoint → homepage input or `/breakpoint/TXN` example
- Terminal → module section on homepage
- Methodology → Breakpoint methodology drawer/page in a later increment; V1 uses an inline methodology disclosure
- Sign in → existing signin flow

Mobile navigation may collapse Breakpoint and Terminal links into a menu, but Sign in and language control remain reachable.

“Create workspace” is not the primary hero CTA after this change. The primary action is the ticker submission. Workspace creation remains available after a result and in the terminal section.

## 9. First-Session Journey

### Step 1 — Enter ticker

Hero content:

```text
BLS Prime · Breakpoint

Enter a ticker. See exactly what has to be true at today's price.

[ TXN                         ] [ Find the breakpoint ]

No account required · Sources and assumptions included
```

The field:

- accepts 1–12 characters;
- normalizes to uppercase;
- supports listed symbols containing `.` or `-`;
- provides an accessible label;
- submits with Enter;
- never requests an email before analysis.

### Step 2 — Loading

The loading state explains real work without exposing engine names:

1. Reading the latest accepted company snapshot.
2. Mapping the futures consistent with market price.
3. Finding the nearest decision boundary.
4. Checking the decisive assumptions against evidence.

No fake percentage progress is shown. Each completed stage receives a checkmark. A run exceeding the public latency budget returns a queued state with a retryable run URL rather than holding the page indefinitely.

### Step 3 — Executive result

The result begins with exactly three blocks:

#### What the price needs

A maximum of three plain-language required beliefs, ordered by value sensitivity.

#### Where the case breaks

One decisive sentence describing the minimum sufficient disagreement.

#### What to watch next

One to three observable metrics, source dates, or filing events that would move the conclusion.

The result must answer before showing a chart.

### Step 4 — Interactive belief surface

The primary visualization displays two decisive drivers:

- X axis: dominant driver one;
- Y axis: dominant driver two;
- market-clearing family as a band, not a single dot;
- feasible, stretched, and incoherent regions;
- the selected required-return boundary;
- the nearest Breakpoint;
- the visitor's fork point after an edit.

The chart must remain useful in grayscale and may not rely on red/green alone.

The visitor can change:

- required return: 8%, 10%, or 12%;
- one or both displayed drivers within validated ranges;
- confidence response: yes, no, or uncertain for each decisive belief.

V1 uses a fixed five-year horizon. Additional horizons are excluded to reduce interpretation ambiguity.

### Step 5 — Evidence

Each decisive belief has:

- strongest supporting evidence;
- strongest contradictory evidence;
- source type;
- source date;
- direct source link when licensing permits;
- whether the input is reported, estimated, assumed, or generated;
- data freshness and trust state.

The visitor can inspect evidence without creating an account.

### Step 6 — Fork and share

“Fork this view” creates an assumption diff against the immutable parent run.

The share card includes:

- BLS Prime branding;
- ticker and analyzed price;
- timestamp;
- required-return hurdle;
- decisive Breakpoint sentence;
- one compact source/freshness line;
- “Illustrative research output · not financial advice.”

The share card must never include an unsupported Buy, Sell, or price-target badge.

### Step 7 — Conversion after proof

Only after interaction does the product offer:

- **Watch this Breakpoint** → create account/sign in;
- **Open the full AURORA research** → `/aurora?ticker=...`;
- **Test portfolio consequence** → existing Stress/workspace account flow;
- **Request another ticker** → lightweight request form that may accept email optionally.

## 10. Result Language

Allowed primary language:

- “The price can clear your selected return hurdle when…”
- “The nearest decision boundary is…”
- “This belief is stretched relative to…”
- “The case no longer clears the selected hurdle if…”
- “Evidence is incomplete; BLS cannot establish a defensible Breakpoint.”

Disallowed primary language:

- “Buy”
- “Sell”
- “Strong Buy”
- “Guaranteed return”
- “The market is wrong”
- “BLS predicts”
- “AI recommends”
- certainty unsupported by the run's confidence gate

## 11. Calculation Definition

### 11.1 Inputs

Breakpoint consumes an accepted AURORA pipeline result containing:

- current market price and timestamp;
- normalized economic drivers;
- market-expectations surface;
- feasibility manifold;
- probabilistic valuation surface;
- value-driver gradient;
- source governance;
- data trust;
- evidence signals;
- sector/industry policy;
- run and engine versions.

### 11.2 Market-clearing family

The current price does not imply one unique future. Breakpoint defines a market-clearing family from feasible surface cells whose modeled value falls within an explicit tolerance around current enterprise/equity value.

V1 tolerance:

- within ±3% of current market price after per-share normalization;
- only cells classified as plausible or stretched;
- incoherent cells are excluded.

If fewer than five viable cells clear the tolerance, the run is marked `insufficient_market_family` and no precise Breakpoint is rendered.

### 11.3 Decision boundary

The decision boundary is the set of feasible states that produce the selected annualized expected-return hurdle over five years.

V1 hurdles:

- 8%
- 10% default
- 12%

The calculation must use the probabilistic valuation/IRR contract when available. It may not substitute a price-to-target shortcut that ignores dilution, reinvestment, or terminal economics.

### 11.4 Sparse Breakpoint search

Candidate driver changes are normalized by empirical or posterior dispersion so that a one-point margin change and a one-point growth change are comparable in economic distance.

The solver minimizes:

1. normalized distance from the nearest member of the market-clearing family;
2. number of changed drivers;
3. feasibility penalty;
4. source/data uncertainty penalty.

Subject to:

- the expected return crossing the selected hurdle;
- the candidate remaining inside the feasible manifold;
- sector-specific constraints;
- no use of data unavailable at the run timestamp.

V1 searches one-driver and two-driver explanations. Three-or-more-driver explanations are summarized as “no sparse Breakpoint found” rather than shown as precise.

### 11.5 Direction

Breakpoint reports both sides when defensible:

- nearest improvement needed to clear the hurdle;
- nearest deterioration that causes the case to stop clearing it.

The executive result selects the side relevant to current state:

- if the market-clearing family already clears the hurdle, lead with the nearest deterioration;
- if it does not clear the hurdle, lead with the nearest improvement;
- if the state straddles the hurdle, state that the price sits on an unstable boundary and show both.

### 11.6 Confidence gate

Every output receives:

- data quality;
- source quality;
- manifold support;
- solver stability;
- result sensitivity;
- combined confidence state.

Confidence states:

- `supported`
- `conditional`
- `insufficient`

An `insufficient` run displays data gaps and a route into AURORA. It never fabricates a Breakpoint sentence.

## 12. Public Data Contract

```ts
type BreakpointRun = {
  id: string;
  version: "bls_breakpoint_v1";
  status: "complete" | "conditional" | "insufficient" | "failed";
  ticker: string;
  companyName: string;
  analyzedAt: string;
  marketPrice: number | null;
  priceAsOf: string | null;
  currency: string;
  horizonYears: 5;
  hurdleRate: 0.08 | 0.10 | 0.12;
  pipelineRunId: string;
  engineVersions: Record<string, string>;
  marketFamily: MarketFamilySummary;
  beliefs: BreakpointBelief[];
  breakpoint: BreakpointResult | null;
  evidence: BreakpointEvidence[];
  confidence: BreakpointConfidence;
  dataGaps: string[];
  receipt: BreakpointRunReceipt;
};
```

`BreakpointBelief` includes:

- stable id;
- plain-language label;
- driver key;
- market-family range;
- historical range;
- peer range when valid;
- value sensitivity share;
- support/contradiction counts;
- reported/estimated/assumed/generated classification.

`BreakpointResult` includes:

- direction;
- selected hurdle;
- one or two driver deltas;
- normalized distance;
- feasibility class;
- expected return before and after;
- value range before and after;
- executive sentence;
- observable tripwires.

## 13. Persistence and Shareability

Public runs must be immutable once accepted.

Add a public run store with:

- run id;
- ticker;
- analyzed price and timestamp;
- normalized input hash;
- engine versions;
- complete JSON result;
- accepted/failed status;
- creation timestamp;
- expiration/freshness timestamp.

The run id is derived from a cryptographic hash plus a collision-safe suffix. The complete input hash is stored for auditability.

Base runs are persisted before their public URL is returned. A response may not advertise a share URL until persistence succeeds.

Fork state contains only:

- parent run id;
- selected hurdle;
- changed belief values;
- locale;
- issuance timestamp.

Fork tokens are signed server-side. The server rejects modified or out-of-range tokens.

No anonymous visitor identity, email, or portfolio data is stored in a fork token.

## 14. API Boundaries

### `POST /api/public/breakpoints`

Input:

```json
{
  "ticker": "TXN",
  "hurdleRate": 0.10,
  "locale": "es"
}
```

Behavior:

1. validate and normalize ticker;
2. return a fresh accepted cached run when available;
3. otherwise obtain the latest AURORA snapshot;
4. run or reuse the AURORA belief pipeline;
5. compute Breakpoint;
6. apply confidence gate;
7. persist immutable result;
8. return run URL and executive result.

### `GET /api/public/breakpoints/[runId]`

Returns the immutable public contract after filtering internal-only diagnostics.

### `POST /api/public/breakpoints/[runId]/fork`

Validates changed belief values and returns a signed fork URL. It does not persist personal identity.

### Isolation rule

Public Breakpoint APIs may consume AURORA contracts but may not import React page code or private workspace services. Breakpoint has a dedicated domain layer under `lib/breakpoint/`.

Proposed domain files:

```text
lib/breakpoint/
├── contract.js
├── market-family.js
├── solver.js
├── presenter.js
├── confidence.js
├── fork-state.js
└── persistence.js
```

## 15. Cache and Job Behavior

Public runs can be expensive. The API uses:

- normalized idempotency key: ticker + price vintage + pipeline input hash + hurdle + engine version;
- accepted-run cache;
- maximum public freshness window of one trading day for price-sensitive runs;
- background regeneration after expiry;
- retry/backoff through the existing durable job direction when a run exceeds the synchronous budget.

V1 synchronous budget:

- cached result: under 1 second server response;
- new supported ticker run: target under 30 seconds;
- hard synchronous limit: 60 seconds;
- after 60 seconds: return `202 queued` with run status URL.

Browser polling uses bounded exponential backoff and stops after a visible terminal state.

## 16. Initial Coverage

V1 is deliberately curated.

Candidate launch universe:

- TXN
- NVDA
- MSFT
- META
- AMZN
- ASML
- JPM
- CNI
- MCO
- COST

A ticker is publicly enabled only when it passes all of these gates:

- current price and timestamp available;
- shares and enterprise-value bridge available;
- required operating drivers available;
- market-family minimum cell count satisfied;
- no restricted valuation source;
- combined Breakpoint confidence is supported or conditional;
- executive result passes a human review fixture before launch.

If fewer than ten pass, V1 launches with the passing subset. The UI states supported coverage honestly and accepts requests for additional tickers.

Unsupported tickers receive:

> BLS cannot establish a defensible Breakpoint for this company yet.

They do not silently fall back to a demo company.

## 17. Visual Design

Breakpoint inherits the existing BLS Prime system:

- dark institutional canvas;
- warm ivory text;
- restrained gold for attention/decision;
- turquoise for supported evidence and resilience;
- existing display and interface typography;
- existing spacing and border language;
- dense but legible terminal panels.

It does not introduce a new logo, mascot, gradient-heavy SaaS style, neon trading aesthetic, or separate visual brand.

### Homepage hierarchy

Above the fold:

- wordmark and controls;
- Breakpoint label;
- headline;
- ticker input;
- no-account/trust note;
- compact result preview or current curated example.

Below the fold:

- how Breakpoint works;
- evidence and run-receipt trust layer;
- “Inside the BLS Prime Terminal” module cards;
- current workflow and disclaimer.

### Result layout

Desktop uses a 12-column grid:

- left 7 columns: executive result and belief surface;
- right 5 columns: decisive beliefs, evidence, and run receipt.

Mobile stacks:

1. executive result;
2. decisive belief cards;
3. chart;
4. controls;
5. evidence;
6. terminal routes.

The executive sentence must be visible without horizontal scrolling at 320 CSS pixels.

## 18. Components

Public components:

- `BreakpointHero`
- `TickerEntry`
- `BreakpointProgress`
- `BreakpointExecutiveResult`
- `RequiredBeliefCard`
- `BreakpointSurface`
- `HurdleSelector`
- `BeliefControl`
- `EvidenceForAgainst`
- `BreakpointRunReceipt`
- `ForkDiff`
- `BreakpointShareActions`
- `TerminalSecondarySection`
- `UnsupportedTickerState`
- `BreakpointErrorState`

Component rules:

- no component reads raw engine payloads directly;
- all copy comes from the presenter contract;
- all interactive controls are keyboard accessible;
- charts have a text/table equivalent;
- mobile behavior is specified in component tests;
- localized copy uses keyed dictionaries, not MutationObserver translation.

## 19. Error and Empty States

### Invalid ticker

> Enter a listed ticker using letters, numbers, `.` or `-`.

### Unsupported ticker

> BLS cannot establish a defensible Breakpoint for this company yet.

Actions:

- request coverage;
- try a supported example;
- open AURORA if a snapshot can still be reviewed.

### Missing or stale price

> Current price is unavailable or stale. BLS will not compute a price-sensitive boundary from this snapshot.

### Insufficient market family

> Too few economically coherent states clear the current price to show a precise boundary.

Show the missing inputs and avoid a chart that implies false precision.

### Solver instability

> Several nearby assumptions change the result. The case sits on an unstable boundary.

Show a range or both sides, not one deterministic point.

### Queued

> The run is still checking the decision boundary. This page will update when the result is ready.

### Failed

> Breakpoint could not complete this run. No result was saved as accepted.

Provide retry and trace-safe support code. Never show a raw stack trace or provider response.

## 20. Trust Model

Every result displays:

- analyzed price and timestamp;
- fiscal period and filing date;
- source classes used;
- reported versus estimated versus assumed inputs;
- selected hurdle and horizon;
- engine/model versions;
- run id;
- market-family support;
- confidence state;
- known limitations;
- direct methodology disclosure.

The short disclaimer is:

> Research software. Breakpoint depends on data, assumptions, and a selected return hurdle. It does not predict the future or provide an instruction to trade.

The disclaimer appears in the result footer, run receipt, exports, and social cards without interrupting the executive answer.

## 21. Security and Abuse Controls

Public analysis creates an anonymous compute surface. V1 includes:

- ticker allowlist for curated coverage;
- request body size limits;
- per-IP and global rate limits;
- idempotency keys;
- no arbitrary URLs or document uploads;
- no prompt surface;
- signed fork state;
- origin checks for mutating endpoints;
- structured logs without visitor financial data;
- safe external-source links;
- escaped user-visible ticker values;
- resource and timeout caps.

The first result remains anonymous despite these controls.

## 22. SEO and Distribution

### Base result pages

- canonical: `/breakpoint/[ticker]`
- title: `[TICKER] Breakpoint: What Today's Price Requires | BLS Prime`
- description includes ticker, price timestamp, and decisive question without claiming a recommendation;
- included in sitemap only after accepted run and human fixture review;
- structured metadata identifies the page as analysis software output, not a rating.

### Immutable run pages

- shareable;
- canonical back to base ticker page;
- default `noindex,follow` to avoid stale or duplicate indexed pages.

### Social image

The generated image contains:

- ticker;
- analyzed price/date;
- decisive belief;
- nearest Breakpoint sentence;
- BLS Prime wordmark;
- short research disclaimer.

No social image is generated for insufficient or failed runs.

## 23. Analytics and Zero-User Success Criteria

Analytics must measure proof of value, not vanity traffic.

Events:

- `breakpoint_ticker_submitted`
- `breakpoint_result_completed`
- `breakpoint_result_insufficient`
- `breakpoint_belief_changed`
- `breakpoint_hurdle_changed`
- `breakpoint_source_opened`
- `breakpoint_fork_created`
- `breakpoint_share_started`
- `breakpoint_terminal_opened`
- `breakpoint_watch_started`
- `breakpoint_coverage_requested`

An activated visitor must:

1. reach a complete or conditional result;
2. change a belief or hurdle;
3. inspect at least one source or create a fork.

Founder-led validation cohort:

- 20 directly invited target users;
- 10 activated visitors;
- at least 3 forks or shares;
- at least 2 requests for another ticker or a private case;
- median time from ticker submission to executive result under 60 seconds for uncached supported runs;
- zero accepted results lacking price date, sources, hurdle, or confidence state.

If fewer than 5 of 20 invitees activate, do not expand coverage. Review the result clarity, model credibility, and selected audience first.

## 24. Accessibility and Internationalization

V1 ships in Spanish and English.

- Middleware-selected locale controls server-rendered copy and `<html lang>`.
- Public Breakpoint components use keyed message dictionaries.
- Numeric formatting uses locale-aware separators while preserving source units.
- Ticker symbols, formulas, and source titles are not translated.
- All controls have visible focus states.
- The belief surface has a semantic table alternative.
- The color system passes WCAG AA for text and meaningful boundaries use shape/labels.
- Loading status uses `aria-live="polite"`.
- Errors use `role="alert"` only when immediate attention is required.
- Reduced-motion preferences disable animated surface transitions.

## 25. Testing Strategy

### Solver unit tests

- finds the known one-driver boundary on a synthetic surface;
- finds the known two-driver boundary when no one-driver solution exists;
- prefers the lower normalized-distance solution;
- rejects incoherent cells;
- rejects lookahead-contaminated inputs;
- reports no sparse Breakpoint when three or more drivers are required;
- remains stable under surface ordering changes;
- handles both sides of the hurdle;
- widens or abstains when nearby solutions are unstable.

### Contract tests

- every accepted run has price/date/hurdle/horizon/version/source/confidence;
- no internal engine-only vocabulary reaches presenter output;
- reported, estimated, assumed, and generated inputs remain distinct;
- insufficient runs cannot contain a precise Breakpoint;
- share state cannot override validated ranges;
- fork signature tampering fails.

### API tests

- valid curated ticker;
- invalid ticker;
- unsupported ticker;
- cached idempotent run;
- queued run;
- provider failure;
- persistence failure before share URL;
- rate limit;
- stale price;
- locale propagation.

### UI tests

- homepage hierarchy places Breakpoint before terminal modules;
- existing module links remain present;
- ticker submission works without login;
- executive result precedes chart detail;
- controls recompute displayed fork state;
- evidence is reachable without login;
- account request appears only after result;
- chart has text equivalent;
- mobile has no horizontal overflow;
- keyboard completes input, control, source, fork, and share flow.

### Browser QA

Required viewports:

- 1440 × 900
- 1024 × 768
- 390 × 844
- 320 × 720

Required flows:

1. Spanish anonymous ticker → result → belief change → source → fork.
2. English anonymous ticker → result → hurdle change → terminal.
3. Unsupported ticker → request coverage.
4. Queued run → completion.
5. Existing AURORA, FactorLab, Stress, signin, and workspace routes.

## 26. Rollout

### Increment 1 — Contract and solver

- Breakpoint domain contract;
- market-family construction;
- sparse solver;
- presenter;
- confidence gate;
- synthetic and existing-pipeline tests.

No public UI changes in this increment.

### Increment 2 — Public API and immutable runs

- persistence migration;
- public API;
- caching/idempotency;
- curated allowlist;
- run receipt;
- abuse controls.

No homepage promotion until accepted fixtures exist.

### Increment 3 — Result page

- `/breakpoint/[ticker]`;
- executive result;
- belief surface;
- evidence;
- controls;
- fork state;
- share card;
- error states.

### Increment 4 — Homepage hierarchy

- Breakpoint hero becomes primary;
- terminal mock and module cards move below Breakpoint explanation;
- current brand, navigation, authentication, module routes, footer, and legal language remain;
- metadata and sitemap include accepted Breakpoint pages.

### Increment 5 — Founder-led launch

- publish accepted cases;
- invite 20 target users;
- measure activation and forks;
- fix comprehension defects;
- decide whether to expand coverage.

## 27. Explicit Non-Goals

Breakpoint V1 does not include:

- a BLS Prime rebrand;
- removal or redesign of the private terminal;
- replacement of AURORA, FactorLab, or Stress Engine;
- a generic AI chat;
- document upload;
- automated trade execution;
- personalized buy/sell advice;
- brokerage integration;
- portfolio import;
- a full Priced Belief Graph UI;
- universal ticker coverage;
- collaborative teams;
- user reputation;
- historical decision scoring;
- push/email monitoring beyond the existing account conversion path;
- new billing plans.

## 28. Acceptance Criteria

The design is implemented successfully when:

1. An anonymous visitor can enter a supported ticker from `/` and receive an accepted Breakpoint result without authentication.
2. The executive result states what the price needs, where the case breaks, and what to watch next.
3. The visitor can change a decisive belief or hurdle and see a valid fork diff.
4. Every accepted output includes price/date, source classifications, hurdle, horizon, engine versions, confidence, and disclaimer.
5. Unsupported or insufficient cases abstain explicitly.
6. A forkable immutable URL works in a new browser session without user identity.
7. Breakpoint is visually primary on the homepage.
8. BLS Prime remains the product name and current brand system remains recognizable.
9. AURORA, FactorLab, Stress Engine, login, and private workspace routes remain functional and are visible in a secondary terminal section.
10. Existing tests pass, new solver/API/UI contracts pass, production build succeeds, and required browser flows show no console errors or horizontal overflow.

## 29. Final Product Statement

Breakpoint is the primary public proof of BLS Prime's research system:

> **BLS Prime reveals the exact belief separating today's price from your required return—and lets you challenge the boundary.**

The terminal remains the place where a user goes deeper. Breakpoint earns the right to invite them there.

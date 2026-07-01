# BLS Prime / AURORA master status

Date: 2026-06-30
Repo: `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin`
Latest pushed commit at time of review: `131d6c6 Expose AURORA as primary valuation entry`

## Executive summary

BLS Prime is now two things in one deployed web app:

1. A public product surface for investment decision support.
2. A research and valuation operating system centered on AURORA.

The most important product decision is now explicit: AURORA is the primary valuation entry. The app exposes `/aurora`, the home page names AURORA directly, and the older internal route `/valuation-os-lab` remains the implementation surface behind that entry.

The most important research decision is also explicit: AURORA should not claim standalone alpha from public financial-statement data alone. The strongest current thesis is that there may be value in market attention and processing gaps: public information is not secret, but economically important public evidence can still be underprocessed, misread, or slowly incorporated.

Current state:

- Public app compiles and builds.
- AURORA has a substantial deterministic engine stack with tests.
- Valuation OS UI is visible, Spanish-first, and points users to AURORA.
- FactorLab is functional as a point-in-time candidate screener.
- Macro Brain exists as a separate context page.
- The private workspace and old portfolio/capital OS still exist, but AURORA is now the main public product direction.
- Empirical research scripts, notebooks, and artifacts exist locally; only code, tests, and docs are committed.
- Generated artifacts and caches remain intentionally outside git unless explicitly selected.

## Product north star

AURORA is not meant to be a generic stock predictor, a prettier DCF, or an AI report generator.

The current north star is:

> AURORA reverse-engineers the future embedded in market prices, tests that future against business physics and evidence, and turns the result into falsifiable investment judgment.

In product language:

> Show me what the market believes, what must be true, what evidence supports or contradicts it, what would make me wrong, and whether this is researchable, rankable, or an abstention.

This has replaced the earlier framing of "router predicts the best valuation method." The router remains useful, but it is not the product.

## User-facing routes

### `/`

Public home page.

Files:

- `app/page.js`
- `components/public-home-experience.jsx`
- `app/home-page.module.css`

Current role:

- Introduces BLS Prime and AURORA.
- Defaults to a decision-support framing.
- Primary CTA points to `/aurora`.
- Keeps FactorLab visible as a secondary research tool.
- Spanish copy has been cleaned to avoid Spanglish and generic AI-like phrasing.

### `/aurora`

Primary AURORA entry route.

File:

- `app/aurora/page.js`

Current role:

- Redirects to `/valuation-os-lab`.
- Exists so users can see and type AURORA directly.
- Also used by home, FactorLab, Macro Brain, terms, recover, and error flows.

### `/valuation-os-lab`

AURORA Valuation OS implementation route.

Files:

- `app/valuation-os-lab/page.jsx`
- `app/valuation-os-lab/valuation-os-lab.module.css`
- `app/valuation-os-lab/assumption-policy.js`
- `app/valuation-os-lab/api/snapshot/route.js`
- `app/valuation-os-lab/api/debate/route.js`

Current role:

- Main interactive valuation UI.
- Lets user load a ticker.
- Shows drivers, assumptions, valuation range, market-implied expectations, router weights, uncertainty, calibration, and thesis warnings.
- Keeps finance acronyms in English where useful: DCF, ROIC, WACC, FCF, NOPAT, SBC.
- Visible title now says `AURORA Valuation OS`.

Important distinction:

- `/aurora` is the product door.
- `/valuation-os-lab` is the internal implementation route and still houses API calls.

### `/factorlab`

Standalone FactorLab workstation.

Files:

- `app/factorlab/page.js`
- `components/factorlab-workstation.jsx`
- `app/factorlab/factorlab.module.css`
- `lib/factorlab-engine.js`

Current role:

- Point-in-time candidate ranking lab.
- Explicitly not a valuation model.
- Ranks candidates using market factors plus qualitative thesis strength, demand/supply and bottleneck power.
- Refuses future-return leakage by design.
- Links back to AURORA.

### `/macro-brain`

Macro context page.

Files:

- `app/macro-brain/page.js`
- `app/macro-brain/macro-brain.module.css`
- `lib/macro-brain-snapshot.js`

Current role:

- Morning/context page.
- Shows what moved, what matters next, and what gets saved.
- Links to AURORA.

### `/app`

Private workspace / older capital OS.

Files:

- `app/app/page.js`
- `components/terminal-app.jsx`
- `lib/server/dashboard-service.js`
- many `/api/v1/workspaces/...` routes

Current role:

- Private workspace shell for portfolio, money plan, state, chat, holdings, phantom diversification, and workspace modules.
- Still important, but product focus has shifted toward AURORA as the visible valuation/research surface.
- Some copy now points to AURORA where relevant.

### Auth and recovery routes

Files:

- `app/login/page.js`
- `app/access/page.js`
- `app/forgot-password/page.js`
- `app/reset-password/page.js`
- `app/recover/route.js`
- `app/error.js`
- `components/language-layer.jsx`

Current role:

- Auth routes currently redirect toward `/aurora`.
- Recovery clears stale browser cache and returns users to AURORA.
- Language layer still supports Spanish translations across the older workspace.

## AURORA engine stack

AURORA is now implemented as a set of deterministic, auditable modules under `lib/`. These are not just UI helpers; they form a valuation cognition pipeline.

### Core valuation and belief object

Files:

- `lib/aurora-belief-compiler.js`
- `lib/aurora-belief-object.js`
- `lib/aurora-belief-pipeline.js`
- `lib/aurora-priced-belief-backtest.js`
- `lib/aurora-omega-spine.js`

Role:

- Compile raw company/snapshot data into drivers.
- Create the Priced Belief Object.
- Compare market-implied beliefs against feasible business beliefs.
- Build a market belief family, value-driver gradient, and minimal decision-flip scenarios.
- Backtest whether AURORA memos and priced-belief claims were directionally truthful after outcomes arrive.

Current status:

- Implemented and tested.
- Product-useful for explanation and memo structure.
- Not yet a proven standalone return-alpha engine.

### Data trust and source governance

Files:

- `lib/aurora-data-trust.js`
- `lib/aurora-source-governance-engine.js`

Role:

- Reject impossible macro inputs.
- Track source classes and point-in-time concerns.
- Restrict alternative data unless definition, history, availability, methodology, and validation are present.

Current status:

- Implemented and tested.
- Essential for preventing false precision.

### Accounting, assumptions, and business physics

Files:

- `lib/aurora-accounting-engine.js`
- `lib/aurora-assumption-ledger-engine.js`
- `lib/aurora-driver-graph.js`
- `lib/aurora-feasibility-manifold.js`

Role:

- Normalize reported accounting into economic drivers.
- Track assumptions and falsifiers.
- Enforce causal/business-physics constraints.
- Build feasible assumption surfaces rather than single-point claims.

Current status:

- Implemented and tested.
- Important because AURORA should not allow economically impossible futures.

### Forecast, valuation, and uncertainty

Files:

- `lib/aurora-bayesian-forecast-engine.js`
- `lib/aurora-expectations-engine.js`
- `lib/aurora-probabilistic-valuation.js`
- `lib/aurora-valuation-ensemble.js`
- `lib/aurora-calibration-engine.js`
- `lib/valuation-router.js`

Role:

- Build posterior scenarios.
- Generate reverse DCF / market-implied expectations.
- Value distributions, not just point estimates.
- Combine valuation lenses.
- Calibrate predictions after outcomes arrive.
- Route between valuation lenses using deterministic prior plus shadow residual policy.

Current status:

- Implemented and tested.
- Calibration is now explicit: AURORA can be useful as memo/research while still blocked from decision authority if calibration is weak.

### Evidence, moat, management, capital allocation

Files:

- `lib/aurora-evidence-extractor.js`
- `lib/aurora-competitive-moat-engine.js`
- `lib/aurora-management-reliability-engine.js`
- `lib/aurora-capital-allocation-engine.js`
- `lib/aurora-thesis-monitor.js`

Role:

- Extract structured business evidence.
- Track moat pressure and competitor threats.
- Score management reliability.
- Evaluate repurchases, acquisitions, debt reduction, and capital discipline.
- Monitor thesis falsifiers over time.

Current status:

- Implemented and tested.
- Evidence extraction is still mostly structured/local; the larger text/RAG/evidence graph layer remains a future expansion.

### Product market and sector-specific twins

Files:

- `lib/aurora-equilibrium-engine.js`
- `lib/aurora-semiconductor-twin.js`

Role:

- Separate product-market economics from equity-market flows.
- Model archetypes like physical capacity pressure, SaaS retention/CAC, marketplace balance, banking capital/funding.
- Add semiconductor-specific bottleneck and glut signals.

Current status:

- Implemented and tested.
- Still early; currently useful as deterministic pressure adjustment, not as broad industry world model.

### Dashboard and decision layer

Files:

- `lib/aurora-dashboard-contract.js`
- `lib/aurora-decision-engine.js`

Role:

- Convert pipeline output into dashboard-ready panels.
- Separate memo usefulness, researchability, rankability, and action decision.
- Enforce sizing and decision-rights constraints.

Current status:

- Implemented and tested.
- Important boundary: AURORA can say "memo useful, not rankable" instead of forcing a buy/sell answer.

### Processing gap engine

File:

- `lib/aurora-processing-gap-engine.js`

Role:

- Implements the latest conceptual pivot: alpha is less likely in public information itself and more likely in market attention/processing gaps.
- Scores whether economically important evidence appears underprocessed by the market.
- Distinguishes low attention, misdirected attention, and well-digested evidence.

Current status:

- Implemented and tested.
- Strategically central after the financial-statement/base-rate channel failed as an orthogonal alpha source.

## AURORA empirical research track

The current empirical lesson is not "AURORA failed." It is more precise:

- Direct neural routing against method weights was not production-worthy.
- Financial-statement-only priced-belief signals were mostly factor-adjacent or already priced.
- Ex-post expectation violation had strong signal because it used future fundamentals; that is useful as a ceiling and diagnostic, not as deployable alpha.
- Live/base-rate violation collapsed, which suggests the market already prices simple base rates.
- Filing text change/stability had directionally interesting results but did not yet cross a clean production threshold.
- The best forward path is the attention-processing gap layer, not another residual model over the same financial data.

Key docs:

- `docs/AURORA_FACTOR_NULL_RESULTS_2026_06_30.md`
- `docs/AURORA_FACTOR_ORTHOGONAL_AUDIT_2026_06_30.md`
- `docs/AURORA_LIVE_VIOLATION_AUDIT_2026_06_30.md`
- `docs/AURORA_SEC_FILING_CHANGE_V0_2026_06_30.md`
- `docs/AURORA_SEC_FILING_CHANGE_FULL_UNIVERSE_2026_06_30.md`
- `docs/AURORA_SEC_PEER_RELATIVE_RISK_AUDIT_2026_06_30.md`
- `docs/AURORA_ANALYST_REVISION_TARGET_AUDIT_2026_06_30.md`
- `docs/AURORA_PROCESSING_GAP_IMPLEMENTATION_REPORT_2026_06_30.md`

Current empirical status:

- Production alpha claim: not established.
- Research prioritization claim: credible.
- Memo/falsifier usefulness claim: implemented and testable.
- Attention-processing gap thesis: current best research direction.

## FactorLab

Files:

- `lib/factorlab-engine.js`
- `components/factorlab-workstation.jsx`
- `tests-node/factorlab-engine.test.mjs`

What it does:

- Builds point-in-time screens.
- Combines market factors with thesis/demand/bottleneck fields.
- Has a deliberate future-return leakage control.
- Produces a runnable JSON spec.

What it is not:

- It is not a valuation engine.
- It should not claim intrinsic value.
- It is a candidate prioritizer before AURORA valuation.

Current status:

- Implemented and tested.
- UI is understandable and Spanish-ready.

## Valuation OS / AURORA API surface

### Snapshot API

File:

- `app/valuation-os-lab/api/snapshot/route.js`

What it does:

- Loads SEC ticker mapping and companyfacts.
- Uses SEC user agent from env when available.
- Can use FMP API key for market/quote enrichment.
- Can use Brave API key for catalyst/news evidence.
- Builds assumptions, context pack, catalyst pack, valuation router, and calibration packet.

Key env vars:

- `SEC_USER_AGENT`
- `SEC_EDGAR_USER_AGENT`
- `BLS_PRIME_SEC_USER_AGENT`
- `META_ALLOCATOR_SEC_USER_AGENT`
- `FMP_API_KEY`
- `FINANCIAL_MODELING_PREP_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `BRAVE_API_KEY`

Risk:

- If Vercel lacks env vars that Railway has, the app can appear partially functional but miss quote/research enrichment.

### Debate API

File:

- `app/valuation-os-lab/api/debate/route.js`

What it does:

- Builds deterministic specialist views from already-audited inputs.
- Uses cache and cooldown to avoid repeated LLM/rate-limit pain.
- The final orchestrator/editor is optional and rate-limit aware.
- If no LLM key is configured or a rate limit occurs, deterministic analysis remains usable.

Key env vars:

- `VALUATION_OS_LLM_ENABLED`
- `VALUATION_OS_LLM_API_KEY`
- `EQUITY_RESEARCH_LLM_API_KEY`
- `OPENAI_API_KEY`
- `VALUATION_OS_LLM_MODEL`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`

Risk:

- The debate should not become the product's truth source. It is an editor/orchestrator over deterministic outputs.

## Private workspace / legacy capital OS

The app still contains a larger private workspace from the original BLS Prime / Meta Allocator work.

Important files:

- `components/terminal-app.jsx`
- `lib/server/dashboard-service.js`
- `lib/server/normalizers.js`
- `lib/server/equity-research.js`
- `app/api/v1/workspaces/[workspaceId]/...`

Capabilities present:

- Portfolio dashboard.
- Holdings and overlays.
- Phantom diversification.
- Finance plan endpoints.
- Research job persistence.
- Workspace state, memory, modules, policy, transitions, saved views.

Current strategic status:

- Useful infrastructure, but not the primary product story right now.
- AURORA should be the clean front door.
- Workspace can remain a deeper authenticated layer later.

## Deployment state

The repo is configured for:

- Vercel frontend.
- Railway/Python backend legacy split.
- Neon/Postgres for user/workspace storage.

Relevant files:

- `vercel.json`
- `railway.toml`
- `Procfile`
- `nixpacks.toml`
- `middleware.js`
- `lib/server/config.js`
- `scripts/neon-apply.mjs`

Important deployment lesson:

- API keys must exist in the runtime that uses them.
- Railway keys do not automatically cover Vercel server routes.
- Vercel needs SEC/FMP/Brave/OpenAI-like keys if its Next routes call those providers directly.

Current pushed commits relevant to this state:

- `131d6c6 Expose AURORA as primary valuation entry`
- `a45bbaa Build AURORA belief engine and Spanish UI`
- `e62cde9 Show calibration adoption gate in Valuation OS Lab`
- `218ed2e Add calibration adoption gate`
- `7d496fe Simplify workspace and valuation UI copy`

## Verification state

Most recent checks run in this working session:

- `npm run test:web`: 187 tests passed.
- `npm run build`: passed.
- Build output listed `/aurora` as a static route and `/valuation-os-lab` as the underlying page.

Test coverage includes:

- AURORA accounting.
- Assumption ledger.
- Bayesian forecast.
- Belief compiler/object/pipeline.
- Calibration.
- Capital allocation.
- Competitive moat.
- Dashboard contract.
- Decision engine.
- Driver graph.
- Equilibrium.
- Evidence extractor.
- Expectations engine.
- Feasibility manifold.
- Lens audit.
- Management reliability.
- Omega spine.
- Priced-belief backtest.
- Probabilistic valuation.
- Processing gap.
- Router.
- Semiconductor twin.
- Source governance.
- Thesis monitor.
- Valuation ensemble.
- FactorLab.
- Valuation OS debate.
- Server config and dashboard helpers.

## What is production-ready vs research-only

### Production-ready enough for user-facing demo

- `/` public home.
- `/aurora` visible entry.
- `/valuation-os-lab` AURORA UI.
- Ticker loading flow, subject to env availability.
- Deterministic valuation router.
- Calibration display.
- FactorLab point-in-time screener.
- Macro Brain page.
- Error/recover flows that send users to AURORA.

### Research-ready but not alpha-production

- AURORA Omega V8 rankers.
- Factor-null and orthogonal audits.
- SEC filing-change audits.
- Analyst revision target audit.
- Processing gap empirical expansion.
- Priced-belief backtest as a research label factory.

### Infrastructure present but strategically secondary

- Full private workspace.
- Portfolio dashboard.
- Phantom diversification.
- Workspace chat/actions.
- Billing routes, which are disabled for early access.

## Current limitations

1. AURORA is visible now, but deploy propagation may lag until Vercel finishes building the latest commit.
2. `/aurora` redirects to `/valuation-os-lab`; this is fine technically but a future cleaner version could make `/aurora` the canonical page and keep `/valuation-os-lab` as legacy redirect.
3. Live ticker quality depends on env vars and provider coverage.
4. SEC access requires a real user agent.
5. The final LLM orchestrator is optional and must stay rate-limit aware.
6. AURORA does not yet have a fully built evidence graph/RAG layer.
7. The attention-processing gap thesis is implemented conceptually but still needs broader empirical validation.
8. Public financial statements alone did not produce clean orthogonal alpha.
9. Several local artifacts and notebooks exist outside git; they should stay out unless intentionally curated.
10. Some older product docs still describe the pre-AURORA BLS Prime product and should be updated or clearly marked as historical.

## Dirty local state to be aware of

At the time this master document was created, there were local files not committed on purpose:

- `.claude/settings.local.json`
- `artifacts/chile/latest/chile_market.json`
- generated `artifacts/aurora_*` folders
- `.agents/`
- notebooks
- local helper files such as `ai_fix_loop.py`
- `valuation_idea.txt`

These are not necessarily wrong. They are local/generated or not yet curated for the repo.

## Recommended next steps

### 1. Make `/aurora` canonical

Current state: `/aurora` redirects to `/valuation-os-lab`.

Recommended next move:

- Move the page implementation to `/aurora`.
- Redirect `/valuation-os-lab` to `/aurora` for backwards compatibility.
- Update internal API calls carefully so `/aurora` can still call existing APIs or mirror them under `/aurora/api`.

This would eliminate the last user-facing confusion.

### 2. Add a first-screen AURORA explanation block

The UI should say, compactly:

- What the market price implies.
- What must be true.
- What evidence supports or contradicts it.
- What would falsify the thesis.
- Whether the read is researchable, rankable, or abstain.

Avoid claiming "AI analyst." The product is stronger as a disciplined valuation engine.

### 3. Build the evidence graph v1

Next serious architecture layer:

- SEC filing changes.
- Transcript/management claims.
- Analyst revisions.
- News/catalyst evidence.
- Source lineage.
- Supports/contradicts/falsifies edges.

Goal:

- Feed AURORA orthogonal attention-processing evidence instead of more financial ratio variants.

### 4. Turn Processing Gap into a visible product panel

Current engine exists.

Needed UI:

- "What the market may be underprocessing"
- evidence importance
- market digestion
- attention gap
- misdirected attention
- next evidence event

This is the cleanest way to capture the latest research conclusion in the product.

### 5. Keep empirical gates strict

Do not promote any alpha claim unless it survives:

- factor-null residualization
- permutation null
- block bootstrap / overlap-aware uncertainty
- subperiod stability, especially post-2020
- sector-neutral tests
- point-in-time controls

### 6. Clean docs

Recommended docs maintenance:

- Keep this master document as the active state.
- Mark older product docs as historical if they conflict.
- Keep research docs but add a top-level index.
- Separate production docs from research logs.

## Short handoff for another agent

If another agent starts here, the right mental model is:

1. The app is a Next.js public/private finance app.
2. AURORA is now the main product door.
3. The visible product should be Spanish-first, professional, and non-hype.
4. AURORA's core is a deterministic valuation cognition pipeline, not an LLM.
5. LLM use is optional and only edits/summarizes deterministic outputs.
6. The current empirical alpha lesson is negative for financial-data-only orthogonal alpha.
7. The current positive research direction is attention-processing gap over public evidence.
8. FactorLab is a candidate screener, not valuation.
9. The private workspace still exists but should not obscure AURORA.
10. Do not commit generated artifacts or local secrets.

# BLS Breakpoint Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add BLS Breakpoint as BLS Prime's public acquisition surface: a no-account ticker flow that exposes the smallest operating assumptions needed to clear the current price, with explicit provenance, uncertainty and a bridge into the existing terminal.

**Architecture:** Keep AURORA as the underlying valuation engine. A pure Breakpoint composer projects AURORA's expectations surface, feasibility manifold and Omega counterfactual arena into a compact, versioned public result contract. A public API runs the adapter against the existing live valuation snapshot, persists immutable runs in Neon (with an explicit local-memory development fallback), and renders a public result route. The current BLS Prime landing keeps its visual system and terminal content; its first hero becomes Breakpoint while AURORA, FactorLab and Stress Engine remain the secondary institutional depth.

**Tech Stack:** Next.js 14 App Router, React 18, CSS modules, Node test runner, Neon Postgres, existing AURORA pure engines.

## Visual thesis and interaction contract

Breakpoint should read as a single institutional valuation surface being made inspectable: carbon ink, thin terminal rules, one brass decision boundary, and real numbers. It must not become a colourful SaaS dashboard or a card mosaic. The home page has one public input at the top; the result page has one primary conclusion, one compact metric strip, then the evidence and methodology in a strict reading order.

The only motion is a reduced-motion-safe response reveal and the existing restrained terminal motion. No generated imagery is used: the pricing/feasibility surface is the visual anchor and is more truthful than decorative finance imagery.

## Task 1: Establish the Breakpoint contract and pure composer

**Files:**
- Create: `lib/breakpoint/contract.js`
- Create: `lib/breakpoint/compose.js`
- Create: `tests-node/breakpoint-compose.test.mjs`

**Steps:**
1. Write failing tests using the established ASML AURORA fixture shape. Assert that a run has a stable schema/version, rejects invalid hurdle rates, picks the market-clearing anchor, keeps only feasible-or-explicitly-labelled cells, reports the closest bull/bear decision flips, and never fabricates a certainty score.
2. Run `node --conditions=react-server --test tests-node/breakpoint-compose.test.mjs`; confirm red.
3. Implement small pure utilities for ticker validation, finite-number guards, percent formatting inputs and allowed hurdles `[0.08, 0.10, 0.12]`.
4. Implement `composeBreakpointRun({ pipeline, snapshot, hurdleRate, locale, now })` from existing AURORA output. It must expose: market family / anchor, feasible manifold summary, primary monitored driver, minimum bull/bear decision flip, return hurdle, input provenance and explicit limitations.
5. Re-run the focused test until green, then run `npm run test:web`.

## Task 2: Build the live snapshot adapter and public run service

**Files:**
- Modify: `app/valuation-os-lab/api/snapshot/route.js`
- Create: `lib/breakpoint/snapshot-adapter.js`
- Create: `lib/server/breakpoint-service.js`
- Create: `tests-node/breakpoint-service.test.mjs`

**Steps:**
1. Write failing adapter/service tests with a deterministic snapshot fixture. Verify the adapter maps reported history, quote, source date and assumptions into the AURORA input rather than treating estimates as observed facts; verify insufficient driver coverage returns `needs_attention` with a useful missing-input list.
2. Run the focused test; confirm red.
3. Extract/export `buildValuationSnapshot(ticker)` from the existing snapshot route without changing its response contract. The route remains a thin Response wrapper.
4. Map snapshot data into `runAuroraBeliefPipeline`; retain source labels and filing dates. Compose the public run only when coverage gates pass, otherwise return an auditable `needs_attention` result instead of a fake valuation.
5. Re-run focused and full unit tests.

## Task 3: Persist immutable public runs and secure parameter forks

**Files:**
- Create: `db/migrations/0015_public_breakpoint_runs.sql`
- Create: `lib/server/data/public-breakpoint-runs.js`
- Modify: `.env.example`
- Create: `tests-node/public-breakpoint-runs.test.mjs`

**Steps:**
1. Write failing tests for ticker normalization, immutable append/read behavior, expired-memory semantics and signed fork verification.
2. Run focused test; confirm red.
3. Add a `bls_public_breakpoint_runs` table with UUID id, ticker, status, input/source/assumption/output JSONB, model version, timestamp and indexes for ticker/created time. No user PII is stored.
4. Implement Neon append/read with the same explicit memory fallback convention used elsewhere. In production, require Neon for durable share links; local memory IDs clearly say they are non-durable.
5. Add HMAC fork token helpers using `BLS_PRIME_BREAKPOINT_FORK_SECRET`; in production reject missing-secret fork requests instead of silently accepting unsigned changes.
6. Re-run focused and full tests.

## Task 4: Expose the no-account public API

**Files:**
- Create: `app/api/public/breakpoints/route.js`
- Create: `app/api/public/breakpoints/[runId]/route.js`
- Create: `app/api/public/breakpoints/[runId]/fork/route.js`
- Create: `tests-node/public-breakpoint-api.test.mjs`

**Steps:**
1. Write static/request-contract tests for POST validation, no-auth access, explicit 400 vs 422 vs 503 states, source payload presence and the no-cache headers.
2. Run focused test; confirm red.
3. Implement POST `{ ticker, hurdleRate, locale }`; normalize and rate-limit in-process conservatively; call the service; persist the immutable run; return run ID and canonical URL.
4. Implement GET by run ID and a fork endpoint that accepts only signed/in-range changes. Do not expose provider keys or raw credentials.
5. Run focused and full unit tests.

## Task 5: Build the public acquisition and result interfaces

**Files:**
- Create: `components/breakpoint/breakpoint-hero.jsx`
- Create: `components/breakpoint/breakpoint-result.jsx`
- Create: `components/breakpoint/breakpoint.module.css`
- Create: `app/breakpoint/[ticker]/page.js`
- Modify: `components/public-home-experience.jsx`
- Modify: `app/home-page.module.css`
- Modify: `app/sitemap.js`
- Modify: `lib/i18n/locale.js`
- Modify: `tests-node/public-trust-foundation.test.mjs`

**Steps:**
1. Add failing static contracts that require the no-account input, clear Spanish/English copy, live-vs-estimated disclosure, accessible submit/error behaviour, a result canonical route and a secondary link to the existing terminal.
2. Run focused test; confirm red.
3. Build a keyboard-accessible hero form. Its primary CTA is `See the breakpoint` / `Ver el punto de quiebre`; it requests the public API and sends the user to the immutable run route. The existing terminal hero and module deck remain below as the secondary product layer.
4. Build result states: loading, result, not-covered, insufficient-data and failed fetch. Show one conclusion first, then market belief, two minimal decision flips, feasibility/provenance, data date/source labels, limitations/disclaimer, and a non-primary `Open full terminal` CTA.
5. Use CSS module tokens matching the present carbon/brass/serif system. Add only reduced-motion-safe visual transitions and do not use generic rounded cards.
6. Add dynamic metadata/canonical URL and include the public breakpoint root in sitemap, while keeping private terminal routes noindex.
7. Re-run focused/full tests and test the responsive UI in a browser.

## Task 6: Verify, document environment requirements, and commit

**Files:**
- Modify as needed: `README.md`
- Modify: `docs/superpowers/specs/2026-07-10-bls-breakpoint-design.md` only if implementation deviates materially.

**Steps:**
1. Add concise setup notes for `DATABASE_URL` and `BLS_PRIME_BREAKPOINT_FORK_SECRET`, including that public share links require Neon in production.
2. Run `npm run test:web`, `npm run build`, and the targeted Playwright/browser flow. Inspect exact exit codes/output.
3. Review `git diff --check` and `git status --short` to ensure only intended files are changed.
4. Commit the implementation on `codex/bls-breakpoint-design` with a focused conventional message.

## Acceptance checklist

- The homepage opens with a usable no-account ticker form and preserves the existing BLS Prime terminal underneath.
- A supported ticker produces a durable, immutable result URL with data date, source, assumptions, explicit uncertainty and a visible disclaimer.
- A result states what the price requires, the primary driver, the smallest bull/bear operating shift, and what to monitor.
- Unsupported, stale or thin data produces a specific honest state rather than a fabricated conclusion.
- ES/EN visible copy matches `html[lang]`; form/errors are keyboard and screen-reader accessible; motion respects `prefers-reduced-motion`.
- Public result API is rate-limited/no-store, does not require login, contains no secrets, and only permits signed bounded forks.
- Existing AURORA, FactorLab, Stress Engine, login flow, legal pages and SEO rules retain their current routes and behavior.

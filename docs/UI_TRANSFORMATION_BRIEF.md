# BLS Prime — UI Transformation Brief

**Audience:** the agent executing this work.
**Goal:** transform the BLS Prime UI so a non-technical user (a private investor, a family-office principal, a PM's boss) can understand every screen on first contact, while a quant reviewer still finds nothing dumbed-down or dishonest. Sparse, serious, high-signal — an institutional command surface, not a startup landing page and not an AI demo.

**Definition of done:** a person with zero finance training can open any screen and answer three questions within 10 seconds: *What is this? What is it telling me about my money? What should I do next?* — without a single metric, gate, or warning being removed.

---

## 1. Non-negotiable ground rules

1. **Never trade honesty for polish.** The v8 verdict (calibrated factor stress engine is the champion; DDPM is research-only) stays visible. Warnings in API payloads stay surfaced. "Research software. Not financial advice." stays on every public surface. If a simplification would overclaim, keep the caveat and simplify the sentence around it.
2. **Plain language is a layer, not a replacement.** Every technical readout gets a plain-language headline; the technical detail moves one level down (tooltip, expandable row, methodology page). Nothing is deleted.
3. **ES/EN parity is mandatory.** Every string you add or change must exist in both languages in the same `COPY` structure the file already uses. No mixed-language screens: if the user picks EN on the landing page, the workspace must be 100% EN. Today `components/terminal-app.jsx` still contains hardcoded Spanish (nav labels around line 36–85, table fallbacks like `"Sin clasificar"`, `"Fila N"`). Migrate all of it into the copy dictionaries.
4. **No new dependencies** for this work. The stack is Next.js App Router + CSS modules + the existing design tokens in `app/globals.css`. No component libraries, no Tailwind, no chart libraries — charts stay hand-rolled SVG like `PortfolioChart` and `PhantomBreadthChart`.
5. **Don't rename routes or break the API.** `/`, `/stress`, `/aurora` (redirects to `/valuation-os-lab`), `/factorlab`, `/app`, and `/api/v1/workspaces/{id}/market-simulation` keep working. UI-only change.

---

## 2. Current state inventory (read these before touching anything)

| Surface | File(s) | State |
|---|---|---|
| Landing page | `components/public-home-experience.jsx`, `app/home-page.module.css` | Black hero, BL'S logo, 3 module buttons, ES/EN toggle. Good bones. |
| Stress Engine public page | `components/stress-engine-public-page.jsx`, `app/stress/` | v8 verdict copy, metrics, stress-floor table. Honest but written for insiders. |
| Workspace / terminal | `components/terminal-app.jsx` (~4,500 lines), `app/globals.css` | Anchor-based nav (`#today`, `#risk`, `#macro`, `#candidates`, `#decisions`, `#holdings`). Dense metric tiles. Partially bilingual. |
| Stress panel | `MarketDiffusionPanel` in `terminal-app.jsx` (~line 2182) | Regime/horizon/guidance controls, CVaR hero, 9 metric tiles, tail contributors, worst paths, universe. |
| Simulation engine | `lib/server/diffusion-market-simulator.js` | v8 same-stack baseline, contract + warnings in payload. Do not change logic; you may read any field for UI. |
| Valuation (AURORA) | `app/valuation-os-lab/`, `components/equity-research-panel.jsx`, `components/aurora-verdict-card.jsx` | Not audited in this brief; apply the same patterns. |
| Screening (FactorLab) | `app/factorlab/`, `components/factorlab-workstation.jsx` | Same. |
| Design tokens | `app/globals.css` `:root` | Full token set exists (`--accent #f8c86f`, `--good/--warn/--bad`, `--sans Sora`, `--mono JetBrains Mono`). Use it; extend it; never hardcode new colors. |

---

## 3. The core pattern: dual-register copy

Every number on screen follows one pattern, implemented once and reused everywhere:

```
[PLAIN HEADLINE]   what it means in one sentence a non-expert understands
[VALUE]            the number, big, mono font
[TECH LABEL]       the precise term, small, muted  →  ⓘ opens full definition
```

Example — the CVaR hero in the stress panel:

> **If the next 20 days go badly, this portfolio loses about 24% in the worst cases.**
> `-23.7%`
> CVaR 5% · 5,000 scenarios · Crisis regime ⓘ

The ⓘ opens a short definition: *"CVaR 5% = the average of the worst 5% of simulated outcomes. It answers: 'when things go wrong, how wrong?' It is not a prediction."*

### Build the plumbing first

1. **`components/ui/info-tip.jsx`** — small accessible tooltip/popover. Trigger: a subtle ⓘ. Keyboard focusable, `aria-describedby`, closes on Escape, works on touch (tap to open). No library.
2. **`components/ui/plain-metric.jsx`** — replaces/wraps the existing `MetricTile`: props `{ plain, value, techLabel, definitionKey, tone, trend }`. Renders the three-register layout. Keep `MetricTile` working during migration; convert panel by panel.
3. **`lib/copy/glossary.js`** — single bilingual dictionary of every technical term. This is the most important file you will create. Every ⓘ pulls from it, so definitions are written once and never drift. Seed it with at least:

| Key | EN plain definition (write ES too) |
|---|---|
| `cvar5` | "The average of the worst 5% of simulated outcomes. When things go wrong, how wrong?" |
| `var5` / `var1` | "The line that 95% (99%) of simulated outcomes stay above. A floor for 'normal bad', not the worst case." |
| `drawdown` | "The deepest drop from a peak before recovering. -10% drawdown = at some point you were down 10% from your high." |
| `scenario` | "One simulated version of the next N days. We run thousands to map the range of outcomes — none of them is a forecast." |
| `regime` | "A market mood the simulation assumes: calm, crisis, recovery, or inflation shock. Pick the weather you want to test against." |
| `stress test` | "Deliberately harsh simulations. The point is to see if the portfolio survives bad weather, not to predict it." |
| `tail` / `tail contributor` | "The worst slice of outcomes. Tail contributors = the positions that do the most damage in that slice." |
| `probability of loss` | "The share of simulated scenarios that end below zero." |
| `factor` | "A common force that moves many stocks at once (the market overall, a sector, a style). The engine simulates forces, then translates them into your positions." |
| `calibrated stress engine` | "A statistical engine tuned to historical market behavior. Chosen over the experimental AI model because it scored better on every accuracy test (v8)." |
| `run id / seed` | "Fingerprint of this exact simulation. Same fingerprint = identical results, so any run can be audited or reproduced." |

Rules for definitions: ≤ 2 sentences, no formula, no acronym inside a definition, always say what it is *for*, and say "simulated"/"not a prediction" wherever a naive reader could mistake output for forecast.

---

## 4. Surface-by-surface instructions

### 4.1 Landing page (`public-home-experience.jsx`)

Keep the sparseness. Change only:

1. **Add one category line** under the `kicker`, above the headline: EN "Institutional research terminal for equity decisions." / ES "Terminal de research institucional para decisiones de renta variable." Small, muted, one line. This is the single biggest fix — the page currently never says what BLS Prime *is*.
2. **Rewrite the three module descriptions for outcomes, not internals.** Current copy leaks jargon ("point-in-time", "falsifiers", "stress book", "v8"). Replace with:
   - AURORA · *Valuation* — EN: "Is this stock worth its price? A full, auditable read on any company." / ES: "¿Vale la acción lo que cuesta? Una lectura completa y auditable de cualquier empresa."
   - FactorLab · *Screening* — EN: "Which stocks deserve a look? Ranked candidates with the rules shown, not hidden." / ES: "¿Qué acciones merecen atención? Candidatas rankeadas con las reglas a la vista."
   - Stress Engine · *Portfolio Risk* — EN: "How bad can it get? Thousands of simulated crises run against your actual portfolio." / ES: "¿Qué tan mal puede salir? Miles de crisis simuladas contra tu cartera real."
3. **Rename the third module across the UI to "Stress Engine"** (the public page already uses this name — the landing card still says "Market Simulation" with label "Factor-DDPM"). Remove "Factor-DDPM" from the landing entirely; architecture names never appear at the front door.
4. **Point the card at `/stress`**, not `/app#risk`. The public page is the correct front door; it already has the "Run in workspace" CTA for authenticated flow.
5. Keep: black background, numbered cards, ES/EN toggle, login link, footer disclaimer. Do not add sections, screenshots, testimonials, or animation beyond the existing entrance fades.

### 4.2 Stress Engine public page (`stress-engine-public-page.jsx`)

This page currently talks to the repo's own maintainers ("Do not brand the live surface as DDPM…"). Re-aim it at a prospective user:

1. **Restructure to answer, in order:** What is it? (one plain sentence) → What do I get? (the four metric cards, each with plain headline) → How do I trust it? (methodology + v8 verdict, rewritten) → What can't it do? (limits, rewritten) → CTA.
2. **Rewrite the v8 verdict for outsiders.** From internal changelog tone to trust story: EN example — "We tested an experimental AI simulator against classical statistical engines on out-of-sample market data. The classical engine won, so that is what we ship. The AI model stays in the lab until it earns its place. Every test and threshold is published." This is a *selling point* — honest model selection — so present it as one, in ≤ 4 sentences, with a link to methodology for the numbers (MMD tables move there; raw scores like "0.0168" leave the top page).
3. **Reframe the stress-floor table** with a plain intro: "We check that our simulated crises are at least as severe as real historical ones:" then the three episodes with plain labels ("COVID crash 2020 — real drop -35% — our stress floor -45% ✓"). Keep the existing caveat that this is a floor check, not a replay, but say it in one plain sentence.
4. **Rewrite "Current Limits" for users, not maintainers.** Each limit becomes: what it means for you. E.g. survivorship → "Simulations are built from today's S&P 500 members, which understates how bad history really was. Treat results as a lower bound on tail risk."

### 4.3 Workspace shell (`terminal-app.jsx` — navigation and layout)

1. **Nav labels become plain questions** (they're already close in ES — keep that spirit, complete the EN side): Today · My biggest risk · Macro · Candidates · Decisions · Holdings. All from the copy dictionary, zero hardcoded strings.
2. **Add a persistent workspace header strip:** workspace name, plain one-line status ("Portfolio synced · 12 positions · data as of {date}"), language toggle, and the run-fingerprint of the last simulation where relevant. Users must always know *whose money* and *how fresh*.
3. **Every panel gets a one-line plain purpose** under its `<h2>` (many already have `supportText` — audit all of them against the glossary rules: no unexplained acronym, no internal jargon like "contract", "gate", "champion" without ⓘ).
4. **Empty / loading / error states.** Audit every `emptyCopy` and error banner: each must say (a) what's missing, (b) why, (c) the one action to fix it. "Sin posiciones conectadas" becomes "No positions yet — add holdings in the Holdings tab and the risk engine will pick them up automatically."
5. **`friendlyWorkspaceMessage` and `isTechnicalWorkspaceMessage`** already exist to hide raw errors — extend the same courtesy everywhere: no raw HTTP codes, stack fragments, or JSON keys ever reach the screen.

### 4.4 Stress panel — `MarketDiffusionPanel` (the flagship redesign)

Rename the component `StressEnginePanel`. Restructure top-to-bottom:

**Layer 1 — the answer (always visible).**
One sentence + one number: "**In a simulated {regime}, this portfolio loses {cvar5} in the worst 5% of the next {horizon} days.**" Under it, three plain-metric chips: chance of any loss, chance of a -10% drawdown, worst simulated path. That's it. A non-technical user can stop here fully informed.

**Layer 2 — controls, in human terms.**
- "Regimen/Regime" select → label **"Test against"**, options: "Calm market (baseline)", "Crisis", "Recovery", "Inflation shock" — each option with one-line description in the dropdown or a caption below.
- "Horizonte/Horizon" → **"Over the next"** 10 / 20 / 60 days.
- **Remove the raw "Guidance" number input from the default view.** It's an engine parameter no non-technical user should meet. Replace with a three-position severity control — "Standard / Harsh / Extreme" mapping to guidanceScale 1.0 / 1.6 / 2.5 — and keep the numeric input inside the Layer-4 drawer for power users.
- Big primary button: "Run stress test" / "Correr stress test". While running: "Simulating 5,000 scenarios…" with an indeterminate progress bar (runs take a moment; silence feels broken).

**Layer 3 — where the damage comes from (visible, plain).**
- Tail contributors renamed **"What hurts most in the bad scenarios"**, each row: ticker, plain sentence ("NVDA drives -1.2% of the tail loss"), small bar for magnitude.
- Worst paths renamed **"The five ugliest simulations"**, and *draw them*: a small SVG line chart of the worst cumulative paths (reuse the `PortfolioChart` SVG approach) instead of the current text list. This is the single highest-impact visual addition in the whole app.
- Distribution strip: one compact histogram of terminal returns with VaR/CVaR markers, plain caption "Each bar = how many of the 5,000 simulations ended there."

**Layer 4 — the engine room (collapsed by default: `<details>` / disclosure card "Model diagnostics").**
Everything currently cluttering the tile grid moves here, unchanged in substance: coverage, correlation fidelity, MMD ratio vs champion, runtime engine, endpoint gate status, stress multiplier mix, run id + seed, checkpoint paths, and the full warnings list from the payload. Label it honestly: "For quants and auditors." Each metric keeps its ⓘ.

**Trust ribbon (always visible, one line, bottom of panel):**
"Simulated scenarios, not predictions · Engine: calibrated factor stress baseline (v8) · Run `{run_id}` · seed `{seed}`" — with ⓘ on "not predictions" and on the engine name (glossary key `calibrated stress engine`).

### 4.5 AURORA and FactorLab

Apply the identical system — dual-register metrics, glossary ⓘ, plain panel purposes, layered disclosure, bilingual completeness — to `equity-research-panel.jsx`, `aurora-verdict-card.jsx`, and `factorlab-workstation.jsx`. Priorities: (1) every verdict/score gets a plain sentence ("Priced about right", "Expensive for what it earns"); (2) FactorLab ranking columns each get ⓘ; (3) no unexplained internal names ("Omega", "belief compiler", "falsifiers") reach a screen without a glossary entry.

---

## 5. Visual and interaction standards

1. **Typography hierarchy:** plain headlines in `--sans`, all numbers in `--mono`. Numbers right-aligned in tables. One hero number per panel maximum — if everything is big, nothing is.
2. **Color discipline:** `--bad`/`--warn`/`--good` only for meaning (losses, gates, gains) — never decoration. Accent `--accent` for interactive elements and the single most important value per screen. Everything else `--text`/`--muted`/`--dim`.
3. **Number formatting (single util, `lib/copy/format.js`):** percentages to 1 decimal; money compact ($1.2M); signed values always show +/−; ES locale uses comma decimals when language is ES; never render `-23.7334%`-style raw precision in Layers 1–3 (full precision lives in Layer 4 and API).
4. **Motion:** entrance fades that already exist, plus number transitions on simulation results (fade, not count-up). Nothing loops, nothing bounces. Respect `prefers-reduced-motion`.
5. **Responsive:** every panel must be usable at 380px wide. Metric grids collapse to 2 columns, then 1. The stress controls stack vertically. Test the landing, `/stress`, and the stress panel at 380/768/1280.
6. **Accessibility:** all ⓘ keyboard-operable; charts get `aria-label` summaries ("Histogram of simulated returns, worst -38%, median -7%"); color is never the only signal (badges keep text); focus states visible on the dark theme (2px `--accent-soft` outline); contrast ≥ 4.5:1 for text — check `--dim #73839a` on `--bg` wherever it carries meaning, upgrade to `--muted` if it fails.

---

## 6. What NOT to do (anti-goals)

- Don't add marketing sections, social proof, gradients-of-the-week, or emoji. Sparse is the brand.
- Don't hide or soften warnings, gates, or the v8 verdict to look better. The honesty *is* the premium positioning.
- Don't say "AI-powered" anywhere. The champion engine is statistical; the AI model is research-only. Saying otherwise is now factually wrong and reputationally fatal.
- Don't use "prediction", "forecast", or "expected" for simulation outputs in plain copy. Use "simulated", "scenario", "stress test".
- Don't translate ticker symbols, run ids, or technical identifiers.
- Don't refactor `terminal-app.jsx`'s data flow or split it into files as part of this work — copy and presentational changes only. (A decomposition is worthwhile but is a separate task; mixing them makes both unreviewable.)

---

## 7. Execution order

1. `lib/copy/glossary.js` + `lib/copy/format.js` + `components/ui/info-tip.jsx` + `components/ui/plain-metric.jsx` (the plumbing).
2. Landing page changes (§4.1) — smallest surface, sets the tone, immediately shippable.
3. Stress Engine panel redesign (§4.4) — flagship.
4. Stress public page rewrite (§4.2).
5. Workspace shell: nav, header strip, empty/error audit, ES/EN completeness (§4.3).
6. AURORA + FactorLab pass (§4.5).
7. QA pass (§8).

Commit per step; each step must leave the app fully working and bilingual.

---

## 8. Acceptance checklist (run before calling it done)

- [ ] The 10-second test passes on: landing, `/stress`, stress panel, holdings, AURORA verdict (ask: what is this / what does it say about my money / what do I do next).
- [ ] Zero hardcoded user-facing strings outside copy dictionaries; switching ES↔EN flips every screen completely.
- [ ] Every acronym or technical term visible in Layers 1–3 has a working ⓘ backed by `glossary.js`.
- [ ] All payload `warnings` remain user-visible (Layer 4 at minimum; Layer 1 ribbon for the "not predictions" disclaimer).
- [ ] No raw API errors, paths, or JSON keys on screen.
- [ ] 380px / 768px / 1280px layouts verified on the three main surfaces.
- [ ] Keyboard-only walkthrough of the stress panel: run a simulation, open three tooltips, open the diagnostics drawer.
- [ ] `npm run build` clean; no console errors on the three main routes.
- [ ] A quant reading Layer 4 finds every number that existed before this change.

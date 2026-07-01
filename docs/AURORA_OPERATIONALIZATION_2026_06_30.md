# AURORA operationalization - engine to verdict

Date: 2026-06-30
Status: implementation guide and active product direction

## Core decision

The clarity problem is architectural, not editorial.

AURORA already has enough machinery. The issue is that the old screen order asked the user to reconstruct the conclusion from the machinery. The product should lead with the job:

1. Verdict.
2. What the price assumes.
3. What must be true.
4. Evidence for and against.
5. What to review now.
6. What would break the thesis.
7. Full analysis as an opt-in lab.

Internal engine vocabulary must not reach the DOM. User-facing components should render through a copy map instead of leaking field names such as priced-belief objects, feasibility manifolds, router weights, or channel-sufficiency language.

## Implemented in this pass

### Copy layer

File:

- `lib/aurora-copy-map.js`

Provides:

- verdict labels: `Pasar`, `Investigar`, `Rankear`, `Sin veredicto`
- top-level section labels
- full-analysis lab section labels
- blocklist of engine terms that should not appear in user-facing UI

### Verdict component

File:

- `components/aurora-verdict-card.jsx`

Role:

- Renders the verdict as a real answer.
- `PASS` is not an error.
- `ABSTAIN` is not a crash state.
- The card shows the reason and the next step in plain Spanish.

### Valuation OS render order

Files:

- `app/valuation-os-lab/page.jsx`
- `app/valuation-os-lab/valuation-os-lab.module.css`

Changes:

- Added a verdict-first section at the top of the workspace.
- Added the five-step ladder:
  - `Que esta asumiendo el precio`
  - `Que tendria que ser cierto`
  - `Evidencia`
  - `Que revisar ahora`
  - `Que romperia la tesis`
- Moved the original detailed lab panels behind `Ver el analisis completo`.
- Preserved all existing valuation machinery instead of deleting it.
- Added responsive layout so the ladder stacks cleanly on mobile.

### AURORA ticker handoff

Files:

- `app/aurora/page.js`
- `app/valuation-os-lab/page.jsx`

Changes:

- `/aurora?ticker=XXX` now preserves the ticker and redirects to `/valuation-os-lab?ticker=XXX`.
- The lab auto-loads that ticker on entry.

### FactorLab to AURORA

File:

- `components/factorlab-workstation.jsx`

Changes:

- Each accepted candidate row now includes `Analizar en AURORA`.
- The link sends the ticker to `/aurora?ticker=...`.

### Guardrail test

File:

- `tests-node/aurora-copy-map-ui.test.mjs`

Checks:

- The verdict ladder exists.
- User-facing AURORA surfaces do not contain blocked engine vocabulary.

## Product consequence

The user no longer lands in the machine room first. They land on a verdict and a concrete research agenda.

The old lab still exists, but it is now opt-in:

- valuation range
- method weighting
- uncertainty
- calibration
- detailed controls

This preserves power for technical users while making the first screen understandable to non-technical users.

## Verification

Latest checks after implementation:

- `npm run test:web`: 194 passing tests.
- `npm run build`: successful.

## Remaining follow-up

1. Promote `/aurora` from redirect to canonical route.
2. Persist `Historial de tesis` entries when a verdict is produced.
3. Add a visible Processing/Attention Gap panel once the evidence graph is connected.
4. Continue removing old mojibake from legacy Spanish copy.
5. Keep AURORA copy Spanish-first and plain; finance acronyms can stay in English.

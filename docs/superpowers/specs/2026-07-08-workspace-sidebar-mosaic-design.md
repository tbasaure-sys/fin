# Workspace Sidebar and MOSAIC Command Center Design

Date: 2026-07-08
Repo: `C:\Users\T14 Ultra 7\OneDrive\Escritorio\CT\blsprime-fin`

## Summary

Reorganize the private workspace around a left sidebar with three primary product areas:

1. Holdings
2. AURORA
3. MOSAIC

This replaces the current many-anchor mental model with a simpler product architecture. Holdings owns portfolio state and stress testing. AURORA owns company valuation and research. MOSAIC owns external context, including Macro Brain, global disequilibrium, liquidity, macro theses, defeaters, and source trust.

The goal is not to add a larger macro page inside the old navigation. The goal is to make the workspace feel like one coherent terminal with three durable tabs.

## Current Context

The current workspace uses anchor navigation with sections such as today, risk, macro, candidates, decisions, and holdings. The macro area currently combines Macro Brain and MOSAIC widgets, but those widgets are subordinate to the old section structure.

Relevant current files:

- `components/terminal-app.jsx`
- `components/workspace/shell.module.css`
- `lib/server/macro-brain.js`
- `lib/server/mosaic-observatory.js`
- `lib/macro-brain-snapshot.js`
- `lib/mosaic-observatory-snapshot.js`
- `app/api/macro-brain/route.js`
- `app/api/mosaic/route.js`

The existing macro data is already richer than the UI exposes. Macro Brain provides impulse changes, theses, invalidation logic, liquidity, PSM stability, and defeater calendar. MOSAIC provides global disequilibrium, conflict index, market pressure rows, source health, providers, and open data gaps.

## Product Structure

### Sidebar

The workspace sidebar has exactly three primary entries:

- Holdings
- AURORA
- MOSAIC

Each entry is a top-level workspace mode, not a small jump link. The sidebar should feel stable and app-like. The current anchor links can survive during migration as internal section ids, but they should no longer define the user's main mental model.

### Holdings

Holdings is the place for the user's actual portfolio.

It includes:

- portfolio overview
- holdings table
- performance
- allocation and exposure summaries
- stress test panel
- risk warnings tied to actual holdings

The stress engine belongs here because stress testing answers "what can happen to my portfolio?" rather than "what is the macro backdrop?"

### AURORA

AURORA is the place for single-company valuation and research.

It includes:

- ticker/company research entry
- valuation output
- candidate research when it naturally feeds valuation
- links to the public `/aurora` surface where appropriate

FactorLab/candidates should be subordinated to AURORA unless a later product decision promotes screening into its own top-level area. For this redesign, the sidebar stays at three primary entries.

### MOSAIC

MOSAIC is the place for external context.

It includes:

- MOSAIC global pressure and conflict index
- Macro Brain impulse changes
- liquidity components
- macro theses
- defeater calendar
- PSM/stability read
- source freshness, providers, and data gaps

Macro Brain should live inside MOSAIC instead of competing with MOSAIC as a separate top-level concept. The reader-facing product label is MOSAIC; Macro Brain is an engine/module within that tab.

## MOSAIC Tab Design

The MOSAIC tab is a command center, but it should not become a wall of metrics. It should be organized into clear bands:

1. World Read
2. Pressure Map
3. Macro Brain
4. Theses and Defeaters
5. Liquidity
6. Sources

### World Read

First screen answers:

- What is the outside world doing?
- Is pressure rising, falling, or mixed?
- Is the data fresh enough to trust?

Fields:

- Macro Brain `shortRead`
- MOSAIC global disequilibrium index
- MOSAIC conflict index
- PSM status and pressure
- generated/freshness label
- update button

### Pressure Map

Use MOSAIC market rows as the main external-pressure table.

Rows show:

- market name
- score
- plain reading
- short why
- data quality or source count where available

Positive pressure and weak-demand rows should be visually separate, but not hidden behind tabs.

### Macro Brain

Macro Brain shows:

- top impulse changes
- direction
- intensity
- label
- latest date if present in the raw payload
- compact visual bars
- dominant PSM mode if available

This should answer "what moved?" without asking the user to inspect raw market series.

### Theses and Defeaters

Macro theses show:

- title
- market expression
- state
- confidence
- confirmations
- contradictions
- neutrals/open questions
- first invalidation condition

Defeaters show:

- release
- timing
- affected theses
- license value / importance

The key user promise is: "Here is what would change the macro read."

### Liquidity

Liquidity gets its own band because it is currently buried.

Show:

- summary
- net liquidity impulse
- Fed balance sheet component
- Treasury General Account component
- reverse repo component
- partial/unavailable state if a source is missing

### Sources

Sources provide trust and auditability.

Show:

- Macro Brain source label and data status
- MOSAIC provider list
- newest/oldest source age where available
- open gaps
- source errors or warnings if present

No raw local filesystem paths should be visible in normal UI. Raw paths can remain in developer diagnostics only if such a drawer already exists.

## Data Flow

The redesign should reuse existing endpoints and loaders first:

- `/api/macro-brain`
- `/api/mosaic`
- `loadMacroBrainSnapshot`
- `loadMosaicSnapshot`

The first implementation can keep the two existing polling hooks, but the component boundary should make it easy to later merge them into one `useMosaicCommandCenterData` hook.

Normalized UI data should be assembled near the UI boundary, not spread through JSX. The UI should receive arrays such as `worldStats`, `pressureRows`, `macroImpulseRows`, `thesisRows`, `defeaterRows`, `liquidityRows`, and `sourceRows`.

## Navigation Behavior

The sidebar should support direct links:

- `#holdings`
- `#aurora`
- `#mosaic`

Existing old anchors may redirect or scroll to the nearest new area during migration:

- `#risk` maps to Holdings
- `#holdings` maps to Holdings
- `#macro` maps to MOSAIC
- `#candidates` maps to AURORA
- `#decisions` can remain inside Holdings or AURORA depending on current implementation constraints

The first pass should preserve deep-link behavior well enough that old links do not feel broken.

## Error and Empty States

All three tabs must use honest empty states:

- Holdings: no positions yet, add holdings first.
- AURORA: no ticker loaded, choose a ticker or open AURORA.
- MOSAIC: live macro unavailable, using last stored snapshot or waiting for refresh.

MOSAIC should never show demo macro data as if it were current. If fallback data is used, the UI should say so plainly.

Errors should use the existing friendly-message approach. No raw stack traces, request paths, JSON keys, or local paths should be exposed in user-facing copy.

## Visual Direction

The sidebar should feel like an institutional terminal:

- left rail with three clear entries
- active entry visibly selected
- restrained dark theme using existing workspace tokens
- no decorative hero treatment inside `/app`
- dense but scannable panels
- no nested cards unless they are repeated items or diagnostics

MOSAIC can be visually richer than the other tabs because it has many signal layers, but it should still read as a command surface, not a landing page.

## Implementation Boundaries

In scope:

- workspace navigation restructure
- three top-level workspace modes
- moving stress test under Holdings
- moving Macro Brain under MOSAIC
- expanding MOSAIC to include Macro Brain, liquidity, theses, defeaters, and sources
- preserving live refresh behavior
- preserving current API routes

Out of scope for this pass:

- changing the macro engines
- changing the stress engine logic
- changing AURORA valuation math
- adding new external data providers
- adding a fourth top-level sidebar entry
- building full cross-routing from MOSAIC signals into AURORA assumptions

## Testing

Minimum verification:

- `npm run test:web`
- `npm run build`
- manual browser check of `/app#holdings`, `/app#aurora`, and `/app#mosaic`
- fallback check with unavailable Macro Brain or MOSAIC endpoint if feasible
- responsive check around 380px, 768px, and desktop width

Key acceptance points:

- The workspace main nav shows only Holdings, AURORA, and MOSAIC as top-level entries.
- Stress test appears under Holdings.
- Macro Brain appears inside MOSAIC, not as a competing top-level area.
- MOSAIC includes pressure rows, macro impulses, theses, defeaters, liquidity, and sources.
- Existing live refresh still works.
- Old hash links do not fail harshly.
- No unrelated engine behavior changes.


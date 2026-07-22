# BLS Prime Public Language Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace technical, AI-like and Spanglish public copy with clear financial language in Spanish and English, while marking demos and unavailable actions honestly.

**Architecture:** Keep calculation engines, routes and visual system unchanged. Treat the copy objects in each client surface as the product-language boundary; update headings, labels, explanations, CTA states and disclosure text there, plus the small verdict label component shared by AURORA. Add static copy contracts so forbidden vocabulary and broken promises do not return.

**Tech Stack:** Next.js App Router, React client components, CSS modules, Node test runner.

## Global constraints

- The public narrative is a four-question decision process: what is it worth, is it worth attention, what can go wrong, and what size is appropriate.
- Human wording comes before module names: “Valoración”, “Búsqueda de oportunidades”, and “Riesgo de cartera”.
- Do not use AI/startup/terminal jargon in visible copy unless explained in plain language.
- Never present an illustrative sample or unavailable action as live functionality.
- Preserve existing routes, calculations, i18n behavior, accessibility attributes and visual identity.

## Task 1: Landing and Breakpoint copy

**Files:** `components/public-home-experience.jsx`, `components/breakpoint/breakpoint-hero.jsx`, `components/breakpoint/breakpoint-result.jsx`, `tests-node/public-language-copy.test.mjs`

- Add failing source-contract tests for human hero copy, four questions, honest sample disclosure, and absence of visible `engine`, `OS`, `research files`, `market-clearing`, and `hurdle` wording.
- Replace landing copy in ES/EN with a plain description of BLS Prime and the four-question workflow.
- Rename terminal mock labels to human labels and explicitly retain “Ejemplo con datos ilustrativos / Illustrative example with sample data”.
- Replace Breakpoint “market-clearing surface” and “hurdle” labels with “Lo que el precio necesita / What the price needs” and “retorno exigido a 5 años / 5-year required return”.
- Keep the working ticker CTA and change secondary language to “Explorar el proceso / Explore the process”.

## Task 2: AURORA, FactorLab and Stress Engine copy

**Files:** `app/valuation-os-lab/page.jsx`, `components/aurora-verdict-card.jsx`, `components/factorlab-workstation.jsx`, `components/stress-engine-public-page.jsx`, `tests-node/public-language-copy.test.mjs`

- Add failing assertions for AURORA’s human title and explanations, FactorLab’s priority language, and Stress Engine’s plain risk language.
- Replace AURORA visible labels: “Valuation OS” → “Valoración de empresas / Company valuation”; “brecha de valor” → “diferencia entre precio y valor estimado”; “factibilidad” → “qué tan razonables son los supuestos”; “presión de mercado” → “factores que pueden mover el precio”; “calibración” → “qué tan confiable es esta lectura”.
- Replace FactorLab copy: “research files”, “hard gates”, “null test”, “composite”, “evidence score”, “neglected asymmetric” and Spanglish with “empresas”, “filtros básicos”, “comparación contra alternativas”, “puntaje de revisión”, “razones para revisar” and “razones para tener cuidado”.
- Replace Stress Engine’s visible “engine”, point-in-time, FHS, walk-forward and tail terminology with short plain explanations; keep technical methodology only inside an optional methodology section with an explanation.
- Mark unsupported buttons with “Ver ejemplo”, “Próximamente” or “Solicitar acceso” instead of implying a connected action.

## Task 3: Verification and delivery

- Run `node --conditions=react-server --test tests-node/*.test.mjs`.
- Run `npm run build`.
- Run `git diff --check` and inspect ES/EN rendered text on desktop and mobile.
- Commit with `feat: simplify public product language`.

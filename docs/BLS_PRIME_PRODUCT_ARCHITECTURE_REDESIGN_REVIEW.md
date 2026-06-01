# BLS Prime Product Architecture Redesign Review

Date: 2026-05-31

Scope: Full product-architecture review of BLS Prime based on `BLS_PRIME_PRODUCT_OVERVIEW.md`, the current public site, login flow, standalone FactorLab, and the private workspace source in `components/terminal-app.jsx`.

Core test: Does the product organize itself around the user's questions, or around the founder's internal models?

Verdict: BLS Prime is moving in the right direction, but it is not yet organized cleanly enough around the user's questions. The public homepage mostly understands the job. The private workspace partially understands the job. FactorLab does not. It still asks the user to admire the machine.

## 1. Executive Summary

BLS Prime should be a private decision workspace for a busy investor. The product should answer five questions before the user has to learn a concept:

- Can I invest more?
- What is my biggest risk?
- Am I actually diversified?
- What deserves attention?
- What should I do next?

The current product document says this explicitly, and the public homepage now mostly reflects it. The private workspace also contains the right modules: money plan, portfolio, overlap, research, FactorLab, positions, chat, staged decisions. But the organization still leaks the founder's internal ontology into the navigation and screen logic.

The product still says, in effect: "Here are our models, and here is where you can inspect them." It should say: "Here is what you should know today, here is what is allowed, here is what is blocked, and here is the one place to dig deeper."

The main redesign is not visual. It is architectural:

1. Make the first screen a decision brief, not a cockpit made of modules.
2. Replace model nouns with user-question nouns.
3. Collapse navigation from seven model areas into five decision jobs.
4. Move terms like FactorLab, recoverability, frontier, x-ray, confidence panel, and structural breadth into advanced or explanatory layers.
5. Rebuild FactorLab as an opportunity triage desk, not a factor/operator workbench.
6. Make every screen answer a question before it exposes a control.
7. Make the product's canonical object a "decision packet", not a dashboard.

The product is promising because it has unusual intelligence. The risk is that it makes the user study the intelligence instead of benefiting from it.

## 2. Brutally Honest Product Critique

The strongest thing about BLS Prime is its ambition: it wants to protect the user from bad capital decisions, not just show portfolio data. That is rare and valuable.

The weakest thing about BLS Prime is that it still behaves like the founder is the primary user. The system knows too much about its own intellectual machinery and keeps putting that machinery in front of the user.

The public homepage says "Know what to do with your money before you act." Good. That is the product.

The workspace navigation says "Today, Plan de dinero, Portafolio, Solapamiento, Investigacion, FactorLab, Posiciones." Better than before, but still mixed. Some items are user questions. Some are asset containers. Some are model surfaces. Some are maintenance screens.

The current private workspace appears to be designed around these internal categories:

- money plan
- portfolio analytics
- diversification/overlap model
- equity research
- FactorLab
- holdings editor
- chat/glossary/guide

The user is not trying to navigate categories. The user is trying to reduce anxiety and decide whether to act.

The first screen is called a decision cockpit. It contains the right ingredients, but "cockpit" is still generous. It is closer to a well-organized module dashboard with a decision card on top. A true cockpit would prioritize instruments by urgency, suppress irrelevant machinery, and make the next action obvious.

The biggest problem is not complexity itself. A Bloomberg Terminal is complex. The problem is unearned complexity in the first minute. BLS Prime has to earn the right to show advanced concepts after it has already answered the user's practical questions.

## 3. First-Time User Experience Review

This section combines actual local browser inspection of the public, login, and FactorLab screens with source-grounded review of the private workspace.

### Minute 0: Public Homepage

What I think the product does:

It helps me decide whether to act, wait, or reject an investment move. It connects cash, holdings, market context, and research.

What confuses me:

"Decision workspace", "decision engine", and "plain-language portfolio review" are understandable but slightly meta. I know this is decision software, but I still do not see my own financial question stated as the interface.

What feels useful:

"Wait before adding more risk" is excellent. It is concrete. It is a real answer. "Final call: Wait", "Confidence: 72%", and "Action status: Staged" make the product feel useful.

What feels like internal machinery:

"Checks", "Tradeoffs", "Decision engine", and "Confidence" are okay in the preview, but they still describe the system's reasoning apparatus rather than my situation.

What would make me leave:

If I click into the app and get a glossary-heavy workspace before I understand my money, risk, and next step.

### Minute 1: Workspace Preview

What I think the product does:

It will review my portfolio and produce a final decision with reasons.

What confuses me:

The preview sidebar says Inputs, What matters, Checks, Tradeoffs, Decision. This is more understandable than the private workspace nav. It is closer to the right IA than the actual workspace.

What feels useful:

The example is specific: wait before adding broad risk because the portfolio depends on the same few risks.

What feels like internal machinery:

The "important signal map" style visual implies hidden intelligence, but it does not yet tell me what I can do.

What would make me leave:

If the real app does not match the preview's clarity.

### Minute 2: Login

What I think the product does:

It is a private capital operating system with a persistent money plan, portfolio, research desk, and decision memory.

What confuses me:

"Capital OS" is founder language. It is cool but not as instantly useful as "Your monthly investing workspace" or "Your portfolio decision room."

What feels useful:

The Create account / Sign in split is clear. "One private workspace" is good.

What feels like internal machinery:

"Web and mobile ready" is a product capability, not a user decision benefit.

What would make me leave:

If I am asked to create an account before seeing what happens with my own data or a realistic sample.

### Minute 3: First Private Workspace Moment

Based on source, the workspace opens with a sidebar, private header, welcome guide, optional glossary, answer surface, status tiles, compliance notice, and selected active section.

What I think the product does:

It combines cash, portfolio structure, overlap, research, and actions in one place.

What confuses me:

The user sees "Espacio privado", "Plan de caja, estructura del portafolio y memoria de investigacion", "Respuesta actual", "Independencia real", "Reserva de opcionalidad", "Solapamiento", "FactorLab", "Preparadas", "Glosario", and "Guia." That is a lot of conceptual surface before the first task is complete.

What feels useful:

The three pillars are strong:

- Disponible
- Independencia real
- Reserva

This is the beginning of the right product.

What feels like internal machinery:

"Independencia real", "brecha", "solapamiento", "recuperabilidad", "confidence panel", "xray", and "recoverability map" are model products. They may be useful, but they should not be first-minute nouns.

What would make me leave:

If I have no holdings connected and the product shows abstract placeholders or asks me to learn the glossary before showing a useful sample, setup progress, or next step.

### Minute 4: Navigation Pass

What I think the product does:

Each nav item opens a layer of the capital decision.

What confuses me:

The navigation is not purely question-first. "Hoy" is a time surface. "Plan de dinero" is a user job. "Portafolio" is an object. "Solapamiento" is a model result. "Investigacion" is an activity. "FactorLab" is a branded internal tool. "Posiciones" is maintenance.

What feels useful:

The nav details help: "Ingreso y caja invertible", "Trayectoria y motores", "Ideas con reglas", "Posiciones y ediciones."

What feels like internal machinery:

The priorities "Inicio, Fondos, Lectura, Auditar, Explicar, Filtrar, Actualizar" are internal metadata. They are tidy, but they add vocabulary without helping the user decide.

What would make me leave:

If I have to click through all seven to answer the basic questions.

### Minute 5: FactorLab

What I think the product does:

It is a factor-screen builder that prevents lookahead bias.

What confuses me:

Almost everything. "Point-in-time screening", "refusals", "operator catalog", "63 operators", "Parquet / CSV", "DAG view", "Spec JSON", "log_return", "rolling_std", "neutralize", "asof_join", "top_k", "E036" are not opportunity-discovery language.

What feels useful:

The idea of rejecting future-looking calculations is very valuable. The user should trust that the system refuses bad evidence.

What feels like internal machinery:

The whole standalone FactorLab screen is machinery. It is a developer/debugger workbench presented as a product.

What would make me leave:

Seeing entity IDs and JSON before seeing real candidates, reasons, and what I should investigate.

## 4. Information Architecture Audit

### Current Navigation

| Current item | Immediate user understanding | Distinct user problem | Verdict |
| --- | --- | --- | --- |
| Today / Hoy | Medium. "Today" is intuitive, but vague. | What should I know now? | Keep, rename to "Today" or "Now" only if it becomes the decision brief. |
| Money / Plan de dinero | High. Clear and useful. | Can I invest more? | Keep, but make the label question-first: "Can I invest?" |
| Portfolio / Portafolio | High but broad. | What do I own and how is it behaving? | Keep as a lower-level object view, not top decision nav. |
| Diversification / Solapamiento | Medium. The idea is useful, the label is not universal. | Am I actually diversified? | Keep the capability, rename the surface. |
| Research / Investigacion | Medium. Useful but broad. | What should I investigate? Why does an idea deserve attention? | Merge into Opportunities unless the research desk is actively used every session. |
| FactorLab | Low for normal users. | Find ideas with rules and reject invalid evidence. | Hide or rename. It should not be primary nav. |
| Holdings / Posiciones | High but maintenance-oriented. | Update my portfolio data. | Move to Data or Settings, not primary decision nav. |

### Alternative Navigation From Scratch

Primary nav should be:

1. Today
   - User question: What should I do now?
   - Contents: decision brief, changed-since-last-time, next action, blocked actions, confidence/evidence summary.

2. Money Room
   - User question: Can I invest more?
   - Contents: monthly investable cash, reserve safety, contribution room, funding source, "do not invest yet" reasons.

3. Risk Room
   - User question: What can hurt me most?
   - Contents: dominant exposure, concentration, liquidity, overlap, stress behavior, "what breaks first."

4. Opportunity Desk
   - User question: What deserves attention?
   - Contents: candidates, why they surfaced, why they may be wrong, research memo, evidence quality, reject reasons.

5. Decisions
   - User question: What should I do next, and what did I already decide?
   - Contents: staged actions, rejected actions, decision memory, outcomes, recheck triggers.

Secondary / utility nav:

- Portfolio Data
- Settings
- Advanced Models
- Help

This nav is shorter, more durable, and more natural for a busy user.

## 5. Question-First Product Design

The product should be reorganized around six questions.

### Question 1: What should I do today?

Primary answer format:

- Recommendation: Wait, add, trim, repair, review, or do nothing.
- Reason: one sentence.
- What changed: one sentence.
- Evidence: weak, usable, strong.
- Next step: one button.

This becomes the home screen.

### Question 2: Can I invest more?

Primary answer format:

- Investable this month: dollar amount.
- Safe contribution: dollar amount.
- Reserve status: healthy, thin, below target.
- Funding source: cash, monthly surplus, trim, none.
- Constraint: why the answer could be "no."

This replaces "Plan de dinero" as a user-facing job.

### Question 3: What is my biggest risk?

Primary answer format:

- Biggest risk: plain-language name.
- Why it matters: one sentence.
- Positions involved: list.
- What would reduce it: action or non-action.
- Urgency: now, monitor, ignore.

This absorbs parts of Portfolio, Solapamiento, X-Ray, and Recoverability.

### Question 4: Am I truly diversified?

Primary answer format:

- Visible diversification: what it looks like.
- Real diversification: what still behaves independently.
- Hidden overlap: plain-language gap.
- Main repeated bet: one phrase.
- Best diversifier: position or missing exposure.

This keeps the overlap engine but stops forcing the user to know "phantom diversification."

### Question 5: What opportunities deserve attention?

Primary answer format:

- Shortlist: real tickers or themes.
- Why surfaced: value, quality, momentum, risk, event, portfolio fit.
- What could be wrong: one sentence per idea.
- Evidence quality: weak/usable/strong.
- Next action: investigate, stage, reject, ignore.

This is where FactorLab belongs.

### Question 6: What assumptions could be wrong?

Primary answer format:

- Main assumption: plain language.
- Evidence against it.
- What would falsify it.
- What to monitor.
- Recheck date or trigger.

This is a trust layer. It should be accessible from every decision packet.

## 6. Concept Purge

| Concept | Current user cost | Recommendation | User-facing replacement |
| --- | --- | --- | --- |
| Phantom Diversification | Requires explanation before value. | Hide as model name. | "Hidden overlap" or "Diversification gap." |
| Recoverability | Powerful but abstract. | Summarize first; explain on demand. | "Room to recover if wrong." |
| Structural Breadth | Too technical. | Hide. | "How many independent bets remain." |
| Independence Real | Understandable after explanation, not before. | Rename. | "Real diversification." |
| FactorLab | Branded internal lab. | Rename or hide under advanced. | "Opportunity Desk" or "Idea Triage." |
| Frontier | Internal modeling term. | Hide. | "Allowed actions" or "What is open now." |
| X-Ray | Generic product metaphor. | Hide or use only in advanced. | "Portfolio scan." |
| Confidence Panel | Model artifact. | Summarize. | "Evidence strength." |
| Risk Topology | Too academic. | Hide. | "What risks move together." |
| Visible Fiber | Strong internally, obscure externally. | Advanced only. | "Similar past states." |
| Decision Cockpit | Overpromises unless the screen is truly prioritized. | Rename if needed. | "Today's brief." |
| Escrow | Financial/legal baggage. | Rename. | "Staged actions" or "Prepared moves." |
| State Contract | Internal. | Hide. | "Data snapshot." |
| Repair Candidates | Good concept, slightly mechanical. | Rename. | "Ways to fix it." |
| Guardrails | Good. | Keep. | "Your rules." |
| Lookahead Refusal | Too technical. | Summarize. | "Rejected because it uses future data." |
| Operator Catalog | Developer-facing. | Remove from normal UI. | Advanced diagnostics only. |
| DAG View | Developer-facing. | Remove from normal UI. | Advanced diagnostics only. |
| Spec JSON | Developer-facing. | Remove from normal UI. | Export/debug only. |
| Mom Z / Quality Z / Resvol | Quant terms. | Hide by default. | "Price strength", "Business quality", "Volatility." |

Principle: If a concept needs a glossary before it creates value, it should not be a first-level product concept.

## 7. Product Narrative

Current dominant story:

"Here are our models: money plan, portfolio structure, overlap, research, FactorLab, holdings, state, recoverability, confidence."

Intended story:

"Here is what you should know today before you move money."

The intended story is better. It should dominate every surface.

Ideal 60-second narrative:

1. BLS Prime reads your cash, portfolio, rules, and research.
2. It tells you whether to act, wait, repair, or investigate.
3. It shows the one risk that matters most.
4. It tells you how much money is actually available.
5. It refuses evidence that would have been unavailable at the time.
6. It remembers what you decided and checks what happened later.

That is the whole product. Everything else is implementation.

## 8. Homepage Of The Private Workspace

The first private screen should be "Today's Brief", not "Decision Cockpit."

It should answer before explaining.

### Proposed First Screen

Top line:

> Today: Wait before adding broad risk.

Subline:

> You have investable cash, but the portfolio is still too dependent on the same few risks. Review the overlap before adding.

Five answer tiles:

1. Can I invest?
   - "$X available this month"
   - "Reserve is healthy/thin/below target"
   - Button: Adjust money plan

2. Biggest risk
   - "Your largest repeated bet is mega-cap growth / USD / rates / single-name concentration"
   - Button: See why

3. Truly diversified?
   - "Looks like 12 names; behaves like 5 independent bets under stress"
   - Button: Show hidden overlap

4. What changed?
   - "Cash improved, overlap worsened, one candidate became cheaper"
   - Button: View changes

5. Next step
   - "Review overlap, then decide whether to stage a smaller add"
   - Button: Start decision

Below the fold:

- Evidence strength
- Staged actions
- Opportunities to investigate
- Portfolio data health

What disappears from first screen:

- model names
- maps
- JSON-like diagnostics
- glossary prompts
- multi-module grid sprawl
- advanced FactorLab language

The first screen should feel less like a terminal and more like a chief of staff: short, current, decisive, and easy to challenge.

## 9. FactorLab Review

Current FactorLab is best described as:

- A point-in-time factor-screen builder
- A rules/ranking/rejection engine
- A developer-facing model workbench

A normal user would not call it an idea generator yet. They would call it a screener if they understood it at all.

The strongest underlying value is not "factor investing." The strongest value is:

> BLS Prime can find investment candidates and reject fake evidence before it misleads you.

### Redesign FactorLab From First Principles

Rename:

- Preferred: Opportunity Desk
- Alternative: Idea Triage
- Advanced label: FactorLab, visible only in diagnostics

Primary user question:

> What opportunities deserve attention, and why might they be wrong?

New structure:

1. Shortlist
   - real ticker/name/theme
   - why it appeared
   - portfolio fit
   - evidence quality
   - next action

2. Reasons
   - valuation
   - quality
   - momentum
   - risk fit
   - portfolio overlap

3. Disqualifiers
   - too crowded
   - already owned too much
   - weak source data
   - future-looking evidence rejected
   - liquidity / concentration problem

4. Research packet
   - memo
   - debate
   - sources
   - what would change the view

5. Advanced rules
   - criterion builder
   - date correctness
   - audit trail
   - raw model diagnostics

What to remove from normal FactorLab:

- operator catalog
- 63 operators
- Parquet / CSV
- DAG view
- Spec JSON
- synthetic entity IDs
- log_return / rolling_std / neutralize / asof_join
- Mom Z / Resvol as primary columns

What to show instead:

- "Apple Inc."
- "Why it surfaced"
- "What could be wrong"
- "Would this add a new risk or repeat an existing one?"
- "Evidence rejected: this rule used future data"
- "Investigate / Stage / Reject"

FactorLab's best trust feature is refusal. But "refusal" should be translated into a user benefit:

> We rejected this signal because it would not have been knowable when you made the decision.

That is powerful. It should be shown as a badge on an idea, not as a developer demo.

## 10. Hide The Intelligence

Assume the models are excellent. The product should expose outcomes, not implementation.

| Model / engine | Current visibility | Ideal visibility |
| --- | --- | --- |
| Monthly money plan | Visible | Visible. This is user-owned input. |
| Portfolio holdings | Visible | Visible, but mostly as data health and editable source. |
| Portfolio analytics | Visible | Summarized first; detailed on demand. |
| Hidden overlap / phantom diversification | Visible as concept | Summarized as "real diversification"; explainable on demand. |
| Recoverability | Semi-visible | Summarized as "room to recover"; formula advanced only. |
| Confidence panel | Visible as model output | Summarized as evidence strength. |
| X-ray | Internal surface | Hide. Convert to "portfolio scan." |
| Frontier | Internal surface | Hide. Convert to "allowed actions." |
| Factor ranking engine | Highly visible | Hidden behind Opportunity Desk. |
| Lookahead validator | Visible in technical form | Explainable on demand through rejected evidence badge. |
| Equity research agents | Semi-visible | Show memo, sources, debate, and audit; hide agent machinery. |
| State contract | Internal | Completely hidden except export/debug. |
| Decision memory | Visible | Visible, because it builds user trust. |
| Repair composer | Should be visible | Show as "ways to fix it." |
| Analog/fiber retrieval | Advanced concept | Show as "similar past states"; methodology on demand. |

Where BLS Prime sits today:

It is halfway between outcome product and model showroom. It should move decisively toward outcome product.

## 11. Apple Test

If Apple acquired BLS Prime and kept the engine, the following would happen:

What changes:

- The first screen becomes a single daily brief.
- Navigation is reduced to the few things users actually ask.
- Every model name disappears from primary UI.
- Warnings become plain-language consequences.
- Actions become reversible, staged, and calm.
- The product stops proving that it is intelligent and starts making the user feel oriented.

What disappears:

- FactorLab as a public-facing name.
- Operator catalog.
- Spec JSON.
- DAG view.
- "Recoverability balance sheet" as a label.
- "X-Ray", "Frontier", "Confidence Panel" as exposed product nouns.
- Glossary as first-use dependency.

What becomes main experience:

- Today's recommendation.
- Money available.
- Biggest risk.
- Hidden overlap.
- Opportunity shortlist.
- Staged decision and memory.

What becomes secondary:

- Research detail.
- Methodology.
- Model diagnostics.
- Raw holdings table.
- Advanced rule building.

The Apple version would not be less intelligent. It would be less self-conscious.

## 12. Top 25 Comprehension Failures

1. The product alternates between user language and model language.
2. "Capital OS" sounds ambitious but not immediately actionable.
3. "Decision cockpit" does not yet prioritize like a cockpit.
4. The private nav mixes time, objects, models, tools, and maintenance.
5. FactorLab is not understandable without factor/model context.
6. The standalone FactorLab screen is developer-facing.
7. "Independencia real" requires interpretation before value.
8. "Solapamiento" is useful but not the user's native question.
9. "Recoverability" leaks into the product as a concept instead of becoming a plain answer.
10. "Frontier" is internal modeling language.
11. "X-Ray" is a vague metaphor.
12. "Confidence Panel" describes a component, not a user outcome.
13. "Escrow" is the wrong term for prepared actions.
14. The glossary existence signals that too much vocabulary remains exposed.
15. The welcome guide teaches the app instead of letting the app answer first.
16. The user is asked to understand "rules" before seeing opportunities.
17. FactorLab uses synthetic IDs, reducing trust and comprehension.
18. FactorLab shows JSON before user value.
19. FactorLab emphasizes refusal mechanics instead of trustworthy idea triage.
20. The first screen has too many supporting modules.
21. The sidebar priority labels add cognitive load.
22. "Research" is too broad to tell the user why to enter.
23. "Portfolio" is too broad to be a decision destination.
24. "Holdings" is maintenance, not a primary question.
25. The product does not yet make "what changed since last time" prominent enough.

## 13. Top 25 Naming Improvements

| Current | Better |
| --- | --- |
| Today / Hoy | Today's Brief |
| Plan de dinero | Can I invest? |
| Portafolio | Portfolio scan |
| Solapamiento | Real diversification |
| Investigacion | Opportunities |
| FactorLab | Opportunity Desk |
| Posiciones | Portfolio data |
| Decision Cockpit | Today's Brief |
| Respuesta actual | Today's answer |
| Respuesta ejecutiva | Main answer |
| Independencia real | Real diversification |
| Brecha | Hidden overlap |
| Reserva de opcionalidad | Room to wait |
| Recoverability | Room to recover |
| Recoverability map | Recovery map |
| Frontier | Allowed actions |
| X-Ray | Portfolio scan |
| Confidence panel | Evidence strength |
| Escrow | Staged actions |
| Movimientos preparados | Staged moves |
| Rechazo | Rejected evidence |
| Operator catalog | Advanced rule library |
| DAG view | Rule path |
| Spec JSON | Exported rule |
| Risk topology | Risks that move together |

## 14. Features To Remove

Remove from normal user experience:

- standalone FactorLab developer workbench as currently framed
- operator catalog from primary UI
- DAG view from primary UI
- Spec JSON from primary UI
- synthetic candidate IDs in user-facing rankings
- raw technical factor names as table columns
- glossary dependency on first use
- sidebar priority labels
- exposed state-contract terminology
- model nouns that do not answer a user question

Do not necessarily delete the code. Remove these from normal navigation and first-minute experience.

## 15. Features To Merge

Merge:

- Portfolio + Solapamiento + Recoverability into "Risk Room" for primary navigation.
- Research + FactorLab into "Opportunity Desk."
- Holdings + data source status into "Portfolio Data."
- Escrow + Decisions + Memory into "Decisions."
- Guide + Glossary into contextual explanations that appear only when a term is clicked.
- Confidence Panel + evidence drawer into "Evidence strength."

## 16. Features To Hide

Hide behind Advanced / Methodology:

- FactorLab name
- operator catalog
- rule DAG
- JSON spec
- model registry
- state contract
- frontier internals
- x-ray internals
- recoverability formula
- visible fiber methodology
- point-in-time data implementation details

Expose on demand:

- why a recommendation was made
- what data was used
- what evidence was rejected
- what assumptions could be wrong
- what would change the decision

## 17. New Navigation Structure

Recommended nav:

1. Today's Brief
2. Can I Invest?
3. Biggest Risk
4. Opportunities
5. Decisions

Utility:

- Portfolio Data
- Settings
- Advanced
- Help

This structure is more user-native than the current nav because every primary item maps to a question or decision job.

## 18. User Journey From Login To Decision

1. User logs in.
2. The app shows Today's Brief.
3. The top answer says: act, wait, repair, investigate, or no action.
4. The app immediately states investable cash and reserve status.
5. The app identifies the biggest risk in plain language.
6. The app states whether diversification is real or overstated.
7. The app shows what changed since last visit.
8. The app offers one next step.
9. If the user clicks, the app opens the relevant room, not a generic dashboard.
10. The user can stage, reject, or defer the action.
11. The decision is logged.
12. The app later reports what happened and whether the decision improved the user's action space.

The journey should feel like:

> I came in uncertain. Within one minute I know whether to move, what constrains me, and what to inspect next.

## 19. Prioritized Roadmap

### Phase 1: Rename And Reorganize

- Replace primary nav with question-first nav.
- Move FactorLab and Holdings out of primary nav.
- Rename exposed model terms.
- Replace "Decision Cockpit" with "Today's Brief."
- Add "What changed since last time" to the first screen.

### Phase 2: Build The Decision Packet

- Define a canonical decision packet object:
  - recommendation
  - why now
  - money constraint
  - biggest risk
  - diversification read
  - evidence strength
  - what could be wrong
  - next action
  - recheck trigger
- Render this as the first private screen.
- Make all modules feed the packet instead of competing with it.

### Phase 3: Rebuild FactorLab As Opportunity Desk

- Replace operator-first UI with candidate-first UI.
- Show real ticker/company names.
- Add "why surfaced", "what could be wrong", "portfolio fit", and "evidence rejected."
- Move raw rule builder to advanced.
- Turn refusal into a trust badge, not a tab.

### Phase 4: Progressive Explanation

- Remove glossary as a first-use crutch.
- Make terms clickable only when needed.
- Add "show methodology" drawers to risk, diversification, and evidence strength.
- Keep user-facing screens free of JSON, DAG, and operator terms.

### Phase 5: Decision Memory

- Make staged/rejected/accepted decisions first-class.
- Show outcomes after fixed horizons.
- Explain whether the decision preserved or reduced room to recover.
- Build trust through memory rather than more model display.

### Phase 6: Advanced Mode

- Keep the founder/model surfaces available for expert users.
- Label them clearly as Advanced.
- Make Advanced a separate mode, not mixed into the primary product.

## 20. Final Recommendation

BLS Prime should not become a prettier dashboard. It should become the user's private decision brief for capital.

The engine can remain sophisticated. The interface should become almost ruthlessly simple:

- What should I do today?
- Can I afford it?
- What is the biggest risk?
- Am I actually diversified?
- What deserves attention?
- What could be wrong?

If BLS Prime can answer those in under one minute, the user will trust it.

If it asks the user to understand Phantom Diversification, Recoverability, FactorLab, Frontier, X-Ray, and Confidence Panel before the user gets a decision, the product will feel brilliant but founder-shaped.

The product should keep the intelligence and hide the machinery.

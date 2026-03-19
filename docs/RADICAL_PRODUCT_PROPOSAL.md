# Radical Product Proposal

This note is for a second agent to review, challenge, and extend.

The goal is not to make the dashboard prettier. The goal is to turn this project into a **state-aware capital operating system** that helps a user decide what to do now, what to avoid, and what keeps the portfolio recoverable if they are wrong.

## Core Thesis

The project is already stronger than a normal market terminal because it has primitives that most finance products do not combine:

- `recoverability`
- `visible fiber`
- `state contract`
- `repair candidates`
- `Just advice`
- `Decision Workflow`
- `Edge Radar`
- `decision memory`

The strategic opportunity is to combine those primitives into a product that does three things well:

- explains the current state in plain language
- recommends only actions that preserve future freedom
- learns from the outcome of each recommendation

That is the moat. Not more signals.

## What Makes This Special

Most finance tools do one of these:

- screen for ideas
- show charts
- report risk
- produce scores
- help execution

This project can do something rarer:

- observe the portfolio as a living system
- identify similar-looking states that later diverge
- recommend action only when the state supports it
- remember what happened after the action

That is a decision runtime, not a dashboard.

## Product Bets

### 1. Capital Constitution Compiler

Let the user describe intent in plain English, then compile it into policy.

Examples:

- stay growth-leaning, but do not let the book become fragile
- below a certain recoverability threshold, do not add broad risk
- when visible fiber ambiguity is high, only allow reversible moves
- if the rebound is not credible, trim first and ask later

Why this matters:

- the product becomes governable instead of magical
- a non-finance user can understand the rules
- the system can enforce the user’s own risk philosophy

What this needs:

- a policy schema
- rule compilation from text to machine-readable constraints
- visible status for what is allowed, blocked, and why

### 2. Portfolio Digital Twin

Treat the portfolio as a live object that can be simulated.

The twin should answer:

- what changes if I trim this name
- what changes if I add risk now
- what changes if I fund a move from cash or from a hedge
- what changes if I do nothing

Why this matters:

- the user sees consequences, not just recommendations
- every action can be compared against a counterfactual
- recoverability becomes a measurable property of the portfolio, not a vague feeling

What this needs:

- a state snapshot
- an action simulator
- a counterfactual evaluator
- a post-action outcome writer

### 3. Decision Memory Loop

Every recommendation should become memory.

Record:

- state at the time
- action proposed
- action taken or rejected
- reason shown to the user
- outcome after 5, 10, 20 days
- whether recoverability improved
- whether the state became more or less ambiguous

Why this matters:

- the system becomes personalized
- the system learns which advice is useful in practice
- the memory becomes a proprietary dataset

This is a serious moat if implemented well.

## Visible Fiber

Visible fiber is one of the strongest concepts in the project.

It should be treated as a first-class system, not a sidebar label.

The point of visible fiber is:

- some market states look the same on the surface
- later they resolve differently
- the surface is not sufficient

The product should show:

- how many similar states were found
- how many healed well
- how many bounced but stayed weak
- how many got worse
- how ambiguous the current state is

Why this matters:

- it detects hidden state
- it tells the user when the model is under-informed
- it gives the system a way to say “this looks similar, but the outcome distribution is unstable”

The next level is action-conditioned visible fiber:

- in similar states, what happened after trim
- in similar states, what happened after add
- in similar states, what happened after hold
- in similar states, what happened after hedge

That is much stronger than nearest-neighbor analog retrieval.

## Repair Composer

The system should not only say what is wrong.

It should generate a repair bundle.

The repair bundle should answer:

- what to trim
- what funds it
- what it improves
- what remains blocked
- what would reopen the range

This matters because it keeps the product action-oriented and reversible.

It also fits the recoverability framing better than generic “buy/sell” language.

## Permissioned Autonomy

The system should not always act like it knows best.

It should earn authority in layers.

When evidence is strong:

- it can speak more directly
- it can suggest more assertive moves
- it can widen the action envelope

When evidence is weak:

- it should narrow the action envelope
- it should recommend smaller moves
- it should ask for confirmation

This is important for trust.

It is also commercially useful because users will pay for a system that knows when not to be loud.

## State-Conditioned Research Routing

Do not show everything all the time.

Show only what is useful in the current state.

Examples:

- in fragile states, show defense and recoverability first
- in constructive states, show where to add and why
- in ambiguous states, show fiber uncertainty and keep moves small
- in blocked states, show what would need to change to reopen action

This makes the product feel intentional instead of noisy.

## Architecture Direction

The architecture should center on a few durable objects.

### Core objects

- `StateSnapshot`
- `PortfolioState`
- `PolicyState`
- `ActionCandidate`
- `RepairCandidate`
- `VisibleFiberSample`
- `DecisionEvent`
- `OutcomeEvent`

### Core services

- state ingestion
- normalization
- policy compilation
- action generation
- visible fiber retrieval
- repair composition
- memory writing
- outcome attribution

### Core UI layers

- plain-English advice layer
- portfolio layer
- state and recoverability layer
- fiber and ambiguity layer
- deep diagnostics for experts

The UI should be progressive:

- first line: what to do
- second line: why
- third line: what would change
- fourth line: evidence and analogs for people who want depth

## Monetization Paths

This can support more than one business model.

- premium retail subscription
- advisor / RIA workflow software
- white-label decision engine
- API for state, fiber, and recoverability
- research data product

The best near-term commercial wedge is likely:

- premium decision support for serious individual investors
- then advisor-facing tooling once the memory loop is proven

The best long-term wedge is:

- a platform for governed capital decisioning

## What Not To Do

- do not turn this into another generic screener
- do not bury the user in factor vocabulary
- do not make visible fiber feel like a magic black box
- do not overclaim predictive certainty
- do not optimize for more charts before the decision loop is solid
- do not confuse explanation with repetition

## Open Questions For The Next Reviewer

- What is the smallest version of the decision memory loop that still compounds?
- What is the minimum viable policy compiler for non-finance users?
- Which fiber outputs actually change user behavior?
- What is the cleanest architecture for action-conditioned analog retrieval?
- Which pieces should be private, and which can be public?
- What is the most defensible B2B wedge, if we later want advisor or RIA revenue?
- What is the best way to quantify “preserved optionality” in a way users can understand?

## Suggested Review Criteria

- Does the design preserve recoverability better than a normal portfolio tool?
- Does the design produce clearer actions, not just more information?
- Does the architecture create memory that compounds?
- Does the product remain understandable to a non-finance user?
- Does the system become more useful after each decision it observes?

## Bottom Line

The project can become much more than a dashboard if it is built as a decision runtime with memory.

The strongest combined strategy is:

- Capital Constitution Compiler
- Portfolio Digital Twin
- Decision Memory Loop
- Visible Fiber Atlas
- Repair Composer

If these are integrated well, the product can be both useful and defensible.

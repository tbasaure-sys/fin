# BLS Prime Trust Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implement the approved P0/P1 trust fixes for locale, authentication entry points, cache recovery, public branding, Stress modal accessibility, canonical routing, and SEO.

**Architecture:** Keep the current Next.js 14 application and engines intact. Add a small pure locale contract shared by middleware, server layout, and client preference code; keep destructive recovery explicit; preserve the existing public visual direction while correcting navigation and metadata.

**Tech Stack:** Next.js 14 App Router, React 18, CSS Modules, Node test runner, in-app Browser QA.

## Global Constraints

- Preserve all valuation, factor, stress, authentication hashing, database, and user-data logic.
- Do not add a UI library or perform a visual rewrite.
- Keep BLS Prime as the textual master brand.
- Use one final intentional commit because the user explicitly requested the completed change as a commit.
- Work only in branch codex/bls-prime-trust-foundation.

---

### Task 1: Locale and recovery contracts

**Files:**
- Create: lib/i18n/locale.js
- Create: tests-node/public-trust-foundation.test.mjs
- Modify: middleware.js
- Modify: app/layout.js
- Modify: components/language-layer.jsx
- Modify: app/recover/route.js

**Interfaces:**
- Produces: normalizeLocale(value), routeDefaultLocale(pathname), resolveRequestLocale(input), LANGUAGE_COOKIE_KEY.
- Consumes: request pathname, query lang, locale cookie.

- [ ] **Step 1: Write failing locale and recovery tests**

~~~js
test("locale contract respects explicit query and route defaults", () => {
  assert.equal(resolveRequestLocale({ pathname: "/", queryLanguage: "en" }), "en");
  assert.equal(resolveRequestLocale({ pathname: "/aurora" }), "es");
  assert.equal(resolveRequestLocale({ pathname: "/stress" }), "en");
});

test("automatic cache recovery never clears browser storage", () => {
  const layout = readFileSync("app/layout.js", "utf8");
  assert.doesNotMatch(layout, /localStorage\.clear|sessionStorage\.clear/);
});

test("manual recovery requires confirmation and preserves language", async () => {
  const preview = await GET(new Request("http://localhost/recover"));
  assert.doesNotMatch(await preview.text(), /void run\(\)|setTimeout/);
  const confirmed = await GET(new Request("http://localhost/recover?confirm=1"));
  assert.equal(confirmed.headers.get("Clear-Site-Data"), '"cache"');
  assert.match(await confirmed.text(), /blsprime_language_preference/);
});
~~~

- [ ] **Step 2: Run the focused test and confirm RED**

Run: npm run test:web -- --test-name-pattern="locale contract|automatic cache recovery|manual recovery"
Expected: FAIL because lib/i18n/locale.js does not exist and recovery is still automatic/destructive.

- [ ] **Step 3: Implement the locale helper and middleware header**

~~~js
export const LANGUAGE_COOKIE_KEY = "blsprime_language_preference";

export function normalizeLocale(value, fallback = "es") {
  return value === "en" || value === "es" ? value : fallback;
}

export function routeDefaultLocale(pathname) {
  if (pathname === "/aurora" || pathname === "/valuation-os-lab") return "es";
  if (pathname === "/factorlab" || pathname === "/stress") return "en";
  return "es";
}
~~~

Middleware must set x-bls-locale on forwarded request headers and persist a valid query language in a SameSite=Lax cookie.

- [ ] **Step 4: Make automatic recovery storage-safe and manual recovery explicit**

The global recovery script may unregister service workers and delete CacheStorage only. /recover without confirm renders an explanation and two choices; ?confirm=1 clears session/local state while preserving the locale preference, then redirects to /aurora?recovered=1. Clear-Site-Data is limited to "cache".

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: npm run test:web -- --test-name-pattern="locale contract|automatic cache recovery|manual recovery"
Expected: PASS.

### Task 2: Honest public entry points and stable initial locale

**Files:**
- Modify: app/page.js
- Modify: components/public-home-experience.jsx
- Modify: app/home-page.module.css
- Modify: app/login/page.js
- Modify: components/stress-engine-public-page.jsx
- Test: tests-node/public-trust-foundation.test.mjs

**Interfaces:**
- Consumes: x-bls-locale from middleware.
- Produces: initialLanguage prop and explicit signin/signup URLs.

- [ ] **Step 1: Add failing source-contract tests**

~~~js
assert.match(home, /intent=signin/);
assert.match(home, /intent=signup/);
assert.match(home, /Illustrative sample|Ejemplo ilustrativo/);
assert.doesNotMatch(home, /const displayBrand = "BL'S"/);
~~~

- [ ] **Step 2: Run focused tests and confirm RED**

Run: npm run test:web -- --test-name-pattern="public entry points"
Expected: FAIL on missing explicit intents, disclosure, and canonical textual brand.

- [ ] **Step 3: Implement minimal public changes**

app/page.js reads x-bls-locale and passes it as initialLanguage. PublicHomeExperience initializes state from that prop, uses /login?intent=signin for the header, /login?intent=signup for create-workspace CTAs, labels the terminal as illustrative/non-live, exposes an equivalent visually-hidden sentence, and renders BLS Prime as the textual brand. Stress public navigation uses BLS Prime.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: npm run test:web -- --test-name-pattern="public entry points"
Expected: PASS.

### Task 3: Accessible Stress account gate

**Files:**
- Modify: components/stress-account-gate.jsx
- Modify: components/stress-account-gate.module.css
- Test: tests-node/public-trust-foundation.test.mjs

**Interfaces:**
- Produces: dialog with initial focus, focus trap, Escape close, focus restoration, and inert background.

- [ ] **Step 1: Add failing modal contract test**

~~~js
assert.match(gate, /createPortal/);
assert.match(gate, /inert/);
assert.match(gate, /event\.key === "Tab"/);
assert.match(gate, /triggerRef\.current\?\.focus/);
~~~

- [ ] **Step 2: Run focused test and confirm RED**

Run: npm run test:web -- --test-name-pattern="Stress gate accessibility"
Expected: FAIL because focus trapping, portal rendering, inert background, and restoration do not exist.

- [ ] **Step 3: Implement the dialog behavior**

Render the overlay through createPortal(document.body), focus the close button after opening, trap Tab and Shift+Tab among visible focusable elements, close on Escape, restore focus to the trigger, and set other body children inert/aria-hidden for the lifetime of the dialog.

- [ ] **Step 4: Run focused test and confirm GREEN**

Run: npm run test:web -- --test-name-pattern="Stress gate accessibility"
Expected: PASS.

### Task 4: Canonical AURORA routing and SEO

**Files:**
- Modify: app/aurora/page.js or route composition
- Modify: app/valuation-os-lab/page.jsx only if a reusable export is required
- Modify: middleware.js for the permanent legacy redirect
- Modify: app/layout.js
- Modify: app/page.js
- Modify: app/factorlab/page.js
- Modify: app/stress/page.js
- Modify: app/app/page.js
- Modify: app/login/page.js
- Modify: app/forgot-password/page.js
- Modify: app/reset-password/page.js
- Modify: app/terms/page.js
- Modify: app/manifest.js
- Create: app/robots.js
- Create: app/sitemap.js
- Test: tests-node/public-trust-foundation.test.mjs

**Interfaces:**
- Produces: canonical public routes and noindex private/auth routes.

- [ ] **Step 1: Add failing SEO and route tests**

~~~js
assert.match(robots, /disallow:\s*\["\/app", "\/login", "\/recover"/);
assert.match(sitemap, /"\/aurora"/);
assert.match(auroraMetadata, /canonical:\s*"\/aurora"/);
assert.match(privatePage, /index:\s*false/);
~~~

- [ ] **Step 2: Run focused test and confirm RED**

Run: npm run test:web -- --test-name-pattern="canonical SEO"
Expected: FAIL because canonical metadata, robots, and sitemap are absent.

- [ ] **Step 3: Implement canonical routing without duplicating AURORA**

Make /aurora render the existing Valuation OS while preserving ?ticker=. Redirect legacy /valuation-os-lab requests permanently to /aurora. Add route-level canonical metadata for /, /aurora, /factorlab, and /stress.

- [ ] **Step 4: Implement metadata and crawl policy**

Set metadataBase from the configured public URL, align global description with institutional equity research, add Open Graph/Twitter defaults, create robots.js and sitemap.js, and set robots index:false/follow:false for private/auth routes. /recover sends X-Robots-Tag: noindex, nofollow.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: npm run test:web -- --test-name-pattern="canonical SEO"
Expected: PASS.

### Task 5: Full verification and browser QA

**Files:**
- Modify tests only if verification exposes a real missing contract.

- [ ] **Step 1: Run the complete node suite**

Run: npm run test:web
Expected: all tests pass, zero failures.

- [ ] **Step 2: Run production build**

Run: npm run build
Expected: exit 0 with all public/private routes compiled.

- [ ] **Step 3: Browser desktop flow**

Flow: / → Sign in → signin form; / → Create workspace → signup form; / → Stress card → modal keyboard loop; /aurora?ticker=TXN remains on /aurora and loads AURORA.

Checks: identity, nonblank DOM, no framework overlay, console errors/warnings, screenshots, focus restoration.

- [ ] **Step 4: Browser mobile flow**

Viewport 390 × 844. Confirm topbar, CTAs, sample disclosure, modules, login form, and Stress dialog without overflow.

- [ ] **Step 5: Review React changes**

Check effect dependencies, global listener cleanup, localStorage/cookie schema, hydration stability, and unnecessary client rendering against build-web-apps:react-best-practices.

### Task 6: Final review and commit

**Files:**
- Include: approved audit, this plan, implementation, and tests.

- [ ] **Step 1: Review diff and scope**

Run: git status --short && git diff --check && git diff --stat
Expected: only trust-foundation files; no unrelated artifacts or secrets.

- [ ] **Step 2: Re-run fresh verification**

Run: npm run test:web && npm run build
Expected: exit 0 for both commands.

- [ ] **Step 3: Commit**

Run:

~~~bash
git add <reviewed files>
git commit -m "feat: establish BLS Prime trust foundation"
~~~

Expected: one commit on codex/bls-prime-trust-foundation.

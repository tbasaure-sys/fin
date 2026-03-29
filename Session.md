# Session Handoff

## User Goal
- Fix the workspace so the phantom diversification module works against the real connected portfolio.
- Remove the misleading reliance on stale backend snapshots.
- Verify browser behavior with the real private workspace.

## What Was Fixed

### 1. Phantom diversification preload and validation
- File: [components/terminal-app.jsx](/home/t14_ultra_7_tomas/code/fin/components/terminal-app.jsx)
- File: [lib/server/normalizers.js](/home/t14_ultra_7_tomas/code/fin/lib/server/normalizers.js)
- File: [lib/server/workspace-action-validation.js](/home/t14_ultra_7_tomas/code/fin/lib/server/workspace-action-validation.js)
- File: [tests-node/workspace-action-validation.test.mjs](/home/t14_ultra_7_tomas/code/fin/tests-node/workspace-action-validation.test.mjs)

Changes:
- Phantom panel now preloads the top 24 analyzable holdings by weight instead of blindly taking the whole connected book.
- Cash-like rows are excluded from the default phantom draft.
- `assetType` was exposed from the portfolio normalizer so the UI can identify cash rows.
- Oversized phantom requests now return a clear `400` message instead of a generic internal server error.
- Unsupported/history/timeout-like phantom errors are surfaced as user-facing `400`s.

Verified:
- Real workspace `workspace-4bcbf1d5e5d14842` has 36 positions.
- Authenticated local app render showed:
  - `Loaded 24 analyzable holdings from 36 connected rows.`
  - `2 cash-like rows excluded automatically.`
  - `10 smaller positions left out until you add them manually.`
- Authenticated phantom API checks:
  - 24 holdings -> `200`
  - 23 holdings -> `200`
  - 25 holdings -> `400` with the new explicit message

### 2. Backend URL normalization
- File: [lib/server/config.js](/home/t14_ultra_7_tomas/code/fin/lib/server/config.js)
- File: [tests-node/config.test.mjs](/home/t14_ultra_7_tomas/code/fin/tests-node/config.test.mjs)

Changes:
- Bare backend hosts like `web-production-dbde3.up.railway.app` are normalized to absolute URLs.
- Remote hosts default to `https://`.
- Localhost-style hosts preserve `http://`.

Verified:
- `BLS_PRIME_BACKEND_URL=web-production-dbde3.up.railway.app` resolves to `https://web-production-dbde3.up.railway.app`.

### 3. Stale snapshot fallback policy
- File: [lib/server/backend-snapshot.js](/home/t14_ultra_7_tomas/code/fin/lib/server/backend-snapshot.js)
- File: [lib/server/dashboard-service.js](/home/t14_ultra_7_tomas/code/fin/lib/server/dashboard-service.js)
- File: [tests-node/backend-snapshot-selection.test.mjs](/home/t14_ultra_7_tomas/code/fin/tests-node/backend-snapshot-selection.test.mjs)

Changes:
- Stale live backend snapshots are no longer treated as usable by default.
- Persisted snapshot fallback is disabled by default.
- Persisted fallback can only be re-enabled with `BLS_PRIME_ALLOW_PERSISTED_SNAPSHOT_FALLBACK=true`.
- Warning copy was changed to say stale backend snapshots were ignored rather than implying they were used.

Verified:
- Focused tests passed:
  - `node --test tests-node/backend-snapshot-selection.test.mjs tests-node/config.test.mjs tests-node/workspace-action-validation.test.mjs`
- `npm run build` passed after all changes.

## Commits Pushed
- `f27c3f2` `Normalize backend host URLs`
- `9643be8` `Ignore stale backend snapshots by default`
- `230a79b` `Clarify stale snapshot warnings`

## Current Main Blocker
- The user still reports seeing the old behavior/messages after pushes.
- Most likely cause: deployed app has not actually picked up the newest build yet.
- If the app still shows:
  - old parse-URL behavior, or
  - old stale-snapshot wording,
  then deployment is serving an older revision.

## Important Findings

### Real private workspace
- Workspace id: `workspace-4bcbf1d5e5d14842`
- Workspace name: `Tomas's Workspace`
- Owner email: `tbasaure@uc.cl`

### Real holdings shape
- 36 total holdings
- Includes `DWBDS` as `asset_type = cash`
- Includes cash-like ETF rows such as `SGOV`

### Browser/auth notes
- `dev-browser` skill was requested, but the actual `dev-browser` CLI is not installed here.
- I used the approved Playwright CLI fallback.
- Browser state was flaky for login form submission in isolated steps, so I used authenticated local HTTP plus Playwright snapshots to verify the real workspace state.

### Local authenticated verification used
- Access code from `.env.local`: `bls-prime-2026`
- Session payload confirmed the correct workspace:
  - `/api/v1/session` returned `workspace-4bcbf1d5e5d14842`

## Files Changed In This Session
- [components/terminal-app.jsx](/home/t14_ultra_7_tomas/code/fin/components/terminal-app.jsx)
- [lib/server/normalizers.js](/home/t14_ultra_7_tomas/code/fin/lib/server/normalizers.js)
- [lib/server/workspace-action-validation.js](/home/t14_ultra_7_tomas/code/fin/lib/server/workspace-action-validation.js)
- [lib/server/config.js](/home/t14_ultra_7_tomas/code/fin/lib/server/config.js)
- [lib/server/backend-snapshot.js](/home/t14_ultra_7_tomas/code/fin/lib/server/backend-snapshot.js)
- [lib/server/dashboard-service.js](/home/t14_ultra_7_tomas/code/fin/lib/server/dashboard-service.js)
- [tests-node/workspace-action-validation.test.mjs](/home/t14_ultra_7_tomas/code/fin/tests-node/workspace-action-validation.test.mjs)
- [tests-node/config.test.mjs](/home/t14_ultra_7_tomas/code/fin/tests-node/config.test.mjs)
- [tests-node/backend-snapshot-selection.test.mjs](/home/t14_ultra_7_tomas/code/fin/tests-node/backend-snapshot-selection.test.mjs)

## Recommended Next Steps For Another Agent
1. Verify what exact commit is deployed in the target environment.
2. Confirm whether the deployed frontend has picked up commit `230a79b` or later.
3. If deployment is current and the stale warning still appears, inspect the live deployed response payload for `status.warnings` from `/api/v1/workspaces/[workspaceId]/dashboard`.
4. If the user wants the stale warning removed entirely when private holdings exist, adjust [lib/server/normalizers.js](/home/t14_ultra_7_tomas/code/fin/lib/server/normalizers.js) alert-building behavior so ignored backend snapshots do not generate a top-level desk note.

## Commands Successfully Used
- `node --test tests-node/backend-snapshot-selection.test.mjs tests-node/config.test.mjs tests-node/workspace-action-validation.test.mjs`
- `npm run build`
- Authenticated local HTTP to:
  - `/api/auth/login`
  - `/api/v1/session`
  - `/api/v1/workspaces/workspace-4bcbf1d5e5d14842/phantom-diversification`

## Notes
- There is an unrelated pre-existing test issue in `tests-node/dashboard-service.test.mjs` with a date-sensitive escrow expectation. I avoided relying on that suite and added focused tests instead.

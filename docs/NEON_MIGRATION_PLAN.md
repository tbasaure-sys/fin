# BLS Prime: Partial Privacy + Full Neon Migration

## Why change now

The current product is still shaped like an alpha workspace:

- holdings overlays are stored via local file state in `lib/server/private-portfolio.js`
- watchlists, alerts, saved views, and command history are stored in process memory in `lib/server/workspace-store.js`
- the primary route is a shared workspace, not a user-owned product

That works for demos, but it is the wrong base for:

- private user portfolios
- durable sessions
- multi-user usage
- premium features behind login
- a public marketing surface with a private product core

## Product split

Recommended split:

- `/` public home
  - clear value proposition
  - sample market pulse
  - limited product preview
  - signup / waitlist / login entry points
- `/demo` or `/access` public limited experience
  - sanitized sample data only
  - no personal holdings
  - no write actions
- `/app` private workspace
  - user holdings
  - user watchlist
  - user command history
  - personalized recommendations
  - premium modules

This keeps acquisition public while making the most valuable workflows private.

## Recommended stack

For a fully Neon-oriented migration:

- Neon Auth for sign-in and sessions
- Neon Postgres for application data
- Neon RLS for user-scoped access controls
- Vercel preview deployments paired with Neon branches

This is the best fit if the goal is to keep auth, identity, and data in one platform.

If you want the most portable option instead, use Auth.js with Neon Postgres. But if the goal is "fully Neon", Neon Auth + Neon Postgres is the cleanest path.

## Target data model

Use the auth identity as the root key for all private data.

Core tables:

- `user_profiles`
  - `id`
  - `auth_user_id`
  - `email`
  - `display_name`
  - `plan`
  - `created_at`
- `workspaces`
  - `id`
  - `owner_user_id`
  - `name`
  - `slug`
  - `visibility`
  - `created_at`
- `workspace_members`
  - `workspace_id`
  - `user_id`
  - `role`
- `portfolio_positions`
  - `id`
  - `workspace_id`
  - `ticker`
  - `asset_type`
  - `quantity`
  - `avg_cost_usd`
  - `currency`
  - `notes`
  - `updated_at`
- `portfolio_trade_events`
  - `id`
  - `workspace_id`
  - `ticker`
  - `side`
  - `quantity`
  - `price_usd`
  - `source`
  - `created_at`
- `watchlist_items`
  - `id`
  - `workspace_id`
  - `symbol`
  - `label`
  - `created_at`
- `command_history`
  - `id`
  - `workspace_id`
  - `command`
  - `created_at`
- `saved_views`
  - `id`
  - `workspace_id`
  - `view_key`
  - `payload`
  - `updated_at`
- `workspace_preferences`
  - `workspace_id`
  - `density`
  - `default_module`
  - `theme`
  - `updated_at`

Optional shared-data tables:

- `shared_snapshot_cache`
- `shared_analysis_cache`
- `shared_market_tape`

These stay global and power the public experience, while private portfolio overlays stay user-owned.

## Access model

Public:

- shared market snapshot
- sample recommendations
- marketing copy
- demo modules using sanitized data

Private:

- holdings
- trades
- watchlists
- command history
- saved views
- user-specific recommendation overlays

## Migration phases

### Phase 1: Foundation

1. Add Neon project and environments.
2. Create schema and migrations.
3. Add a server-side data access layer so routes stop talking directly to local JSON or memory stores.
4. Keep the UI the same for now.

### Phase 2: Authentication

1. Add Neon Auth.
2. Add protected `/app` routes.
3. Keep `/` and `/demo` public.
4. Resolve the current workspace from the signed-in user instead of a shared workspace id.

### Phase 3: Dual-write transition

1. Keep reading current local state as fallback.
2. Write new portfolio/watchlist/command updates into Neon.
3. Add backfill scripts from local state into Neon.
4. Flip reads to Neon once parity is confirmed.

### Phase 4: Redesign around login

1. Turn the current homepage into a public marketing + preview page.
2. Move the real product into `/app`.
3. Make onboarding create the first workspace automatically.
4. Replace alpha/shared language with user-owned portfolio language.

### Phase 5: Hardening

1. Add audit logs for writes.
2. Add RLS policies.
3. Add rate limits to write endpoints.
4. Add preview-branch database isolation for Vercel previews.

## Concrete code migration map

Replace these sources:

- `lib/server/private-portfolio.js`
- `lib/server/workspace-store.js`

With a shared storage layer such as:

- `lib/server/data/db.js`
- `lib/server/data/portfolios.js`
- `lib/server/data/watchlists.js`
- `lib/server/data/commands.js`
- `lib/server/data/workspaces.js`
- `lib/server/auth/session.js`

Then refactor:

- `lib/server/dashboard-service.js`
- `app/api/v1/session/route.js`
- `app/api/v1/workspaces/[workspaceId]/portfolio/route.js`
- `app/api/v1/workspaces/[workspaceId]/watchlists/route.js`
- `app/api/v1/workspaces/[workspaceId]/commands/route.js`

So they use authenticated user context and Neon-backed storage.

## Cutover rule

Do not migrate everything at once.

Safe order:

1. watchlists
2. command history
3. saved views / preferences
4. holdings
5. trade events
6. personalized recommendation overlays

That order reduces risk because the early tables are simpler and let the auth model settle before holdings become critical.

## What I would do next

Immediate next implementation steps:

1. add Neon environment variables
2. create the schema and migration files
3. add a database access layer
4. introduce auth-protected `/app`
5. move watchlists and command history first
6. migrate holdings after the auth/session path is stable

## Success criteria

You know the migration is complete when:

- the public site is useful without login
- the private workspace is only accessible after auth
- all user state survives redeploys
- each user sees only their own holdings
- preview deployments can use isolated Neon branches safely

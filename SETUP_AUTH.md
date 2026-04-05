# Setting Up Authentication (Neon Database)

Users can't log in until a real PostgreSQL database is connected. This takes about 5 minutes.

---

## What's needed

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `BLS_PRIME_AUTH_SECRET` | Random secret for signing sessions (already generated) |
| `BLS_PRIME_DEFAULT_PLAN` | Set to `founder` to grant full access |
| `BLS_PRIME_DEFAULT_PLAN_STATUS` | Set to `active` |

The `BLS_PRIME_AUTH_SECRET` in `.env.local` has already been filled in with a secure random value. The only thing missing is the real `DATABASE_URL`.

---

## Step 1 — Create a free Neon database

1. Go to **https://console.neon.tech** and sign up (free, no credit card)
2. Click **"New Project"**
3. Give it a name (e.g. `allocator-workspace`) and pick a region close to your users
4. Click **"Create project"**
5. On the next screen, copy the **Connection string** — it looks like:
   ```
   postgres://username:password@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## Step 2 — Update your local `.env.local`

Open `.env.local` and replace the empty `DATABASE_URL=` line with your real connection string:

```
DATABASE_URL=postgres://username:password@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

---

## Step 3 — Apply database migrations

With the real `DATABASE_URL` set, run this once to create all the tables:

```bash
npm run db:neon:apply
```

You should see output like:
```
Applying 0001_neon_init.sql (12 statements)
Applying 0002_auth_and_holdings.sql (4 statements)
...
Neon migrations applied.
```

---

## Step 4 — Restart the dev server

```bash
npm run dev
```

Users can now create accounts and sign in.

---

## Deploying to Vercel

If the app is deployed on Vercel, the same env vars must be set there:

1. Go to your project at **https://vercel.com** → **Settings** → **Environment Variables**
2. Add these variables (for all environments: Production, Preview, Development):

| Name | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string |
| `BLS_PRIME_AUTH_SECRET` | Copy from `.env.local` |
| `BLS_PRIME_DEFAULT_PLAN` | `founder` |
| `BLS_PRIME_DEFAULT_PLAN_STATUS` | `active` |

3. Click **Save** and then **Redeploy** the latest deployment

After the redeploy, users on the live site can sign up and log in.

---

## Running migrations against the production database

The Neon database is shared between local and Vercel — you only need to run migrations once:

```bash
# with your real DATABASE_URL already in .env.local
npm run db:neon:apply
```

---

## Troubleshooting

**"The workspace database is not reachable"**
→ `DATABASE_URL` is missing or incorrect. Double-check the connection string from the Neon console.

**"BLS_PRIME_AUTH_SECRET is required"**
→ The auth secret is not set. Copy it from `.env.local` into Vercel's environment variables.

**"An account already exists for this email. Sign in instead."**
→ That email is already registered. Use Sign in, not Create account.

**"No account exists for this email yet."**
→ First time using this email. Use Create account.

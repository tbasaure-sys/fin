import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getNeonSql, usingNeonStorage } from "../data/neon.js";
import { ensureWorkspaceRecord } from "../data/workspaces.js";
import { getServerConfig } from "../config.js";

function getAuthSecret() {
  const secret = String(
    process.env.BLS_PRIME_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "",
  ).trim();

  if (!secret) {
    throw new Error("BLS_PRIME_AUTH_SECRET is required for account auth.");
  }

  return secret;
}

function getSessionCookieName() {
  return String(process.env.BLS_PRIME_SESSION_COOKIE_NAME || "bls_prime_session").trim() || "bls_prime_session";
}

export { getSessionCookieName };

function getSessionDurationDays() {
  const days = Number(process.env.BLS_PRIME_SESSION_DAYS || 30);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

function getSignInCode() {
  return String(process.env.BLS_PRIME_SIGNIN_CODE || "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashSessionToken(token) {
  return crypto.createHmac("sha256", getAuthSecret()).update(String(token || "")).digest("hex");
}

function createWorkspaceIdForUser(userId) {
  return `workspace-${String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toLowerCase()}`;
}

function createWorkspaceNameForUser(displayName, email) {
  const base = String(displayName || email || "Workspace").trim();
  const first = base.split(/\s+/)[0] || "Workspace";
  return `${first}'s Workspace`;
}

function buildWorkspaceSlug(email, userId) {
  const prefix = normalizeEmail(email).split("@")[0]?.replace(/[^a-z0-9]+/g, "-") || "member";
  return `${prefix}-${String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase()}`;
}

async function ensureUserProfile({ email, name }) {
  const sql = getNeonSql();
  const normalizedEmail = normalizeEmail(email);
  const displayName = String(name || normalizedEmail.split("@")[0] || "Member").trim();
  const rows = await sql.query(
    `INSERT INTO bls_user_profiles (email, display_name, plan)
     VALUES ($1, $2, 'alpha')
     ON CONFLICT (email)
     DO UPDATE SET
       display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), bls_user_profiles.display_name)
     RETURNING id::text AS id, email, display_name, plan`,
    [normalizedEmail, displayName],
  );
  return rows[0];
}

async function ensurePrimaryWorkspace(user) {
  const workspaceId = createWorkspaceIdForUser(user.id);
  await ensureWorkspaceRecord({
    workspaceId,
    ownerUserId: user.id,
    name: createWorkspaceNameForUser(user.display_name, user.email),
    slug: buildWorkspaceSlug(user.email, user.id),
    visibility: "private",
  });

  return {
    id: workspaceId,
    name: createWorkspaceNameForUser(user.display_name, user.email),
    mode: "private",
  };
}

async function getSessionRecordByToken(token) {
  if (!usingNeonStorage()) return null;
  const sessionToken = String(token || "").trim();
  if (!sessionToken) return null;

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
       s.id::text AS session_id,
       s.expires_at,
       u.id::text AS user_id,
       u.email,
       u.display_name,
       u.plan,
       w.id AS workspace_id,
       w.name AS workspace_name,
       w.visibility AS workspace_visibility
     FROM bls_auth_sessions s
     JOIN bls_user_profiles u ON u.id = s.user_profile_id
     LEFT JOIN bls_workspaces w ON w.owner_user_id = u.id
     WHERE s.session_token_hash = $1
       AND s.expires_at > NOW()
     ORDER BY w.created_at ASC NULLS LAST
     LIMIT 1`,
    [hashSessionToken(sessionToken)],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    session: {
      id: row.session_id,
      expiresAt: row.expires_at,
    },
    user: {
      id: row.user_id,
      email: row.email,
      name: row.display_name || row.email,
      plan: row.plan || "alpha",
    },
    workspace: {
      id: row.workspace_id || createWorkspaceIdForUser(row.user_id),
      name: row.workspace_name || createWorkspaceNameForUser(row.display_name, row.email),
      visibility: row.workspace_visibility || "private",
    },
  };
}

export async function signInWithAccessCode({ email, name, accessCode }) {
  if (!usingNeonStorage()) {
    throw new Error("Neon storage must be enabled before account sign-in is available.");
  }

  const code = getSignInCode();
  if (!code || String(accessCode || "").trim() !== code) {
    throw new Error("Invalid access code.");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  const user = await ensureUserProfile({ email: normalizedEmail, name });
  const workspace = await ensurePrimaryWorkspace(user);
  const sql = getNeonSql();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (getSessionDurationDays() * 24 * 60 * 60 * 1000));

  await sql.query(
    `INSERT INTO bls_auth_sessions (user_profile_id, session_token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashSessionToken(rawToken), expiresAt.toISOString()],
  );

  return {
    token: rawToken,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.display_name || user.email,
      plan: user.plan || "alpha",
    },
    workspace,
  };
}

export async function clearSessionByToken(token) {
  if (!usingNeonStorage()) return;
  const sessionToken = String(token || "").trim();
  if (!sessionToken) return;
  const sql = getNeonSql();
  await sql.query(`DELETE FROM bls_auth_sessions WHERE session_token_hash = $1`, [hashSessionToken(sessionToken)]);
}

export async function getServerAuthSession() {
  if (!usingNeonStorage()) return null;
  const store = cookies();
  const token = store.get(getSessionCookieName())?.value || "";
  return getSessionRecordByToken(token);
}

export async function getRequestAuthSession(request) {
  if (!usingNeonStorage()) return null;
  const token = request.cookies.get(getSessionCookieName())?.value || "";
  return getSessionRecordByToken(token);
}

export async function requireServerAuthSession(nextPath = "/app") {
  const session = await getServerAuthSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

export async function requireApiAuthSession(request) {
  const session = await getRequestAuthSession(request);
  if (!session) {
    return new Response(
      JSON.stringify({ error: "Authentication required." }),
      {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }
  return session;
}

export async function requireApiWorkspaceSession(request, workspaceId) {
  const session = await requireApiAuthSession(request);
  if (session instanceof Response) return session;

  if (String(session.workspace.id) !== String(workspaceId)) {
    return new Response(
      JSON.stringify({ error: "This workspace is not available in the current session." }),
      {
        status: 403,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  return session;
}

export function getSessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function buildAuthenticatedSessionPayload(authSession) {
  const config = getServerConfig();
  const health = usingNeonStorage()
    ? await (await import("../backend.js")).fetchBackendHealth().catch((error) => ({ ok: false, error: String(error) }))
    : { ok: false, error: "Neon storage is not enabled." };

  return {
    user: {
      id: authSession.user.id,
      name: authSession.user.name,
      email: authSession.user.email,
      role: authSession.user.plan || "member",
    },
    workspace: {
      id: authSession.workspace.id,
      name: authSession.workspace.name,
      mode: "private",
    },
    access: {
      inviteOnly: false,
      provider: "account",
      sharedLinkEnabled: false,
      queryKey: "",
      inviteContact: config.inviteContact,
    },
    backend: health,
    storage: {
      backend: "neon",
    },
  };
}

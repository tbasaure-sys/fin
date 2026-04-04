import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  buildPlanContext,
  ensureBillingAccount,
  normalizePlanSlug,
  sessionHasPrivateWorkspaceAccess,
} from "../billing.js";
import { getNeonSql, usingNeonStorage } from "../data/neon.js";
import { ensureWorkspaceRecord } from "../data/workspaces.js";
import { getPublicAppUrl, getServerConfig } from "../config.js";

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

function getSessionCookieDomain() {
  const explicit = String(process.env.BLS_PRIME_COOKIE_DOMAIN || "").trim();
  if (explicit) return explicit;

  const appUrl = String(getPublicAppUrl() || "").trim();
  if (!appUrl) return undefined;

  try {
    const hostname = new URL(appUrl).hostname.trim().toLowerCase();
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return undefined;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return undefined;
    if (hostname.startsWith("www.")) {
      return `.${hostname.slice(4)}`;
    }
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return `.${parts.slice(-2).join(".")}`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getSessionDurationDays() {
  const days = Number(process.env.BLS_PRIME_SESSION_DAYS || 30);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

let authSchemaPromise = null;
let passwordResetSchemaPromise = null;

async function ensurePasswordAuthSchema() {
  if (!usingNeonStorage()) return;
  if (!authSchemaPromise) {
    const sql = getNeonSql();
    authSchemaPromise = sql.query(
      `ALTER TABLE bls_user_profiles
       ADD COLUMN IF NOT EXISTS password_hash TEXT`,
    );
  }
  try {
    await authSchemaPromise;
  } catch (error) {
    authSchemaPromise = null;
    throw error;
  }
}

async function ensurePasswordResetSchema() {
  if (!usingNeonStorage()) return;
  if (!passwordResetSchemaPromise) {
    const sql = getNeonSql();
    passwordResetSchemaPromise = sql.query(
      `CREATE TABLE IF NOT EXISTS bls_password_reset_tokens (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         user_profile_id UUID NOT NULL REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
         token_hash TEXT NOT NULL UNIQUE,
         expires_at TIMESTAMPTZ NOT NULL,
         consumed_at TIMESTAMPTZ,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );
  }
  try {
    await passwordResetSchemaPromise;
  } catch (error) {
    passwordResetSchemaPromise = null;
    throw error;
  }
}

function hashSessionToken(token) {
  return crypto.createHmac("sha256", getAuthSecret()).update(String(token || "")).digest("hex");
}

function hashPasswordResetToken(token) {
  return crypto.createHmac("sha256", getAuthSecret()).update(`password-reset:${String(token || "")}`).digest("hex");
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 8) {
    throw new Error("Use a password with at least 8 characters.");
  }
  return value;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  const serialized = String(storedHash || "").trim();
  if (!serialized) return false;

  const [algorithm, salt, expected] = serialized.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;

  const actual = crypto.scryptSync(String(password || ""), salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

function getPasswordResetExpiryMinutes() {
  const minutes = Number(process.env.BLS_PRIME_PASSWORD_RESET_EXPIRY_MINUTES || 60);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

function isPasswordResetDevFallbackEnabled() {
  const explicit = String(process.env.BLS_PRIME_PASSWORD_RESET_DEV_FALLBACK || "").trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
  if (explicit === "0" || explicit === "false" || explicit === "no") return false;
  return process.env.NODE_ENV !== "production";
}

function getPasswordResetSender() {
  return String(
    process.env.BLS_PRIME_EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "",
  ).trim();
}

function getPasswordResetAppUrl(requestUrl) {
  const configured = String(getPublicAppUrl() || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  try {
    return new URL(requestUrl).origin;
  } catch {
    return "";
  }
}

async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = getPasswordResetSender();
  if (!apiKey || !from || !resetUrl) {
    return { delivered: false, provider: "none" };
  }

  const appName = getServerConfig().appName;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${appName} password reset`,
      text: [
        `Hi ${name || "there"},`,
        "",
        `Use this link to reset your ${appName} password:`,
        resetUrl,
        "",
        `This link expires in ${getPasswordResetExpiryMinutes()} minutes.`,
        "If you did not request this change, you can ignore this email.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Password reset email failed: ${payload || response.statusText}`);
  }

  return { delivered: true, provider: "resend" };
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

async function getUserProfileByEmail(email) {
  await ensurePasswordAuthSchema();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
       id::text AS id,
       email,
       display_name,
       plan,
       password_hash
     FROM bls_user_profiles
     WHERE email = $1
     LIMIT 1`,
    [normalizedEmail],
  );
  return rows[0] || null;
}

async function getPasswordResetRecordByToken(token) {
  await ensurePasswordResetSchema();
  const rawToken = String(token || "").trim();
  if (!rawToken) return null;
  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
       prt.id::text AS id,
       prt.expires_at,
       prt.consumed_at,
       u.id::text AS user_id,
       u.email,
       u.display_name,
       u.plan
     FROM bls_password_reset_tokens prt
     JOIN bls_user_profiles u ON u.id = prt.user_profile_id
     WHERE prt.token_hash = $1
     LIMIT 1`,
    [hashPasswordResetToken(rawToken)],
  );
  return rows[0] || null;
}

async function createUserProfileWithPassword({ email, name, password }) {
  await ensurePasswordAuthSchema();
  const sql = getNeonSql();
  const normalizedEmail = normalizeEmail(email);
  const displayName = String(name || normalizedEmail.split("@")[0] || "Member").trim();
  const passwordHash = hashPassword(validatePassword(password));
  const rows = await sql.query(
    `INSERT INTO bls_user_profiles (email, display_name, plan, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text AS id, email, display_name, plan, password_hash`,
    [normalizedEmail, displayName, process.env.BLS_PRIME_DEFAULT_PLAN || "free", passwordHash],
  );
  return rows[0];
}

async function setUserPassword({ userId, name, password }) {
  await ensurePasswordAuthSchema();
  const sql = getNeonSql();
  const passwordHash = hashPassword(validatePassword(password));
  const rows = await sql.query(
    `UPDATE bls_user_profiles
     SET
       password_hash = $2,
       display_name = COALESCE(NULLIF($3, ''), display_name)
     WHERE id = $1
     RETURNING id::text AS id, email, display_name, plan, password_hash`,
    [userId, passwordHash, String(name || "").trim()],
  );
  return rows[0] || null;
}

async function findWorkspaceForUser(user) {
  const sql = getNeonSql();
  const ownedRows = await sql.query(
    `SELECT
       w.id,
       w.name,
       w.visibility,
       COUNT(p.ticker)::int AS holdings_count
     FROM bls_workspaces w
     LEFT JOIN bls_portfolio_positions p ON p.workspace_id = w.id
     WHERE w.owner_user_id = $1
     GROUP BY w.id, w.name, w.visibility, w.created_at
     ORDER BY COUNT(p.ticker) DESC, w.created_at ASC
     LIMIT 1`,
    [user.id],
  );
  if (ownedRows[0]) {
    return ownedRows[0];
  }

  const memberRows = await sql.query(
    `SELECT
       w.id,
       w.name,
       w.visibility,
       COUNT(p.ticker)::int AS holdings_count
     FROM bls_workspace_members m
     JOIN bls_workspaces w ON w.id = m.workspace_id
     LEFT JOIN bls_portfolio_positions p ON p.workspace_id = w.id
     WHERE m.user_id = $1
     GROUP BY w.id, w.name, w.visibility, m.role, w.created_at
     ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, COUNT(p.ticker) DESC, w.created_at ASC
     LIMIT 1`,
    [user.id],
  );
  if (memberRows[0]) {
    return memberRows[0];
  }

  return null;
}

async function findClaimableLegacyWorkspace(user) {
  const sql = getNeonSql();
  const prefix = normalizeEmail(user.email).split("@")[0]?.replace(/[^a-z0-9]+/g, "-") || "member";

  const preferredRows = await sql.query(
    `SELECT
       w.id,
       w.name,
       w.slug,
       w.visibility,
       COUNT(p.ticker)::int AS holdings_count
     FROM bls_workspaces w
     LEFT JOIN bls_portfolio_positions p ON p.workspace_id = w.id
     WHERE w.owner_user_id IS NULL
       AND (w.slug = $1 OR w.slug LIKE $2)
     GROUP BY w.id, w.name, w.slug, w.visibility, w.created_at
     HAVING COUNT(p.ticker) > 0
     ORDER BY COUNT(p.ticker) DESC, w.created_at ASC
     LIMIT 2`,
    [prefix, `${prefix}-%`],
  );

  if (preferredRows.length === 1) {
    return preferredRows[0];
  }

  const orphanRows = await sql.query(
    `SELECT
       w.id,
       w.name,
       w.slug,
       w.visibility,
       COUNT(p.ticker)::int AS holdings_count
     FROM bls_workspaces w
     LEFT JOIN bls_portfolio_positions p ON p.workspace_id = w.id
     WHERE w.owner_user_id IS NULL
     GROUP BY w.id, w.name, w.slug, w.visibility, w.created_at
     HAVING COUNT(p.ticker) > 0
     ORDER BY COUNT(p.ticker) DESC, w.created_at ASC
     LIMIT 2`,
  );

  if (orphanRows.length === 1) {
    return orphanRows[0];
  }

  return null;
}

async function ensurePrimaryWorkspace(user) {
  const existingWorkspace = await findWorkspaceForUser(user);
  if (existingWorkspace) {
    return {
      id: existingWorkspace.id,
      name: existingWorkspace.name || createWorkspaceNameForUser(user.display_name, user.email),
      mode: "private",
    };
  }

  const legacyWorkspace = await findClaimableLegacyWorkspace(user);
  const workspaceId = legacyWorkspace?.id || createWorkspaceIdForUser(user.id);
  await ensureWorkspaceRecord({
    workspaceId,
    ownerUserId: user.id,
    name: legacyWorkspace?.name || createWorkspaceNameForUser(user.display_name, user.email),
    slug: legacyWorkspace?.slug || buildWorkspaceSlug(user.email, user.id),
    visibility: legacyWorkspace?.visibility || "private",
  });

  return {
    id: workspaceId,
    name: legacyWorkspace?.name || createWorkspaceNameForUser(user.display_name, user.email),
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
       u.plan
     FROM bls_auth_sessions s
     JOIN bls_user_profiles u ON u.id = s.user_profile_id
     WHERE s.session_token_hash = $1
       AND s.expires_at > NOW()
     LIMIT 1`,
    [hashSessionToken(sessionToken)],
  );

  const row = rows[0];
  if (!row) return null;
  await ensureBillingAccount({ userId: row.user_id, email: row.email, plan: row.plan || process.env.BLS_PRIME_DEFAULT_PLAN || "founder" });
  const billing = await buildPlanContext(row.plan || "free", row.user_id);

  const ensuredWorkspace = await ensurePrimaryWorkspace({
    id: row.user_id,
    email: row.email,
    display_name: row.display_name,
  });

  return {
    session: {
      id: row.session_id,
      expiresAt: row.expires_at,
    },
    user: {
      id: row.user_id,
      email: row.email,
      name: row.display_name || row.email,
      plan: billing.id || normalizePlanSlug(row.plan || "free"),
      billing,
    },
    workspace: {
      id: ensuredWorkspace?.id || createWorkspaceIdForUser(row.user_id),
      name: ensuredWorkspace?.name || createWorkspaceNameForUser(row.display_name, row.email),
      visibility: "private",
    },
  };
}

async function createSessionForUser(user) {
  await ensureBillingAccount({ userId: user.id, email: user.email, plan: user.plan || "free" });
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
      plan: normalizePlanSlug(user.plan || "free"),
    },
    workspace,
  };
}

export async function requestPasswordReset({ email, requestUrl = "" }) {
  if (!usingNeonStorage()) {
    throw new Error("Neon storage must be enabled before password reset is available.");
  }

  await ensurePasswordAuthSchema();
  await ensurePasswordResetSchema();

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  const user = await getUserProfileByEmail(normalizedEmail);
  if (!user || !user.password_hash) {
    return { ok: true, delivery: "silent" };
  }

  const sql = getNeonSql();
  await sql.query(
    `DELETE FROM bls_password_reset_tokens
     WHERE user_profile_id = $1
       OR expires_at <= NOW()
       OR consumed_at IS NOT NULL`,
    [user.id],
  );

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (getPasswordResetExpiryMinutes() * 60 * 1000));
  await sql.query(
    `INSERT INTO bls_password_reset_tokens (user_profile_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashPasswordResetToken(rawToken), expiresAt.toISOString()],
  );

  const baseUrl = getPasswordResetAppUrl(requestUrl);
  const resetUrl = baseUrl ? `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}` : "";

  try {
    const delivery = await sendPasswordResetEmail({
      email: user.email,
      name: user.display_name || user.email,
      resetUrl,
    });
    if (delivery.delivered) {
      return { ok: true, delivery: "email" };
    }
  } catch (error) {
    console.error("[auth] password reset email failed", error);
  }

  if (isPasswordResetDevFallbackEnabled() && resetUrl) {
    return { ok: true, delivery: "dev-link", resetUrl };
  }

  console.warn("[auth] password reset requested but no email delivery is configured", {
    email: user.email,
    resetUrl,
  });
  return { ok: true, delivery: "queued" };
}

export async function completePasswordReset({ token, password }) {
  if (!usingNeonStorage()) {
    throw new Error("Neon storage must be enabled before password reset is available.");
  }

  await ensurePasswordAuthSchema();
  await ensurePasswordResetSchema();

  const rawToken = String(token || "").trim();
  if (!rawToken) {
    throw new Error("Missing reset token.");
  }

  validatePassword(password);
  const resetRecord = await getPasswordResetRecordByToken(rawToken);
  if (!resetRecord) {
    throw new Error("This reset link is invalid.");
  }
  if (resetRecord.consumed_at) {
    throw new Error("This reset link has already been used.");
  }
  const expiresAt = Date.parse(resetRecord.expires_at || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("This reset link has expired.");
  }

  const sql = getNeonSql();
  const passwordHash = hashPassword(password);
  await sql.query("BEGIN");
  try {
    await sql.query(
      `UPDATE bls_user_profiles
       SET password_hash = $2
       WHERE id = $1`,
      [resetRecord.user_id, passwordHash],
    );
    await sql.query(
      `UPDATE bls_password_reset_tokens
       SET consumed_at = NOW()
       WHERE user_profile_id = $1
         AND consumed_at IS NULL`,
      [resetRecord.user_id],
    );
    await sql.query(
      `DELETE FROM bls_auth_sessions
       WHERE user_profile_id = $1`,
      [resetRecord.user_id],
    );
    await sql.query("COMMIT");
  } catch (error) {
    await sql.query("ROLLBACK");
    throw error;
  }

  return createSessionForUser({
    id: resetRecord.user_id,
    email: resetRecord.email,
    display_name: resetRecord.display_name,
    plan: resetRecord.plan,
  });
}

export async function signInWithPassword({ email, name, password, intent = "signin" }) {
  if (!usingNeonStorage()) {
    throw new Error("Neon storage must be enabled before account sign-in is available.");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  if (!String(password || "").trim()) {
    throw new Error("Enter your password.");
  }

  const mode = String(intent || "signin").toLowerCase() === "signup" ? "signup" : "signin";
  const existingUser = await getUserProfileByEmail(normalizedEmail);

  if (mode === "signup") {
    if (!existingUser) {
      const newUser = await createUserProfileWithPassword({
        email: normalizedEmail,
        name,
        password,
      });
      return createSessionForUser(newUser);
    }

    if (existingUser.password_hash) {
      throw new Error("An account already exists for this email. Sign in instead.");
    }

    const upgradedUser = await setUserPassword({
      userId: existingUser.id,
      name,
      password,
    });
    return createSessionForUser(upgradedUser || existingUser);
  }

  if (!existingUser) {
    throw new Error("No account exists for this email yet. Create one first.");
  }

  if (!existingUser.password_hash) {
    throw new Error("This account still needs a password. Use Create account to finish setup.");
  }

  if (!verifyPassword(password, existingUser.password_hash)) {
    throw new Error("Incorrect password.");
  }

  return createSessionForUser(existingUser);
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

export async function requireServerPaidWorkspaceSession(nextPath = "/app") {
  const session = await requireServerAuthSession(nextPath);
  if (!sessionHasPrivateWorkspaceAccess(session)) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}&error=upgrade`);
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

export async function requireApiPaidWorkspaceSession(request, workspaceId) {
  const session = await requireApiWorkspaceSession(request, workspaceId);
  if (session instanceof Response) return session;

  if (!sessionHasPrivateWorkspaceAccess(session)) {
    return new Response(
      JSON.stringify({
        error: "This workspace requires a paid plan.",
        code: "plan_upgrade_required",
        plan: session.user.billing || null,
      }),
      {
        status: 402,
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
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
  const domain = getSessionCookieDomain();
  if (domain) {
    options.domain = domain;
  }
  return options;
}

export async function buildAuthenticatedSessionPayload(authSession) {
  const config = getServerConfig();
  const health = usingNeonStorage()
    ? await (await import("../backend.js")).fetchBackendHealth().catch((error) => ({ ok: false, error: String(error) }))
    : { ok: false, error: "Neon storage is not enabled." };
  const normalizedPlan = normalizePlanSlug(authSession.user.plan || "free");
  const plan = authSession.user.billing || await buildPlanContext(normalizedPlan, authSession.user.id);

  return {
    user: {
      id: authSession.user.id,
      name: authSession.user.name,
      email: authSession.user.email,
      role: normalizedPlan,
      plan: normalizedPlan,
      billing: plan,
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
      privateWorkspace: plan.access.privateWorkspace,
      upgradeRequired: plan.access.upgradeRequired,
    },
    backend: health,
    storage: {
      backend: "neon",
    },
    plan,
  };
}

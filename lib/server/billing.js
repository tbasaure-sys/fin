import crypto from "crypto";

import { getNeonSql, usingNeonStorage } from "./data/neon.js";

const PLAN_CATALOG = {
  free: {
    id: "free",
    label: "Free",
    rank: 0,
    isPaid: false,
    capabilities: {
      privateWorkspace: false,
      liveRefresh: false,
      stagedActions: false,
      naturalLanguageTrades: false,
      mandateControls: false,
      activityLog: true,
    },
    limits: {
      holdings: 10,
      historyWindowDays: 30,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    rank: 1,
    isPaid: true,
    capabilities: {
      privateWorkspace: true,
      liveRefresh: true,
      stagedActions: true,
      naturalLanguageTrades: true,
      mandateControls: true,
      activityLog: true,
    },
    limits: {
      holdings: null,
      historyWindowDays: 365,
    },
  },
  founder: {
    id: "founder",
    label: "Founder",
    rank: 2,
    isPaid: true,
    capabilities: {
      privateWorkspace: true,
      liveRefresh: true,
      stagedActions: true,
      naturalLanguageTrades: true,
      mandateControls: true,
      activityLog: true,
      prioritySupport: true,
    },
    limits: {
      holdings: null,
      historyWindowDays: null,
    },
  },
};

const LEGACY_PLAN_MAP = {
  alpha: "founder",
  member: "pro",
  visitor: "free",
};

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

function normalizePlanId(value, fallback = "free") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  return PLAN_CATALOG[raw] ? raw : (LEGACY_PLAN_MAP[raw] || fallback);
}

export function normalizePlanSlug(value, fallback = "free") {
  return normalizePlanId(value, fallback);
}

function normalizeStatus(value, fallback = "active") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["active", "trialing", "past_due", "canceled", "inactive"].includes(raw)) return raw;
  return fallback;
}

function getDefaultPlanId() {
  return normalizePlanId(process.env.BLS_PRIME_DEFAULT_PLAN || "free", "free");
}

function getDefaultPlanStatus() {
  return normalizeStatus(process.env.BLS_PRIME_DEFAULT_PLAN_STATUS || "active", "active");
}

function getTrialDays() {
  const value = Number(process.env.BLS_PRIME_TRIAL_DAYS || 14);
  return Number.isFinite(value) && value > 0 ? value : 14;
}

function buildPlanSnapshot({
  planId,
  status,
  source,
  trialEndsAt = null,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = false,
  provider = "manual",
}) {
  const normalizedPlanId = normalizePlanId(planId, getDefaultPlanId());
  const definition = PLAN_CATALOG[normalizedPlanId];
  const normalizedStatus = normalizeStatus(status, getDefaultPlanStatus());
  const isPaid = definition.isPaid && PAID_STATUSES.has(normalizedStatus);
  const privateWorkspace = definition.capabilities.privateWorkspace && PAID_STATUSES.has(normalizedStatus);

  return {
    id: definition.id,
    label: definition.label,
    status: normalizedStatus,
    source: source || "default",
    provider,
    isPaid,
    isTrialing: normalizedStatus === "trialing",
    trialEndsAt,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
    capabilities: { ...definition.capabilities },
    limits: { ...definition.limits },
    access: {
      privateWorkspace,
      upgradeRequired: !privateWorkspace,
      paywallHeadline: privateWorkspace ? null : "Upgrade to Pro to unlock the private workspace",
      paywallMessage: privateWorkspace
        ? null
        : "Private holdings, staged actions, live refresh, and natural-language trade updates are part of the paid workspace.",
    },
  };
}

export function sessionHasPrivateWorkspaceAccess(session) {
  return Boolean(session?.user?.billing?.access?.privateWorkspace);
}

async function getUserPlanRow(userId) {
  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
       u.id::text AS user_id,
       u.plan AS legacy_plan,
       s.plan_key,
       s.status,
       s.provider,
       s.trial_ends_at,
       s.current_period_end,
       s.cancel_at_period_end
     FROM bls_user_profiles u
     LEFT JOIN bls_billing_subscriptions s ON s.user_profile_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

export async function ensureUserBillingState({ userId, legacyPlan = null }) {
  if (!usingNeonStorage()) {
    return buildPlanSnapshot({
      planId: normalizePlanId(legacyPlan, getDefaultPlanId()),
      status: getDefaultPlanStatus(),
      source: "memory",
      provider: "manual",
    });
  }

  const sql = getNeonSql();
  const row = await getUserPlanRow(userId);
  if (!row?.plan_key) {
    const fallbackPlan = normalizePlanId(legacyPlan || row?.legacy_plan, getDefaultPlanId());
    const fallbackStatus = getDefaultPlanStatus();
    const trialEndsAt = fallbackStatus === "trialing"
      ? new Date(Date.now() + (getTrialDays() * 24 * 60 * 60 * 1000)).toISOString()
      : null;

    await sql.query(
      `INSERT INTO bls_billing_subscriptions (
         user_profile_id,
         plan_key,
         status,
         provider,
         trial_ends_at,
         metadata
       )
       VALUES ($1, $2, $3, 'manual', $4, $5::jsonb)
       ON CONFLICT (user_profile_id)
       DO NOTHING`,
      [
        userId,
        fallbackPlan,
        fallbackStatus,
        trialEndsAt,
        JSON.stringify({ seeded_from: legacyPlan || row?.legacy_plan || "default" }),
      ],
    );
  }

  return getUserPlanSnapshot({ userId, legacyPlan });
}

export async function ensureBillingAccount({ userId, plan = null }) {
  return ensureUserBillingState({ userId, legacyPlan: plan });
}

export async function getUserPlanSnapshot({ userId, legacyPlan = null }) {
  if (!usingNeonStorage()) {
    return buildPlanSnapshot({
      planId: normalizePlanId(legacyPlan, getDefaultPlanId()),
      status: getDefaultPlanStatus(),
      source: "memory",
      provider: "manual",
    });
  }

  const row = await getUserPlanRow(userId);
  if (row?.plan_key) {
    return buildPlanSnapshot({
      planId: row.plan_key,
      status: row.status,
      source: "subscription",
      provider: row.provider || "manual",
      trialEndsAt: row.trial_ends_at || null,
      currentPeriodEnd: row.current_period_end || null,
      cancelAtPeriodEnd: row.cancel_at_period_end,
    });
  }

  return buildPlanSnapshot({
    planId: normalizePlanId(legacyPlan || row?.legacy_plan, getDefaultPlanId()),
    status: getDefaultPlanStatus(),
    source: "profile_legacy",
    provider: "manual",
  });
}

export async function buildPlanContext(planSlug, userId = null) {
  if (userId) {
    return getUserPlanSnapshot({ userId, legacyPlan: planSlug });
  }

  return buildPlanSnapshot({
    planId: normalizePlanId(planSlug, getDefaultPlanId()),
    status: getDefaultPlanStatus(),
    source: "anonymous",
    provider: "manual",
  });
}

export async function getWorkspacePlanSnapshot(workspaceId) {
  if (!usingNeonStorage()) {
    return buildPlanSnapshot({
      planId: getDefaultPlanId(),
      status: getDefaultPlanStatus(),
      source: "memory",
      provider: "manual",
    });
  }

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT
       w.owner_user_id::text AS owner_user_id,
       u.plan AS legacy_plan,
       s.plan_key,
       s.status,
       s.provider,
       s.trial_ends_at,
       s.current_period_end,
       s.cancel_at_period_end
     FROM bls_workspaces w
     LEFT JOIN bls_user_profiles u ON u.id = w.owner_user_id
     LEFT JOIN bls_billing_subscriptions s ON s.user_profile_id = u.id
     WHERE w.id = $1
     LIMIT 1`,
    [workspaceId],
  );

  const row = rows[0];
  if (row?.plan_key) {
    return buildPlanSnapshot({
      planId: row.plan_key,
      status: row.status,
      source: "subscription",
      provider: row.provider || "manual",
      trialEndsAt: row.trial_ends_at || null,
      currentPeriodEnd: row.current_period_end || null,
      cancelAtPeriodEnd: row.cancel_at_period_end,
    });
  }

  return buildPlanSnapshot({
    planId: normalizePlanId(row?.legacy_plan, getDefaultPlanId()),
    status: getDefaultPlanStatus(),
    source: row?.legacy_plan ? "profile_legacy" : "workspace_default",
    provider: "manual",
  });
}

export async function upsertUserSubscription({
  userId,
  planId,
  status,
  provider = "manual",
  trialEndsAt = null,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = false,
  providerCustomerId = null,
  providerSubscriptionId = null,
  metadata = {},
}) {
  const sql = getNeonSql();
  await sql.query(
    `INSERT INTO bls_billing_subscriptions (
       user_profile_id,
       provider,
       provider_customer_id,
       provider_subscription_id,
       plan_key,
       status,
       trial_ends_at,
       current_period_end,
       cancel_at_period_end,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (user_profile_id)
     DO UPDATE SET
       provider = EXCLUDED.provider,
       provider_customer_id = EXCLUDED.provider_customer_id,
       provider_subscription_id = EXCLUDED.provider_subscription_id,
       plan_key = EXCLUDED.plan_key,
       status = EXCLUDED.status,
       trial_ends_at = EXCLUDED.trial_ends_at,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      userId,
      provider,
      providerCustomerId,
      providerSubscriptionId,
      normalizePlanId(planId, getDefaultPlanId()),
      normalizeStatus(status, getDefaultPlanStatus()),
      trialEndsAt,
      currentPeriodEnd,
      Boolean(cancelAtPeriodEnd),
      JSON.stringify(metadata || {}),
    ],
  );

  return getUserPlanSnapshot({ userId });
}

export async function createCheckoutLink({ user, plan }) {
  const normalizedPlan = normalizePlanId(plan, "pro");
  const fallbackBaseUrl = process.env.BLS_PRIME_CHECKOUT_URL || process.env.BLS_PRIME_UPGRADE_URL || "/login";
  const polarToken = String(process.env.POLAR_ACCESS_TOKEN || "").trim();
  const polarProductId =
    normalizedPlan === "founder"
      ? String(process.env.POLAR_PRODUCT_ID_FOUNDER || "").trim()
      : String(process.env.POLAR_PRODUCT_ID_PRO || "").trim();
  const appUrl = String(process.env.BLS_PRIME_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://blsprime.com").trim();

  if (!polarToken || !polarProductId) {
    const url = new URL(fallbackBaseUrl, "https://blsprime.com");
    url.searchParams.set("plan", normalizedPlan);
    if (user?.email) url.searchParams.set("email", user.email);
    if (user?.id) url.searchParams.set("user_id", user.id);
    return fallbackBaseUrl.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
  }

  const response = await fetch("https://api.polar.sh/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${polarToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products: [polarProductId],
      success_url: `${appUrl.replace(/\/$/, "")}/app?checkout=success&session_id={CHECKOUT_ID}`,
      external_customer_id: user?.id ? String(user.id) : undefined,
      customer_email: user?.email || undefined,
      metadata: {
        plan: normalizedPlan,
        userId: user?.id || "",
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.detail || payload?.error || "Polar checkout could not be created.");
  }

  return payload.url;
}

export async function createBillingPortalLink({ userId }) {
  const baseUrl = process.env.BLS_PRIME_BILLING_PORTAL_URL || process.env.BLS_PRIME_UPGRADE_URL || "/app";
  const polarToken = String(process.env.POLAR_ACCESS_TOKEN || "").trim();
  const appUrl = String(process.env.BLS_PRIME_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://blsprime.com").trim();

  if (!polarToken || !userId) {
    const url = new URL(baseUrl, "https://blsprime.com");
    if (userId) url.searchParams.set("user_id", userId);
    return baseUrl.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
  }

  const response = await fetch("https://api.polar.sh/v1/customer-sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${polarToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_customer_id: String(userId),
      return_url: `${appUrl.replace(/\/$/, "")}/app`,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.customer_portal_url) {
    throw new Error(payload?.detail || payload?.error || "Polar billing portal is unavailable.");
  }

  return payload.customer_portal_url;
}

export async function syncCheckoutSessionForUser({ userId, sessionId }) {
  if (!userId || !sessionId) return null;
  const polarToken = String(process.env.POLAR_ACCESS_TOKEN || "").trim();
  if (!polarToken) return getUserPlanSnapshot({ userId });

  const response = await fetch(`https://api.polar.sh/v1/checkouts/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${polarToken}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return getUserPlanSnapshot({ userId });
  }

  const normalizedPlan = normalizePlanId(payload?.metadata?.plan || "pro", "pro");
  const checkoutStatus = String(payload?.status || "").toLowerCase();
  const mappedStatus = ["succeeded", "completed", "confirmed", "paid"].includes(checkoutStatus)
    ? "active"
    : checkoutStatus === "open"
      ? "trialing"
      : getDefaultPlanStatus();

  await upsertUserSubscription({
    userId,
    planId: normalizedPlan,
    status: mappedStatus,
    provider: "polar",
    providerCustomerId: payload?.customer_id || null,
    providerSubscriptionId: payload?.subscription_id || null,
    metadata: {
      checkout_id: payload?.id || sessionId,
      checkout_status: checkoutStatus || null,
    },
  });

  return getUserPlanSnapshot({ userId });
}

function getPolarWebhookSecret() {
  return String(process.env.POLAR_WEBHOOK_SECRET || "").trim();
}

function timingSafeEqualBase64(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "base64");
  const rightBuffer = Buffer.from(String(right || ""), "base64");
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPolarWebhookSignature({ payload, headers }) {
  const secret = getPolarWebhookSecret();
  if (!secret) {
    return { ok: false, reason: "POLAR_WEBHOOK_SECRET is not configured." };
  }

  const webhookId = headers.get("webhook-id") || "";
  const webhookTimestamp = headers.get("webhook-timestamp") || "";
  const signatureHeader = headers.get("webhook-signature") || "";

  if (!webhookId || !webhookTimestamp || !signatureHeader) {
    return { ok: false, reason: "Missing Polar webhook signature headers." };
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedContent)
    .digest("base64");

  const signatures = signatureHeader
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.startsWith("v1,") ? entry.slice(3) : entry);

  const ok = signatures.some((candidate) => timingSafeEqualBase64(candidate, expectedSignature));
  return ok
    ? { ok: true }
    : { ok: false, reason: "Polar webhook signature verification failed." };
}

function inferPlanFromPolarPayload(payload) {
  const metadataPlan = normalizePlanId(
    payload?.data?.metadata?.plan ||
    payload?.metadata?.plan ||
    payload?.data?.product?.metadata?.plan ||
    payload?.data?.subscription?.metadata?.plan,
    "",
  );
  if (metadataPlan) return metadataPlan;

  const productId = String(
    payload?.data?.product_id ||
    payload?.data?.product?.id ||
    payload?.data?.subscription?.product_id ||
    "",
  ).trim();
  if (productId && productId === String(process.env.POLAR_PRODUCT_ID_FOUNDER || "").trim()) return "founder";
  if (productId && productId === String(process.env.POLAR_PRODUCT_ID_PRO || "").trim()) return "pro";
  return "pro";
}

function inferUserIdFromPolarPayload(payload) {
  return String(
    payload?.data?.external_customer_id ||
    payload?.data?.customer?.external_id ||
    payload?.data?.metadata?.userId ||
    payload?.metadata?.userId ||
    "",
  ).trim() || null;
}

function inferSubscriptionStatus(payload) {
  const raw = String(
    payload?.data?.status ||
    payload?.data?.subscription?.status ||
    payload?.data?.state ||
    payload?.type ||
    "",
  ).toLowerCase();

  if (raw.includes("cancel")) return "canceled";
  if (raw.includes("revoke")) return "inactive";
  if (raw.includes("trial")) return "trialing";
  if (raw.includes("active") || raw.includes("paid") || raw.includes("succeed")) return "active";
  return getDefaultPlanStatus();
}

export async function handlePolarWebhookEvent(payload) {
  const userId = inferUserIdFromPolarPayload(payload);
  if (!userId) {
    return { ok: true, ignored: true, reason: "No external customer id/user id found in Polar payload." };
  }

  const planId = inferPlanFromPolarPayload(payload);
  const status = inferSubscriptionStatus(payload);
  const data = payload?.data || {};

  await upsertUserSubscription({
    userId,
    planId,
    status,
    provider: "polar",
    providerCustomerId: data?.customer_id || data?.customer?.id || null,
    providerSubscriptionId: data?.subscription_id || data?.subscription?.id || data?.id || null,
    currentPeriodEnd: data?.current_period_end || data?.subscription?.current_period_end || null,
    cancelAtPeriodEnd: Boolean(data?.cancel_at_period_end || data?.subscription?.cancel_at_period_end),
    metadata: {
      webhook_type: payload?.type || null,
      raw_status: data?.status || data?.subscription?.status || null,
    },
  });

  return { ok: true, ignored: false, userId, planId, status };
}

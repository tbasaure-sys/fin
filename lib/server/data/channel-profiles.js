import "server-only";

import { CHANNEL_PROFILE_VERSION, canPersistChannelProfile } from "../../channels/contract.js";
import { CHANNEL_QUESTIONS, evaluateChannelProfile } from "../../channels/scoring.js";
import { getNeonSql, usingNeonStorage } from "./neon.js";
import { ensureWorkspaceRecord } from "./workspaces.js";

const memoryProfiles = globalThis.__BLS_CHANNEL_PROFILES__ || new Map();
globalThis.__BLS_CHANNEL_PROFILES__ = memoryProfiles;

let schemaPromise = null;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeProfile(workspaceId, profile = {}) {
  return {
    workspaceId: String(workspaceId || ""),
    schemaVersion: String(profile.schemaVersion || "channel_profile_v1"),
    answers: profile.answers && typeof profile.answers === "object" ? clone(profile.answers) : {},
    result: profile.result && typeof profile.result === "object" ? clone(profile.result) : {},
    updatedAt: profile.updatedAt || new Date().toISOString(),
  };
}

function rejectChannelProfile(message, code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function canonicalPersistableProfile(workspaceId, profile) {
  const rawAnswers = profile && typeof profile === "object" && !Array.isArray(profile)
    ? profile.answers
    : null;
  const result = evaluateChannelProfile(rawAnswers);
  if (!canPersistChannelProfile(result)) {
    rejectChannelProfile(
      "Sensitive or unverified channel profiles cannot be stored.",
      "channel_profile_not_persistable",
    );
  }

  const complete = CHANNEL_QUESTIONS.every((question) => {
    const value = result.answers[question.id];
    return question.type === "multi" ? Array.isArray(value) && value.length > 0 : Boolean(value);
  });
  if (!complete) {
    rejectChannelProfile(
      "Complete the channel questionnaire before storing a profile.",
      "channel_profile_incomplete",
    );
  }

  return normalizeProfile(workspaceId, {
    schemaVersion: result.version,
    answers: result.answers,
    result,
  });
}

function canonicalStoredProfile(workspaceId, profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  if (profile.schemaVersion !== CHANNEL_PROFILE_VERSION) return null;
  if (profile.answers?.version !== CHANNEL_PROFILE_VERSION) return null;

  try {
    const canonical = canonicalPersistableProfile(workspaceId, profile);
    return {
      ...canonical,
      updatedAt: profile.updatedAt || canonical.updatedAt,
    };
  } catch (error) {
    if (["channel_profile_not_persistable", "channel_profile_incomplete"].includes(error?.code)) {
      return null;
    }
    throw error;
  }
}

async function ensureChannelProfileSchema(workspaceId) {
  const sql = getNeonSql();
  await ensureWorkspaceRecord({ workspaceId, visibility: "private" });

  if (!schemaPromise) {
    schemaPromise = sql.query(`
      CREATE TABLE IF NOT EXISTS bls_channel_profiles (
        workspace_id TEXT PRIMARY KEY REFERENCES bls_workspaces(id) ON DELETE CASCADE,
        schema_version TEXT NOT NULL DEFAULT 'channel_profile_v1',
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,
        result JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
  return sql;
}

function mapRow(workspaceId, row) {
  if (!row) return null;
  return normalizeProfile(workspaceId, {
    schemaVersion: String(row.schema_version || "channel_profile_v1"),
    answers: row.answers || {},
    result: row.result || {},
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  });
}

export async function getWorkspaceChannelProfile(workspaceId, options = {}) {
  const id = String(workspaceId || "").trim();
  if (!id) return null;
  const injectedSql = options?.sql && typeof options.sql.query === "function" ? options.sql : null;

  if (!injectedSql && !usingNeonStorage()) {
    const stored = clone(memoryProfiles.get(id) || null);
    if (!stored) return null;
    const canonical = canonicalStoredProfile(id, stored);
    if (!canonical) memoryProfiles.delete(id);
    return canonical;
  }

  const sql = injectedSql || await ensureChannelProfileSchema(id);
  const rows = await sql.query(
    `SELECT schema_version, answers, result, updated_at
     FROM bls_channel_profiles
     WHERE workspace_id = $1
     LIMIT 1`,
    [id],
  );
  const stored = mapRow(id, rows[0]);
  if (!stored) return null;
  const canonical = canonicalStoredProfile(id, stored);
  if (!canonical) {
    await sql.query(
      `DELETE FROM bls_channel_profiles
       WHERE workspace_id = $1`,
      [id],
    );
  }
  return canonical;
}

export async function saveWorkspaceChannelProfile(workspaceId, profile) {
  const id = String(workspaceId || "").trim();
  if (!id) throw new Error("workspaceId is required");
  const entry = canonicalPersistableProfile(id, profile);

  if (!usingNeonStorage()) {
    memoryProfiles.set(id, entry);
    return clone(entry);
  }

  const sql = await ensureChannelProfileSchema(id);
  const rows = await sql.query(
    `INSERT INTO bls_channel_profiles (workspace_id, schema_version, answers, result)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     ON CONFLICT (workspace_id)
     DO UPDATE SET
       schema_version = EXCLUDED.schema_version,
       answers = EXCLUDED.answers,
       result = EXCLUDED.result,
       updated_at = NOW()
     RETURNING schema_version, answers, result, updated_at`,
    [id, entry.schemaVersion, JSON.stringify(entry.answers), JSON.stringify(entry.result)],
  );
  return mapRow(id, rows[0]);
}

export async function deleteWorkspaceChannelProfile(workspaceId) {
  const id = String(workspaceId || "").trim();
  if (!id) return false;

  if (!usingNeonStorage()) {
    return memoryProfiles.delete(id);
  }

  const sql = await ensureChannelProfileSchema(id);
  const rows = await sql.query(
    `DELETE FROM bls_channel_profiles
     WHERE workspace_id = $1
     RETURNING workspace_id`,
    [id],
  );
  return Boolean(rows[0]);
}

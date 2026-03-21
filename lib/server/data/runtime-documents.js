import "server-only";

import { getNeonSql, usingNeonStorage } from "./neon.js";

export async function getRuntimeDocument(documentKey) {
  if (!usingNeonStorage()) return null;

  const key = String(documentKey || "").trim();
  if (!key) return null;

  const sql = getNeonSql();
  const rows = await sql.query(
    `SELECT document_key, payload, metadata, updated_at
     FROM bls_runtime_documents
     WHERE document_key = $1
     LIMIT 1`,
    [key],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    key: row.document_key,
    updatedAt: row.updated_at || null,
    payload: row.payload || null,
    metadata: row.metadata || {},
  };
}

export async function getRuntimeDocumentPayload(documentKey) {
  const document = await getRuntimeDocument(documentKey);
  return document?.payload || null;
}

export async function upsertRuntimeDocument(documentKey, payload, options = {}) {
  if (!usingNeonStorage()) return null;

  const key = String(documentKey || "").trim();
  if (!key) return null;

  const sql = getNeonSql();
  const metadata = options.metadata || {};

  const rows = await sql.query(
    `INSERT INTO bls_runtime_documents (
      document_key,
      payload,
      metadata
    )
    VALUES ($1, $2::jsonb, $3::jsonb)
    ON CONFLICT (document_key)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING document_key, payload, metadata, updated_at`,
    [
      key,
      JSON.stringify(payload || {}),
      JSON.stringify(metadata),
    ],
  );

  const row = rows[0];
  return row
    ? {
        key: row.document_key,
        updatedAt: row.updated_at || null,
        payload: row.payload || null,
        metadata: row.metadata || {},
      }
    : null;
}

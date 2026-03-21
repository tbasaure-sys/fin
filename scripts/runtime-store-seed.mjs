import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required to seed the runtime store.");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function readJsonIfExists(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  try {
    const text = await fs.readFile(absolutePath, "utf8");
    return JSON.parse(text.replaceAll("NaN", "null"));
  } catch {
    return null;
  }
}

async function upsertRuntimeDocument(documentKey, payload, metadata = {}) {
  if (!payload) return false;
  const source = String(metadata.source || "seed").trim() || "seed";
  const generatedAt = metadata.generated_at || payload.generated_at || null;
  await sql.query(
    `INSERT INTO bls_runtime_documents (
      document_key,
      source,
      generated_at,
      payload,
      metadata
    )
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
    ON CONFLICT (document_key)
    DO UPDATE SET
      source = EXCLUDED.source,
      generated_at = EXCLUDED.generated_at,
      payload = EXCLUDED.payload,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()`,
    [
      documentKey,
      source,
      generatedAt,
      JSON.stringify(payload),
      JSON.stringify(metadata),
    ],
  );
  return true;
}

async function upsertRuntimeSnapshot(snapshotKey, payload, metadata = {}) {
  if (!payload) return false;
  await sql.query(
    `INSERT INTO bls_runtime_snapshots (
      snapshot_key,
      source,
      status,
      generated_at,
      as_of_date,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (snapshot_key)
    DO UPDATE SET
      source = EXCLUDED.source,
      status = EXCLUDED.status,
      generated_at = EXCLUDED.generated_at,
      as_of_date = EXCLUDED.as_of_date,
      payload = EXCLUDED.payload,
      updated_at = NOW()`,
    [
      snapshotKey,
      String(metadata.source || "seed").trim() || "seed",
      String(metadata.status || "ready").trim() || "ready",
      payload.generated_at || null,
      payload.as_of_date || null,
      JSON.stringify(payload),
    ],
  );
  return true;
}

const dashboardSnapshot = await readJsonIfExists("output/dashboard/latest/dashboard_snapshot.json")
  || await readJsonIfExists("artifacts/dashboard/latest/dashboard_snapshot.json");
const currentAllocatorDecision = await readJsonIfExists("output/production/latest/current_allocator_decision.json");

const seeded = [];

if (await upsertRuntimeDocument("dashboard_snapshot", dashboardSnapshot, { source: "seed:dashboard_snapshot" })) {
  seeded.push("dashboard_snapshot");
}
if (await upsertRuntimeSnapshot("dashboard/latest", dashboardSnapshot, { source: "seed:dashboard_snapshot", status: "ready" })) {
  seeded.push("dashboard/latest");
}
if (await upsertRuntimeDocument("current_allocator_decision", currentAllocatorDecision, { source: "seed:current_allocator_decision" })) {
  seeded.push("current_allocator_decision");
}

if (!seeded.length) {
  console.error("No local runtime documents were found to seed.");
  process.exit(1);
}

console.log(`Seeded runtime store entries: ${seeded.join(", ")}`);

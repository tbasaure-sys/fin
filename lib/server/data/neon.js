import "server-only";

import { neon } from "@neondatabase/serverless";

let sqlClient = null;

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

export function hasNeonDatabase() {
  return Boolean(getDatabaseUrl());
}

export function getStorageBackend() {
  const explicit = String(process.env.BLS_PRIME_STORAGE_BACKEND || "auto").trim().toLowerCase();
  if (explicit === "memory") return "memory";
  if (explicit === "neon") return "neon";
  return hasNeonDatabase() ? "neon" : "memory";
}

export function usingNeonStorage() {
  return getStorageBackend() === "neon";
}

export function getStorageBackendLabel() {
  return usingNeonStorage() ? "neon" : "memory";
}

export function getNeonSql() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required when BLS_PRIME_STORAGE_BACKEND is set to neon.");
  }

  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }

  return sqlClient;
}

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
  console.error("DATABASE_URL is required to apply Neon migrations.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const migrationsDir = path.join(rootDir, "db", "migrations");

function splitStatements(text) {
  return text
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const files = (await fs.readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const source = await fs.readFile(filePath, "utf8");
  const statements = splitStatements(source);

  console.log(`Applying ${file} (${statements.length} statements)`);
  for (const statement of statements) {
    await sql.query(statement);
  }
}

console.log("Neon migrations applied.");

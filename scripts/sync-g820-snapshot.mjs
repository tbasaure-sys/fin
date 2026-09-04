import { cp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const targetRoot = path.join(process.cwd(), "public", "data", "g820");
const defaultSourceRoot = path.join(
  os.homedir(),
  "Documents",
  "Codex",
  "2026-08-27",
  "como-se-veria-un-screener-de",
  "public",
  "data",
  "g820",
);
const sourceRoot = path.resolve(process.env.TRAMA_G820_PUBLIC_ROOT || defaultSourceRoot);
const sourceIndex = JSON.parse(await readFile(path.join(sourceRoot, "current.json"), "utf8"));
if (sourceIndex?.meta?.schemaVersion !== "g820-index-v1" || !sourceIndex?.meta?.snapshotId) {
  throw new Error("Source G820 index is invalid.");
}

const snapshotId = sourceIndex.meta.snapshotId;
const sourceSnapshot = path.join(sourceRoot, "snapshots", snapshotId);
const targetSnapshot = path.join(targetRoot, "snapshots", snapshotId);
await mkdir(path.join(targetRoot, "snapshots"), { recursive: true });
await cp(sourceSnapshot, targetSnapshot, { recursive: true, force: true });
const engineSource = path.resolve(sourceRoot, '../../../scripts/g820/lib/g820-engine.mjs');
const engineTarget = path.join(process.cwd(), 'lib/g820/generated');
await mkdir(engineTarget, { recursive: true });
await cp(engineSource, path.join(engineTarget, 'g820-engine.mjs'));
await cp(path.join(sourceRoot, "current.json"), path.join(targetRoot, "current.json"), { force: true });
// Preserve immutable detail URLs for users holding the previous index.
console.log(`G820 synced · ${sourceIndex.meta.universeSize} companies · ${snapshotId}`);

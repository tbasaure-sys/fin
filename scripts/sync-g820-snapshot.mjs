import { cp, mkdir, readFile, rm } from "node:fs/promises";
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
await cp(path.join(sourceRoot, "current.json"), path.join(targetRoot, "current.json"), { force: true });

const snapshotDirectories = await import("node:fs/promises").then(({ readdir }) => readdir(path.join(targetRoot, "snapshots"), { withFileTypes: true }));
for (const entry of snapshotDirectories) {
  if (entry.isDirectory() && entry.name !== snapshotId) {
    await rm(path.join(targetRoot, "snapshots", entry.name), { recursive: true, force: true });
  }
}
console.log(`G820 synced · ${sourceIndex.meta.universeSize} companies · ${snapshotId}`);

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorldMonitorModel } from "../lib/mosaic/world-monitor.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8").catch(() => "");
}

test("the dedicated MOSAIC route is private and starts from server snapshots", async () => {
  const page = await source("../app/mosaic/page.js");

  assert.match(page, /requireServerAuthSession\("\/mosaic"\)/);
  assert.match(page, /loadMosaicSnapshot\(\)/);
  assert.match(page, /loadMacroBrainSnapshot\(\)/);
  assert.match(page, /<MosaicWorkspace/);
});

test("the MOSAIC workspace exposes the operational panels and market inspector", async () => {
  const workspace = await source("../components/mosaic-workspace.jsx");

  assert.match(workspace, /aria-label="MOSAIC market heatmap"/);
  assert.match(workspace, /MarketInspector/);
  assert.match(workspace, /SourceHealth/);
  assert.match(workspace, /Evidence gaps/);
  assert.match(workspace, /Next actions/);
  assert.match(workspace, /\/api\/mosaic/);
  assert.match(workspace, /\/api\/macro-brain/);
  assert.match(workspace, /aria-pressed=/);
  assert.match(workspace, /data-testid="mosaic-view-ranked"/);
  assert.match(workspace, /data-market-id=/);
  assert.match(workspace, /function WorldMap/);
  assert.match(workspace, /aria-label="World pressure map"/);
  assert.match(workspace, /data-testid="mosaic-region-filter"/);
  assert.match(workspace, /buildWorldMonitorModel/);
});

test("the MOSAIC workspace has an explicit compact layout for narrow screens", async () => {
  const styles = await source("../components/mosaic-workspace.module.css");

  assert.match(styles, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(280px,/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)/);
  assert.match(styles, /grid-template-columns:\s*1fr/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("the MOSAIC world monitor places markets geographically and filters without losing selection context", () => {
  const model = buildWorldMonitorModel([
    { id: "us-credit", name: "US credit", region: "United States", sector: "credit", score: 42, delta: 8 },
    { id: "china-credit", name: "China credit", region: "China", sector: "credit", score: -31, delta: -6 },
    { id: "europe-power", name: "Europe power", region: "Europe", sector: "energy", score: 58, delta: 3 },
  ], { region: "Asia", sector: "all", signal: "all" });

  assert.deepEqual(model.regions, ["Asia", "Europe", "North America"]);
  assert.equal(model.markets.length, 1);
  assert.equal(model.markets[0].id, "china-credit");
  assert.ok(model.markets[0].x > 60 && model.markets[0].x < 90);
  assert.ok(model.markets[0].y > 25 && model.markets[0].y < 60);
  assert.equal(model.markets[0].trend, "falling");
});

test("MOSAIC renders every unusable snapshot as audit-only and never labels it live", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "tests-node", "helpers", "render-mosaic-workspace.mjs")],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const outcomes = JSON.parse(result.stdout);

  for (const state of [
    "unknown",
    "future",
    "mixedWithoutUsableMarkets",
    "currentWithoutUsableMarkets",
    "reportedCurrentWithFutureContext",
  ]) {
    assert.deepEqual(outcomes[state], {
      auditOnly: true,
      liveLabel: false,
      fallbackLabel: true,
    });
  }
  assert.deepEqual(outcomes.currentUsable, {
    auditOnly: false,
    liveLabel: true,
    fallbackLabel: false,
  });
});

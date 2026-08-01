import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "next/dist/build/swc/index.js";
import { sanitizePublicSnapshotPayload } from "../lib/server/public-snapshot-sanitizer.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const refreshScriptPath = path.join(repoRoot, "scripts", "refresh-live-snapshots.ps1");
const syncScriptPath = path.join(repoRoot, "scripts", "sync-live-snapshots.mjs");
const publicMosaicPath = path.join(repoRoot, "public", "data", "mosaic_embed.json");

const moduleStub = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const routeDependencies = new Map([
  [
    "react/jsx-runtime",
    moduleStub("export function jsx(type, props, key) { return { type, key: key ?? null, props }; } export const jsxs = jsx; export const Fragment = Symbol.for('react.fragment');"),
  ],
  [
    "@/components/mosaic-workspace",
    moduleStub("export default function MosaicWorkspace() { return null; }"),
  ],
  [
    "@/lib/server/auth/session",
    moduleStub("export async function requireApiAuthSession() { return {}; } export async function requireServerAuthSession() { return globalThis.__mosaicSsrFixture.auth; }"),
  ],
  [
    "@/lib/server/macro-brain",
    moduleStub("export async function loadMacroBrainSnapshot() { return globalThis.__mosaicSsrFixture?.macro ?? {}; }"),
  ],
  [
    "@/lib/server/mosaic-observatory",
    moduleStub("export function contextualizeMosaicSnapshot(value, macro) { const extra = globalThis.__mosaicSsrFixture?.contextualized; return extra ? { ...value, contextualized: extra, macroEcho: macro } : value; } export async function loadMosaicSnapshot() { return globalThis.__mosaicSsrFixture?.mosaic ?? {}; }"),
  ],
  [
    "@/lib/server/public-snapshot-sanitizer",
    pathToFileURL(path.join(repoRoot, "lib", "server", "public-snapshot-sanitizer.js")).href,
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = routeDependencies.get(specifier);
    if (url) return { url, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const LOCAL_METADATA_SUFFIXES = new Set([
  "dir",
  "directory",
  "file",
  "location",
  "path",
  "root",
  "uri",
  "url",
]);

function normalizedKey(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isDangerousMetadataKey(key) {
  const normalized = normalizedKey(key);
  const tokens = normalized.split("_").filter(Boolean);
  if (tokens.includes("workstation")) return true;
  if (tokens.includes("hostname")) return true;
  if (tokens.some((token, index) => token === "host" && tokens[index + 1] === "name")) return true;
  return LOCAL_METADATA_SUFFIXES.has(tokens.at(-1))
    && (tokens.includes("cache") || tokens.includes("local"));
}

function findUnsafePublicSnapshotValues(value, cursor = "$", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findUnsafePublicSnapshotValues(item, `${cursor}[${index}]`, findings));
    return findings;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (isDangerousMetadataKey(key)) {
        findings.push(`${cursor}.${key}:dangerous-key`);
      }
      findUnsafePublicSnapshotValues(child, `${cursor}.${key}`, findings);
    }
    return findings;
  }

  if (typeof value !== "string") return findings;
  const text = value.trim();
  if (
    /^file:\/{1,3}/i.test(text)
    || /^[a-z]:[\\/]/i.test(text)
    || /^(?:\\\\|\/\/)[^\\/]+[\\/]/.test(text)
    || /^\/(?!\/)/.test(text)
  ) {
    findings.push(`${cursor}:local-path`);
  }
  return findings;
}

test("MOSAIC live refresh reaches providers before using the offline cache fallback", async () => {
  const script = await readFile(refreshScriptPath, "utf8");
  const liveArgs = script.match(/\$mosaicArgs\s*=\s*@\(([^\r\n]+)\)/)?.[1] ?? "";
  const fallbackArgs = script.match(/\$mosaicFallbackArgs\s*=\s*@\(([^\r\n]+)\)/)?.[1] ?? "";

  assert.match(liveArgs, /"--live-fred"/);
  assert.doesNotMatch(liveArgs, /"--prefer-cache"/);
  assert.match(fallbackArgs, /"--prefer-cache"/);
  assert.match(fallbackArgs, /"--offline"/);
});

test("public snapshot sanitization recursively removes local paths and file URIs", () => {
  const sanitized = sanitizePublicSnapshotPayload({
    generated_at: "2026-07-30T11:47:49.905254+00:00",
    providers: [{ name: "FRED", url: "https://fred.stlouisfed.org/" }],
    fred_cache: {
      cache_dir: "C:\\Users\\T14 Ultra 7\\OneDrive\\Escritorio\\CT\\02_Finance\\Fin_model\\data\\mosaic_cache\\fred",
      files: 44,
    },
    nested: {
      sourcePath: "C:\\Users\\T14 Ultra 7\\Desktop\\private\\file.json",
      note: "keep me",
      paths: [
        "D:/private/cache.json",
        "\\\\workstation\\private-share\\snapshot.json",
        "//workstation/private-share/snapshot.json",
        "/home/runner/private/snapshot.json",
        "file:///C:/Users/private/snapshot.json",
        "file://workstation/private-share/snapshot.json",
        "Energy / Utilities",
        "https://example.com/public/snapshot.json",
        "http://example.com/public/snapshot.json",
      ],
    },
    url: "https://example.com/source.json",
  });

  assert.equal("cache_dir" in sanitized.fred_cache, false);
  assert.equal("sourcePath" in sanitized.nested, false);
  assert.equal(sanitized.fred_cache.files, 44);
  assert.equal(sanitized.nested.note, "keep me");
  assert.deepEqual(sanitized.nested.paths, [
    "Energy / Utilities",
    "https://example.com/public/snapshot.json",
    "http://example.com/public/snapshot.json",
  ]);
  assert.equal(sanitized.url, "https://example.com/source.json");
});

test("public snapshot sanitization removes local paths embedded inside messages", () => {
  const sanitized = sanitizePublicSnapshotPayload({
    messages: [
      "Loaded from C:\\Users\\analyst\\private\\snapshot.json successfully.",
      "Read \\\\workstation\\private-share\\snapshot.json before publishing.",
      "Cache file file:///C:/Users/analyst/private/snapshot.json is stale.",
      "Read /home/runner/private/snapshot.json before publishing.",
      "Energy / Utilities remains normal copy.",
      "Use https://example.com/public/snapshot.json as the public source.",
    ],
    nested: {
      warning: "Internal source: D:/private/mosaic/cache.json; do not publish.",
      publicCopy: "Demand / supply is mixed.",
    },
  });

  assert.deepEqual(sanitized, {
    messages: [
      "Energy / Utilities remains normal copy.",
      "Use https://example.com/public/snapshot.json as the public source.",
    ],
    nested: { publicCopy: "Demand / supply is mixed." },
  });
});

test("snapshot API handlers sanitize their JSON payloads at the response boundary", async () => {
  const [macroRoute, mosaicRoute] = await Promise.all([
    import("../app/api/macro-brain/route.js?public-boundary-test"),
    import("../app/api/mosaic/route.js?public-boundary-test"),
  ]);

  assert.equal(typeof macroRoute.createMacroBrainGetHandler, "function");
  assert.equal(typeof mosaicRoute.createMosaicGetHandler, "function");

  const unsafePayload = {
    sourcePath: "validation_output/macro_brain/latest.json",
    rawPath: "runtime/private/mosaic.json",
    note: "Loaded from /home/runner/private/snapshot.json.",
    publicUrl: "https://example.com/source.json",
    value: 42,
  };
  const allow = async () => ({ user: { id: "test-user" } });
  const macroGet = macroRoute.createMacroBrainGetHandler({
    requireAuth: allow,
    loadSnapshot: async () => unsafePayload,
  });
  const mosaicGet = mosaicRoute.createMosaicGetHandler({
    requireAuth: allow,
    loadMacro: async () => ({}),
    loadMosaic: async () => unsafePayload,
    contextualize: (snapshot) => snapshot,
  });

  for (const handler of [macroGet, mosaicGet]) {
    const response = await handler(new Request("http://localhost/api/snapshot"));
    assert.deepEqual(await response.json(), {
      publicUrl: "https://example.com/source.json",
      value: 42,
    });
  }
});

test("MOSAIC server page sanitizes both snapshots at the final client-prop boundary", async () => {
  globalThis.__mosaicSsrFixture = {
    auth: { workspace: { name: "Test workspace" } },
    macro: {
      raw: {
        sourcePath: "C:\\Users\\analyst\\private\\macro.json",
        embeddedNote: "Loaded from /home/runner/private/macro.json.",
        safeValue: 17,
      },
      publicSource: "https://example.com/macro.json",
    },
    mosaic: {
      markets: [{ id: "us-credit", label: "United States / credit" }],
      raw: {
        sourcePath: "D:\\private\\mosaic.json",
        embeddedNote: "Read file:///C:/Users/analyst/private/mosaic.json before rendering.",
        safeValue: 23,
      },
    },
    contextualized: {
      sourcePath: "validation_output/mosaic/latest.json",
      embeddedNote: "Context came from /srv/private/context.json.",
      publicUrl: "https://example.com/context.json",
    },
  };

  try {
    const pageSource = await readFile(path.join(repoRoot, "app", "mosaic", "page.js"), "utf8");
    const transformed = await transform(pageSource, {
      filename: "app/mosaic/page.js",
      jsc: {
        parser: { syntax: "ecmascript", jsx: true },
        transform: { react: { runtime: "automatic" } },
      },
      module: { type: "es6" },
    });
    const { default: MosaicPage } = await import(moduleStub(transformed.code));
    const rendered = await MosaicPage();

    assert.equal(rendered.props.workspaceName, "Test workspace");
    assert.deepEqual(rendered.props.initialMacro, {
      raw: { safeValue: 17 },
      publicSource: "https://example.com/macro.json",
    });
    assert.deepEqual(rendered.props.initialSnapshot, {
      markets: [{ id: "us-credit", label: "United States / credit" }],
      raw: { safeValue: 23 },
      contextualized: { publicUrl: "https://example.com/context.json" },
      macroEcho: {
        raw: { safeValue: 17 },
        publicSource: "https://example.com/macro.json",
      },
    });
  } finally {
    delete globalThis.__mosaicSsrFixture;
  }
});

test("public snapshot sanitization removes normalized local metadata keys without erasing public market data", () => {
  const sanitized = sanitizePublicSnapshotPayload({
    fred_cache: {
      files: 44,
      cache_dir: "mosaic_cache/fred",
      cacheDirectory: "mosaic_cache/fred",
      fredCachePath: "mosaic_cache/fred",
    },
    runtime: {
      localPath: "snapshots/latest.json",
      source_path: "validation_output/mosaic/latest.json",
      rawPath: "runtime/private/mosaic.json",
      local_cache_dir: "snapshots/cache",
      workstation_name: "analyst-laptop",
      analystWorkstationId: "private-id",
      hostName: "private-host",
      machineHostname: "private-machine",
      providerHostname: "private-provider-host",
    },
    markets: [{
      id: "eu_energy_gas",
      label: "Europe / natural gas",
      local_market: "Santiago retail",
      cache_hit_rate: 0.98,
      source: { id: "fred_gas", url: "https://fred.stlouisfed.org/series/DHHNGSP" },
    }],
  });

  assert.deepEqual(sanitized.fred_cache, { files: 44 });
  assert.deepEqual(sanitized.runtime, {});
  assert.deepEqual(sanitized.markets, [{
    id: "eu_energy_gas",
    label: "Europe / natural gas",
    local_market: "Santiago retail",
    cache_hit_rate: 0.98,
    source: { id: "fred_gas", url: "https://fred.stlouisfed.org/series/DHHNGSP" },
  }]);
});

test("live snapshot sync sanitizes parsed payloads before writing public JSON", async () => {
  const script = await readFile(syncScriptPath, "utf8");
  const sanitizeAt = script.indexOf("sanitizePublicSnapshotPayload(raw)");
  const writeAt = script.indexOf("writeFile(file.target");

  assert.ok(sanitizeAt >= 0, "sync must sanitize parsed payloads");
  assert.ok(writeAt > sanitizeAt, "sanitization must happen before the public write");
  assert.match(script, /JSON\.stringify\(sanitized,/);
});

test("deployable public MOSAIC snapshot has no recursive local metadata or filesystem references", async () => {
  const payload = JSON.parse(await readFile(publicMosaicPath, "utf8"));
  const findings = findUnsafePublicSnapshotValues(payload);

  assert.deepEqual(findings, []);
});

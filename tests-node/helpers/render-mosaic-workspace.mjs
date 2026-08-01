import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { transform } from "next/dist/build/swc/index.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;

globalThis.__mosaicReact = React;

const moduleStubs = new Map([
  ["react", import.meta.resolve("react")],
  ["react/jsx-runtime", import.meta.resolve("react/jsx-runtime")],
  [
    "next/link",
    dataModule("export default function Link(props) { const { children, ...rest } = props; return globalThis.__mosaicReact.createElement('a', rest, children); }"),
  ],
  [
    "@/components/language-layer",
    dataModule("export function useLanguagePreference() { return { language: 'en' }; }"),
  ],
  [
    "@/components/mosaic-workspace.module.css",
    dataModule("export default new Proxy({}, { get(_target, key) { return String(key); } });"),
  ],
  [
    "@/lib/mosaic/world-monitor",
    dataModule("export function buildWorldMonitorModel(markets) { return { markets, regions: [], sectors: [], total: markets.length }; }"),
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = moduleStubs.get(specifier);
    if (url) return { url, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const componentSource = await readFile(path.join(repoRoot, "components", "mosaic-workspace.jsx"), "utf8");
const transformed = await transform(componentSource, {
  filename: "mosaic-workspace.jsx",
  jsc: {
    parser: { syntax: "ecmascript", jsx: true },
    transform: { react: { runtime: "automatic" } },
  },
  module: { type: "es6" },
});
const { default: MosaicWorkspace } = await import(dataModule(transformed.code));

function market(freshness) {
  return {
    id: "test-market",
    name: "Test market",
    region: "Global",
    sector: "macro",
    score: 12,
    delta: 1,
    drivers: [],
    freshness,
  };
}

function snapshot({ state, contextState = state, declaredLive = true, contextUsable = true, marketFreshness = null }) {
  const markets = marketFreshness ? [market(marketFreshness)] : [];
  return {
    live: declaredLive,
    dataState: state,
    markets,
    context: {
      status: contextState,
      freshness: { status: contextState, usable: contextUsable },
      markets,
    },
  };
}

function inspect(input) {
  const html = renderToStaticMarkup(React.createElement(MosaicWorkspace, {
    initialMacro: {},
    initialSnapshot: input,
    workspaceName: "Test workspace",
  }));
  return {
    auditOnly: html.includes('data-testid="mosaic-audit-only-warning"'),
    liveLabel: html.includes("Live snapshot"),
    fallbackLabel: html.includes("Saved snapshot"),
  };
}

const outcomes = {
  unknown: inspect(snapshot({ state: "unknown", contextUsable: false })),
  future: inspect(snapshot({
    state: "future",
    contextUsable: false,
    marketFreshness: { status: "future", usable: false },
  })),
  mixedWithoutUsableMarkets: inspect(snapshot({ state: "mixed" })),
  currentWithoutUsableMarkets: inspect(snapshot({ state: "current" })),
  reportedCurrentWithFutureContext: inspect(snapshot({
    state: "current",
    contextState: "future",
    marketFreshness: { status: "current", usable: true },
  })),
  currentUsable: inspect(snapshot({
    state: "current",
    marketFreshness: { status: "current", usable: true },
  })),
};

process.stdout.write(JSON.stringify(outcomes));

#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildAuroraSourceGovernanceEngine } from "../lib/aurora-source-governance-engine.js";

function parseArgs(argv) {
  const args = { input: null, output: null };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input" || arg === "-i") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/run_aurora_source_governance.mjs --input sources.json [--output governance.json]",
    "",
    "Input accepts { sources: [...] }, { sourceLedger: [...] }, { dataSources: [...] }, or pipeline inputs with documents.",
  ].join("\n");
}

const args = parseArgs(process.argv);
if (args.help || !args.input) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

const rawInput = await readFile(resolve(args.input), "utf8");
const payload = JSON.parse(rawInput.replace(/^\uFEFF/, ""));
const result = buildAuroraSourceGovernanceEngine(payload, payload.options || {});
const serialized = `${JSON.stringify(result, null, 2)}\n`;

if (args.output) {
  await writeFile(resolve(args.output), serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

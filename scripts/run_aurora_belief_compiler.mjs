#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compileAuroraBeliefObject, compileAuroraBeliefPanel } from "../lib/aurora-belief-compiler.js";

function parseArgs(argv) {
  const args = { input: null, output: null, panel: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input" || arg === "-i") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === "--panel") {
      args.panel = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/run_aurora_belief_compiler.mjs --input snapshot.json [--output compiled.json] [--panel]",
    "",
    "Single input accepts { company, market, financials, macro, evidence, drivers }.",
    "Panel input accepts an array or { snapshots: [...] }.",
  ].join("\n");
}

const args = parseArgs(process.argv);
if (args.help || !args.input) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

const rawInput = await readFile(resolve(args.input), "utf8");
const payload = JSON.parse(rawInput.replace(/^\uFEFF/, ""));
const snapshots = Array.isArray(payload) ? payload : payload.snapshots;
const result = args.panel || Array.isArray(snapshots) ? compileAuroraBeliefPanel(snapshots || [], payload.options || {}) : compileAuroraBeliefObject(payload, payload.options || {});
const serialized = `${JSON.stringify(result, null, 2)}\n`;

if (args.output) {
  await writeFile(resolve(args.output), serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

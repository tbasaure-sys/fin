#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildAuroraPricedBeliefObject } from "../lib/aurora-belief-object.js";

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
    "Usage: node scripts/run_aurora_belief_object.mjs --input drivers.json [--output belief-object.json]",
    "",
    "Input JSON shape:",
    '{ "drivers": { "ticker": "ASML", "price": 800, "revenue": 300, "baseFcf": 28 }, "snapshot": {}, "options": {} }',
  ].join("\n");
}

const args = parseArgs(process.argv);
if (args.help || !args.input) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

const rawInput = await readFile(resolve(args.input), "utf8");
const payload = JSON.parse(rawInput.replace(/^\uFEFF/, ""));
const drivers = payload.drivers || payload;
const snapshot = payload.snapshot || {};
const options = payload.options || {};
const beliefObject = buildAuroraPricedBeliefObject(drivers, snapshot, options);
const serialized = `${JSON.stringify(beliefObject, null, 2)}\n`;

if (args.output) {
  await writeFile(resolve(args.output), serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

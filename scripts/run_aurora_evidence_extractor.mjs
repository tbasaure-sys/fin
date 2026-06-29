#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { evidenceForBeliefCompiler, extractAuroraEvidenceSignals, summarizeAuroraEvidence } from "../lib/aurora-evidence-extractor.js";

function parseArgs(argv) {
  const args = { input: null, output: null, compiler: false, summary: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input" || arg === "-i") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === "--compiler") {
      args.compiler = true;
    } else if (arg === "--summary") {
      args.summary = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/run_aurora_evidence_extractor.mjs --input evidence.json [--output evidence-signals.json]",
    "",
    "Options:",
    "  --compiler   Emit the compact evidence shape accepted by the Belief Compiler.",
    "  --summary    Emit a compact evidence summary.",
    "",
    "Input accepts { documents: [{ type, source, text }] } or an array of documents/strings.",
  ].join("\n");
}

const args = parseArgs(process.argv);
if (args.help || !args.input) {
  console.log(usage());
  process.exit(args.help ? 0 : 1);
}

const rawInput = await readFile(resolve(args.input), "utf8");
const payload = JSON.parse(rawInput.replace(/^\uFEFF/, ""));
const result = args.compiler
  ? evidenceForBeliefCompiler(payload, payload.options || {})
  : args.summary
    ? summarizeAuroraEvidence(payload, payload.options || {})
    : extractAuroraEvidenceSignals(payload, payload.options || {});
const serialized = `${JSON.stringify(result, null, 2)}\n`;

if (args.output) {
  await writeFile(resolve(args.output), serialized, "utf8");
} else {
  process.stdout.write(serialized);
}

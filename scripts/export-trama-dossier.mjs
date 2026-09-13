import { readFile, readdir, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { compileDossier } from "../lib/research/dossier.js";
import {revenueBreakdown} from '../lib/research/revenue-breakdown.mjs';
import {
  documentStructure,
  makeChunks,
  hash,
} from "../lib/research/filing-engine.mjs";

const sourceRoot = process.argv[2];
if (!sourceRoot)
  throw Error(
    "Pass the Trama data/research directory. No network or model calls.",
  );
const ticker = (process.argv[3] || "MSFT").toUpperCase();
const packets = await Promise.all(
  (await readdir(path.join(sourceRoot, "packets")))
    .filter((x) => x.endsWith(".json"))
    .map(async (file) => {
      const raw = await readFile(path.join(sourceRoot, "packets", file));
      if (hash(raw) !== path.basename(file, ".json"))
        throw Error("PACKET_HASH_MISMATCH");
      return JSON.parse(raw);
    }),
);
const packet = packets
  .filter((p) => p.ticker === ticker)
  .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))[0];
if (!packet) throw Error("NO_PACKET");
// Reparse actual source bytes: a stored chunk alone is not source verification.
const chunks = [];
const newest=[...packet.sources].sort((a,b)=>Date.parse(b.periodEnd)-Date.parse(a.periodEnd)||Date.parse(b.acceptedAt)-Date.parse(a.acceptedAt))[0];
let revenue=null;
for (const source of packet.sources) {
  const raw = await readFile(
    path.join(sourceRoot, "sources", `${source.sha256}.txt`),
  );
  if (hash(raw) !== source.sha256) throw Error("SOURCE_HASH_MISMATCH");
  if(source.id===newest.id)revenue=revenueBreakdown(raw.toString(),{...source,cik:packet.cik});
  chunks.push(...makeChunks(documentStructure(raw.toString()), source.id));
}
const dossier = compileDossier({ ...packet, chunks, revenueBreakdown:revenue });
const dir = new URL("../lib/research/published/", import.meta.url);
await mkdir(dir, { recursive: true });
const target = new URL(`${ticker}.json`, dir),
  temp = new URL(`${ticker}.json.tmp`, dir);
await writeFile(
  temp,
  JSON.stringify({ ...dossier, delivery: "published_capture" }, null, 2),
);
await rename(temp, target);
console.log(
  JSON.stringify({
    ticker,
    coverage: dossier.coverage,
    packetHash: dossier.packetHash,
    asOf: dossier.asOf,
  }),
);

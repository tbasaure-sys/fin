import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, "public", "data");

const defaultMacroSource = path.resolve(
  repoRoot,
  "..",
  "02_Finance",
  "Fin_model",
  "validation_output",
  "macro_brain_v2",
  "macro_brain_latest.json",
);

const defaultMosaicSource = path.resolve(
  repoRoot,
  "..",
  "02_Finance",
  "Fin_model",
  "validation_output",
  "mosaic_observatory",
  "mosaic_embed.json",
);

const files = [
  {
    label: "Macro Brain",
    source: process.env.MACRO_BRAIN_SYNC_SOURCE || defaultMacroSource,
    target: path.join(outputDir, "macro_brain_latest.json"),
  },
  {
    label: "MOSAIC",
    source: process.env.MOSAIC_SYNC_SOURCE || defaultMosaicSource,
    target: path.join(outputDir, "mosaic_embed.json"),
  },
];

await mkdir(outputDir, { recursive: true });

for (const file of files) {
  const sourceInfo = await stat(file.source);
  if (!sourceInfo.isFile()) {
    throw new Error(`${file.label} source is not a file: ${file.source}`);
  }
  await copyFile(file.source, file.target);
  const targetInfo = await stat(file.target);
  console.log(`${file.label}: ${file.target} (${targetInfo.size} bytes)`);
}

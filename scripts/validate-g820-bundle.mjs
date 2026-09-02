import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "public", "data", "g820", "current.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
const errors = [];

if (index?.meta?.schemaVersion !== "g820-index-v1") errors.push("invalid index schema");
if (!index?.meta?.snapshotId) errors.push("missing snapshot id");
if (!Array.isArray(index?.companies)) errors.push("companies is not an array");
if (index?.companies?.length !== index?.meta?.universeSize) errors.push("universe size mismatch");

const refs = new Set();
for (const company of index.companies || []) {
  if (refs.has(company.detailRef)) errors.push(`duplicate detail ref: ${company.detailRef}`);
  refs.add(company.detailRef);
  try {
    const detailPath = path.join(root, "public", company.detailRef);
    await access(detailPath);
    const detail = JSON.parse(await readFile(detailPath, "utf8"));
    if (detail.schemaVersion !== "g820-company-v1") errors.push(`${company.ticker}: invalid detail schema`);
    if (detail.snapshotId !== index.meta.snapshotId) errors.push(`${company.ticker}: snapshot mismatch`);
    if (detail.id !== company.id) errors.push(`${company.ticker}: identity mismatch`);
  } catch (error) {
    errors.push(`${company.ticker}: unreadable detail (${error.code || error.message})`);
  }
}

if (errors.length) {
  console.error(`G820 bundle FAIL (${errors.length})`);
  errors.slice(0, 30).forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`G820 bundle PASS · ${index.companies.length} companies · ${index.meta.snapshotId}`);
}

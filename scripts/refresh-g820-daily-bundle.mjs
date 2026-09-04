import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchG820DailyPriceOverlay } from '../lib/g820/daily-refresh.js';

const root = path.join(process.cwd(), 'public/data/g820');
const index = JSON.parse(await readFile(path.join(root, 'current.json'), 'utf8'));
const runtime = JSON.parse(await readFile(path.join(root, 'snapshots', index.meta.snapshotId, 'runtime.json'), 'utf8'));
const overlay = await fetchG820DailyPriceOverlay({ index, runtime,
  apiKey: process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY,
  concurrency: 5,
});
const destination = path.join(root, 'daily-price.json');
const temporary = `${destination}.${process.pid}.tmp`;
await writeFile(temporary, JSON.stringify(overlay));
await rename(temporary, destination);
console.log(JSON.stringify({ path: destination, snapshotId: overlay.baseSnapshotId,
  marketAsOf: overlay.marketAsOf, coverage: overlay.coverage, persistedToRuntime: false }));

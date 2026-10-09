import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCompanyReading, readingValue } from '../lib/company-reading/engine.js';
import { getCompanyReadingSnapshot } from '../lib/company-reading/snapshots.js';

const target = path.resolve(process.argv[2] || 'output/company-reading-media');
const snapshot = getCompanyReadingSnapshot('MSFT');
const reading = buildCompanyReading(snapshot);
await mkdir(target, { recursive: true });
await writeFile(path.join(target, 'reading.json'), JSON.stringify({ snapshot, reading, chapters: reading.narration.chapters.map(chapter => ({ ...chapter, figures: chapter.figures.slice(0, 3).map(point => ({ ...point, display: readingValue(point.label === 'Cierre observado' ? { ...point, unit: 'USD/share' } : point) })) })) }, null, 2));
console.log(JSON.stringify({ directory: target, snapshotId: reading.snapshotId, runId: reading.runId, chapters: reading.narration.chapters.length }));

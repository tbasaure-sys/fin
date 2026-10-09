import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { snapshotFromResearch, applyEngineResearchPolicy } from '../company-reading/research-snapshot.js';
import { stableSerialize } from '../company-reading/engine.js';
import { loadSecReadingEvidence } from './company-reading-providers.js';

const hash = value => createHash('sha256').update(stableSerialize(value)).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function createReadingSnapshotStore({ directory = path.join(process.env.BLS_COMPANY_THESIS_DATA_DIR || path.join(process.cwd(), '_local_data', 'company-theses'), 'snapshots'), repository = null } = {}) {
  const root = path.resolve(directory);
  return {
    async put(snapshot) {
      const content = JSON.parse(JSON.stringify(snapshot)); delete content.id;
      const id = `snapshot-${hash(content)}`, frozen = { ...content, id };
      if (repository) await repository.putSnapshot(frozen);
      else { await mkdir(root, { recursive: true }); try { await writeFile(path.join(root, `${id}.json`), JSON.stringify(frozen), { encoding: 'utf8', flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
      return frozen;
    },
    async get(id, ticker) {
      if (!/^snapshot-[a-f0-9]{64}$/.test(id || '')) throw fail('Identificador de snapshot inválido.');
      let snapshot;
      if (repository) snapshot = await repository.getSnapshot(id);
      else { try { snapshot = JSON.parse(await readFile(path.join(root, `${id}.json`), 'utf8')); } catch (e) { if (e.code === 'ENOENT') throw fail('El snapshot ya no está disponible. Vuelve a capturar la empresa.', 404); throw e; } }
      if (!snapshot) throw fail('Snapshot no disponible.', 404);
      if (snapshot.ticker !== ticker) throw fail('El snapshot corresponde a otra empresa.');
      const content = { ...snapshot }; delete content.id;
      if (id !== `snapshot-${hash(content)}` || snapshot.id !== id) throw fail('Falló la integridad del snapshot.', 500);
      return snapshot;
    },
  };
}
async function backendResearch(ticker) { const { fetchBackendEquityResearch } = await import('./backend.js'); return fetchBackendEquityResearch(ticker, 'quick'); }
export async function captureCompanyReading(ticker, { backendLoader = backendResearch, secLoader = loadSecReadingEvidence, store = createReadingSnapshotStore(), now = () => new Date().toISOString() } = {}) {
  if (!/^[A-Z0-9.-]{1,16}$/.test(ticker || '')) throw fail('Ticker inválido.');
  const capturedAt = now(), cutoff = capturedAt.slice(0, 10);
  const [canonical, primary] = await Promise.allSettled([backendLoader(ticker), secLoader(ticker, { capturedAt, cutoff })]);
  const payload = canonical.status === 'fulfilled' && canonical.value?.ok !== false ? canonical.value : { ticker, company_profile: { ticker } };
  const evidence = primary.status === 'fulfilled' ? primary.value : null;
  const merged = payload.reading_evidence ? payload : { ...payload, ...(evidence?.facts ? { reading_evidence: evidence } : {}) };
  let snapshot = snapshotFromResearch(ticker, merged, { cutoff, capturedAt });
  if (payload.reading_policy) {
    try { snapshot = applyEngineResearchPolicy(snapshot, payload.reading_policy); }
    catch { snapshot.evidenceIssues.push({ key: 'engine_policy', message: 'Las hipótesis del proveedor no cumplen el contrato determinista y trazable; se conservan vacías.' }); }
  }
  if (!payload.reading_evidence && !evidence?.facts && evidence?.issues) snapshot.evidenceIssues.push(...evidence.issues);
  if (canonical.status === 'rejected' && !evidence?.facts) snapshot.evidenceIssues.push({ key: 'provider', message: 'No se recuperó evidencia primaria del emisor. El sistema conserva los datos faltantes.' });
  return store.put(snapshot);
}
const recentCaptures = globalThis.__BLS_READING_CAPTURES__ || new Map();
globalThis.__BLS_READING_CAPTURES__ = recentCaptures;
export async function getCurrentCompanyReading(ticker, options = {}) {
  const existing = recentCaptures.get(ticker);
  if (existing && Date.now() - existing.at < 300000) return existing.promise;
  const promise = captureCompanyReading(ticker, options);
  if (recentCaptures.size >= 100) recentCaptures.delete(recentCaptures.keys().next().value);
  recentCaptures.set(ticker, { at: Date.now(), promise });
  try { return await promise; } catch (error) { recentCaptures.delete(ticker); throw error; }
}

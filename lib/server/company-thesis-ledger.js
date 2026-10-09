import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { compareLaterEvidence, stableSerialize } from '../company-reading/engine.js';
import { MSFT_FY25_EVIDENCE } from '../company-reading/snapshots.js';

const digest = value => createHash('sha256').update(stableSerialize(value)).digest('hex');
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createCompanyThesisLedger({ directory = process.env.BLS_COMPANY_THESIS_DATA_DIR || path.join(process.cwd(), '_local_data', 'company-theses'), now = () => new Date().toISOString(), repository = null } = {}) {
  const root = path.resolve(directory);
  function fileFor(owner, ticker) {
    if (!UUID.test(owner) || !/^[A-Z0-9.-]{1,16}$/.test(ticker)) fail('Identidad de registro inválida.');
    return path.join(root, `${owner}-${ticker}.json`);
  }
  async function read(owner, ticker) {
    fileFor(owner, ticker);
    let data;
    try { data = repository ? await repository.load(owner, ticker) : JSON.parse(await readFile(fileFor(owner, ticker), 'utf8')); if (!data) return { schema: 'company_thesis_ledger_v1', version: 0, events: [], storage: repository ? 'account-database' : 'local-disk' }; }
    catch (error) { if (error.code === 'ENOENT') return { schema: 'company_thesis_ledger_v1', version: 0, events: [], storage: 'local-disk' }; throw error; }
    let prior = null;
    if (data.schema !== 'company_thesis_ledger_v1' || !Array.isArray(data.events)) fail('Integridad del registro inválida.', 500);
    for (let i = 0; i < data.events.length; i++) {
      const { hash, ...content } = data.events[i];
      if (content.version !== i + 1 || content.previousHash !== prior || digest(content) !== hash) fail('Falló la integridad del registro; no se reescribe.', 500);
      prior = hash;
    }
    if (data.version !== data.events.length) fail('Integridad de versión inválida.', 500);
    return data;
  }
  async function append({ owner, ticker, expectedVersion, build }) {
    const file = fileFor(owner, ticker);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) fail('Versión esperada inválida.');
    if (repository) {
      const ledger = await read(owner, ticker);
      if (ledger.version !== expectedVersion) fail('Hay una versión posterior. Vuelve a cargar antes de guardar.', 409);
      if (ledger.version >= 100) fail('El registro alcanzó su límite de versiones.', 413);
      const recordedAt = now();
      const event = { version: ledger.version + 1, previousHash: ledger.events.at(-1)?.hash || null, recordedAt, ...build(ledger, recordedAt) };
      event.hash = digest(event);
      const next = { ...ledger, storage: 'account-database', version: event.version, events: [...ledger.events, event] };
      if (!await repository.compareAndAppend(owner, ticker, expectedVersion, next)) fail('Hay una versión posterior. Vuelve a cargar antes de guardar.', 409);
      return next;
    }
    await mkdir(root, { recursive: true });
    const lock = `${file}.lock`;
    try { await mkdir(lock); } catch (error) { if (error.code === 'EEXIST') fail('El registro está ocupado. Vuelve a cargar antes de guardar.', 409); throw error; }
    try {
      const ledger = await read(owner, ticker);
      if (ledger.version !== expectedVersion) fail('Hay una versión posterior. Vuelve a cargar antes de guardar.', 409);
      if (ledger.version >= 100) fail('El registro alcanzó su límite de versiones.', 413);
      const recordedAt = now();
      const event = { version: ledger.version + 1, previousHash: ledger.events.at(-1)?.hash || null, recordedAt, ...build(ledger, recordedAt) };
      event.hash = digest(event);
      const next = { ...ledger, version: event.version, events: [...ledger.events, event] };
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(next), { encoding: 'utf8', flag: 'wx' });
      await rename(temp, file);
      return next;
    } finally { await rmdir(lock); }
  }
  return {
    read, fileFor,
    commit({ owner, ticker, expectedVersion, reading, snapshot }) {
      return append({ owner, ticker, expectedVersion, build: () => {
        if (reading?.status !== 'research' || reading?.ticker !== ticker || snapshot?.id !== reading?.snapshotId) fail('Solo se registra una tesis calculada sobre un snapshot conciliado.');
        return { type: 'thesis', payload: { reading: JSON.parse(JSON.stringify(reading)), snapshot: JSON.parse(JSON.stringify(snapshot)), snapshotHash: digest(snapshot), hindsight: reading.mode === 'historical_reconstruction' } };
      } });
    },
    evidence({ owner, ticker, expectedVersion, thesisVersion, evidence = null }) {
      return append({ owner, ticker, expectedVersion, build: (ledger, recordedAt) => {
        const target = ledger.events.find(event => event.version === thesisVersion && event.type === 'thesis');
        if (!target) fail('Selecciona una versión de tesis existente.');
        const observation = evidence || (target.payload.reading.mode === 'historical_reconstruction' && ticker === MSFT_FY25_EVIDENCE.ticker ? MSFT_FY25_EVIDENCE : null);
        if (!observation) fail('No hay evidencia posterior conciliada para esta empresa.');
        if (ledger.events.some(event => event.type === 'evidence' && event.payload.thesisVersion === thesisVersion && event.payload.evidence.id === observation.id)) fail('Esta evidencia ya está registrada para esa tesis.', 409);
        return { type: 'evidence', payload: { thesisVersion, evidence: JSON.parse(JSON.stringify(observation)), assessment: compareLaterEvidence(target.payload.reading, observation, recordedAt, target.recordedAt) } };
      } });
    },
  };
}

import 'server-only';
import { createHash } from 'node:crypto';
import { getNeonSql } from './neon.js';

export function accountThesisOwner(session) {
  if (!session?.user?.id || !session.workspace?.id) throw new Error('Falta identidad de cuenta y espacio de trabajo.');
  const h = createHash('sha256').update(`company-thesis-account-v1:${session.workspace.id}:${session.user.id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${(8 + parseInt(h[16], 16) % 4).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const setups = new WeakMap();
export function createCompanyReadingRepository({ sql = getNeonSql(), scope = 'guest' } = {}) {
  if (!['guest', 'account'].includes(scope)) throw new Error('Ámbito de registro inválido.');
  async function ready() {
    if (!setups.has(sql)) setups.set(sql, (async () => {
      await sql.query(`CREATE TABLE IF NOT EXISTS bls_company_reading_snapshots (id TEXT PRIMARY KEY, ticker TEXT NOT NULL, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await sql.query(`CREATE TABLE IF NOT EXISTS bls_company_thesis_ledgers (scope TEXT NOT NULL CHECK (scope IN ('guest','account')), owner UUID NOT NULL, ticker TEXT NOT NULL, version INTEGER NOT NULL, ledger JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (scope, owner, ticker))`);
    })().catch(error => { setups.delete(sql); throw error; }));
    return setups.get(sql);
  }
  return {
    async load(owner, ticker) { await ready(); const rows = await sql.query('SELECT ledger FROM bls_company_thesis_ledgers WHERE scope = $1 AND owner = $2::uuid AND ticker = $3', [scope, owner, ticker]); return rows[0]?.ledger || null; },
    async compareAndAppend(owner, ticker, expectedVersion, next) {
      await ready();
      if (expectedVersion === 0) {
        const inserted = await sql.query(`INSERT INTO bls_company_thesis_ledgers (scope, owner, ticker, version, ledger) VALUES ($1, $2::uuid, $3, $4, $5::jsonb) ON CONFLICT (scope, owner, ticker) DO NOTHING RETURNING version`, [scope, owner, ticker, next.version, JSON.stringify(next)]);
        return inserted.length === 1;
      }
      const updated = await sql.query(`UPDATE bls_company_thesis_ledgers SET version = $5, ledger = $6::jsonb, updated_at = NOW() WHERE scope = $1 AND owner = $2::uuid AND ticker = $3 AND version = $4 RETURNING version`, [scope, owner, ticker, expectedVersion, next.version, JSON.stringify(next)]);
      return updated.length === 1;
    },
    async putSnapshot(snapshot) { await ready(); await sql.query('INSERT INTO bls_company_reading_snapshots (id, ticker, snapshot) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING', [snapshot.id, snapshot.ticker, JSON.stringify(snapshot)]); },
    async getSnapshot(id) { await ready(); const rows = await sql.query('SELECT snapshot FROM bls_company_reading_snapshots WHERE id = $1', [id]); return rows[0]?.snapshot || null; },
  };
}

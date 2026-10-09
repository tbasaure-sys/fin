import 'server-only';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getServerAuthSession } from './auth/session.js';
import { usingNeonStorage } from './data/neon.js';
import { accountThesisOwner, createCompanyReadingRepository } from './data/company-reading.js';
import { createCompanyThesisLedger } from './company-thesis-ledger.js';
import { createReadingSnapshotStore } from './company-reading-service.js';

export function companyReadingSnapshotStore() {
  if (usingNeonStorage()) return createReadingSnapshotStore({ repository: createCompanyReadingRepository() });
  if (process.env.NODE_ENV === 'production' && !process.env.BLS_COMPANY_THESIS_DATA_DIR) throw Object.assign(new Error('La lectura necesita almacenamiento persistente: base de datos o BLS_COMPANY_THESIS_DATA_DIR.'), { status: 503 });
  return createReadingSnapshotStore();
}
export async function companyThesisContext(ticker) {
  if (!/^[A-Z0-9.-]{1,16}$/.test(ticker || '')) throw Object.assign(new Error('Empresa inválida.'), { status: 400 });
  const session = await getServerAuthSession();
  let owner, scope;
  if (session?.user?.id && session.workspace?.id) { owner = accountThesisOwner(session); scope = 'account'; }
  else {
    scope = 'guest'; owner = cookies().get('bls_company_thesis_owner')?.value;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner || '')) {
      owner = randomUUID(); cookies().set('bls_company_thesis_owner', owner, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 24 * 3600 });
    }
  }
  const snapshots = companyReadingSnapshotStore();
  const repository = usingNeonStorage() ? createCompanyReadingRepository({ scope }) : null;
  const directory = process.env.BLS_COMPANY_THESIS_DATA_DIR || path.join(process.cwd(), '_local_data', 'company-theses');
  const store = createCompanyThesisLedger({ repository, directory: scope === 'account' ? path.join(directory, 'accounts') : directory });
  return { owner, scope, ticker, snapshots, store };
}

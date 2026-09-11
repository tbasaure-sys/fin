import 'server-only';
import {getNeonSql} from './data/neon.js';

// Used for local development only. Production never falls back to volatile storage.
export function createMemoryThesisStore() {
  const rows=[];
  return {
    async list(owner,ticker){return structuredClone(rows.filter(r=>r.owner===owner&&r.record.dossier.ticker===ticker).map(r=>r.record).reverse().slice(0,100))},
    async latest(owner,company,branch){return structuredClone(rows.findLast(r=>r.owner===owner&&r.record.thesis.companyKey===company&&r.record.branch===branch)?.record||null)},
    async findHash(owner,hash){return structuredClone(rows.find(r=>r.owner===owner&&r.record.hash===hash)?.record||null)},
    async append(owner,record,expected){
      const previous=rows.findLast(r=>r.owner===owner&&r.record.thesis.companyKey===record.thesis.companyKey&&r.record.branch===record.branch)?.record;
      if((previous?.revision||0)!==expected)throw Error('REVISION_CONFLICT');
      rows.push({owner,record:structuredClone(record)});return record;
    },
  };
}
export function createThesisStore({getSql=getNeonSql}={}) {
  let setup;
  async function sql(){
    const db=getSql();
    if(!setup)setup=db.query(`CREATE TABLE IF NOT EXISTS bls_thesis_revisions_v1 (
      owner_id UUID NOT NULL REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
      company_key TEXT NOT NULL, ticker TEXT NOT NULL, branch TEXT NOT NULL,
      revision INTEGER NOT NULL, content_hash TEXT NOT NULL, payload TEXT NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(owner_id,company_key,branch,revision)
    )`).catch(e=>{setup=null;throw e});
    await setup;return db;
  }
  const parse=rows=>rows.map(r=>JSON.parse(r.payload));
  return {
    async list(owner,ticker){return parse(await (await sql()).query('SELECT payload FROM bls_thesis_revisions_v1 WHERE owner_id=$1 AND ticker=$2 ORDER BY saved_at DESC,revision DESC LIMIT 100',[owner,ticker]))},
    async latest(owner,company,branch){return parse(await (await sql()).query('SELECT payload FROM bls_thesis_revisions_v1 WHERE owner_id=$1 AND company_key=$2 AND branch=$3 ORDER BY revision DESC LIMIT 1',[owner,company,branch]))[0]||null},
    async findHash(owner,hash){return parse(await (await sql()).query('SELECT payload FROM bls_thesis_revisions_v1 WHERE owner_id=$1 AND content_hash=$2 LIMIT 1',[owner,hash]))[0]||null},
    async append(owner,record,expected){
      // One atomic statement + unique key: concurrent saves cannot overwrite or fork a revision silently.
      const rows=await (await sql()).query(`INSERT INTO bls_thesis_revisions_v1(owner_id,company_key,ticker,branch,revision,content_hash,payload,saved_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8::timestamptz
        WHERE COALESCE((SELECT MAX(revision) FROM bls_thesis_revisions_v1 WHERE owner_id=$1 AND company_key=$2 AND branch=$4),0)=$9
        ON CONFLICT DO NOTHING RETURNING revision`,[owner,record.thesis.companyKey,record.dossier.ticker,record.branch,record.revision,record.hash,JSON.stringify(record),record.savedAt,expected]);
      if(!rows.length)throw Error('REVISION_CONFLICT');return record;
    },
  };
}

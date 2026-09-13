import 'server-only';
import {getNeonSql} from './data/neon.js';
export function createMemoryCapitalStore(){
 const records=[];
 return {async list(owner,thesis){return structuredClone(records.filter(r=>r.owner===owner&&r.record.thesisHash===thesis).map(r=>r.record).reverse().slice(0,30))},
  async latestValuation(owner,thesis){return structuredClone(records.filter(r=>r.owner===owner&&r.record.thesisHash===thesis&&r.record.kind==='valuation')
   .map(r=>r.record).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||b.hash.localeCompare(a.hash))[0]||null)},
  async find(owner,id){return structuredClone(records.find(r=>r.owner===owner&&r.record.hash===id)?.record||null)},
  async append(owner,record){if(!records.some(r=>r.owner===owner&&r.record.hash===record.hash))records.push({owner,record:structuredClone(record)});return record}};
}
export function createCapitalStore({getSql=getNeonSql}={}){
 let setup;
 async function sql(){const db=getSql();if(!setup)setup=db.query(`CREATE TABLE IF NOT EXISTS bls_thesis_capital_v1 (
  owner_id UUID NOT NULL REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
  thesis_hash TEXT NOT NULL, content_hash TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, saved_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(owner_id,content_hash))`).catch(e=>{setup=null;throw e});await setup;return db}
 const parse=rows=>rows.map(r=>JSON.parse(r.payload));
 return {async list(owner,thesis){return parse(await (await sql()).query('SELECT payload FROM bls_thesis_capital_v1 WHERE owner_id=$1 AND thesis_hash=$2 ORDER BY saved_at DESC LIMIT 30',[owner,thesis]))},
  async latestValuation(owner,thesis){return parse(await (await sql()).query("SELECT payload FROM bls_thesis_capital_v1 WHERE owner_id=$1 AND thesis_hash=$2 AND kind='valuation' ORDER BY saved_at DESC, content_hash DESC LIMIT 1",[owner,thesis]))[0]||null},
  async find(owner,id){return parse(await (await sql()).query('SELECT payload FROM bls_thesis_capital_v1 WHERE owner_id=$1 AND content_hash=$2',[owner,id]))[0]||null},
  async append(owner,r){await (await sql()).query('INSERT INTO bls_thesis_capital_v1(owner_id,thesis_hash,content_hash,kind,payload,saved_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[owner,r.thesisHash,r.hash,r.kind,JSON.stringify(r),r.savedAt]);return r}};
}

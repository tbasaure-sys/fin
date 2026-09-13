import 'server-only';
import {hash} from '../research/filing-engine.mjs';
import {getNeonSql} from './data/neon.js';

// Retrieval clocks are not new economic evidence. Reused reports retain their ORIGINAL dossier.
export function reportKey(dossier,language,version){
  const {asOf,packetHash,...evidence}=dossier;
  return hash({version,language,evidence:{...evidence,sources:dossier.sources.map(({retrievedAt,...source})=>source)}});
}
export function makeRecord(dossier,analysis,now=Date.now()){
  const content={dossier,analysis,savedAt:now,expiresAt:now+86400000};
  return {...content,checksum:hash(content)};
}
// Intermediate work is a different record type: it never satisfies readRecord.
export function makeProgressRecord(dossier,checkpoint,notBefore=0,now=Date.now()){
  const content={kind:'analysis_progress',dossier,checkpoint,notBefore,savedAt:now,expiresAt:now+3600000};
  return {...content,checksum:hash(content)};
}
export function readProgressRecord(record,dossier,language,version,now=Date.now()){
  try{
    if(record?.kind!=='analysis_progress')return null;
    const {checksum,...content}=record;
    if(hash(content)!==checksum||!Number.isFinite(record.expiresAt)||record.expiresAt<=now
      ||!Number.isFinite(record.savedAt)||record.savedAt>now||!Number.isFinite(record.notBefore)||record.notBefore<0)return null;
    if(record.checkpoint.engineVersion!==version||record.checkpoint.language!==language||record.checkpoint.dossierHash!==hash(record.dossier))return null;
    const original=Date.parse(record.dossier.asOf),current=Date.parse(dossier.asOf);
    if(!Number.isFinite(original)||!Number.isFinite(current)||original>current)return null;
    if(reportKey(record.dossier,language,version)!==reportKey(dossier,language,version))return null;
    return record;
  }catch{return null}
}
export function readRecord(record,dossier,language,version,now=Date.now()){
  try {
    if(!record)return null;
    const {checksum,...content}=record;
    if(hash(content)!==checksum||record.expiresAt<=now||record.savedAt>now)return null;
    if(record.analysis.status!=='draft'||record.analysis.version!==version||record.analysis.language!==language)return null;
    if(record.analysis.dossierHash!==hash(record.dossier))return null;
    const originalCutoff=Date.parse(record.dossier.asOf),currentCutoff=Date.parse(dossier.asOf);
    if(!Number.isFinite(originalCutoff)||!Number.isFinite(currentCutoff)||originalCutoff>currentCutoff)return null;
    if(reportKey(record.dossier,language,version)!==reportKey(dossier,language,version))return null;
    return record;
  }catch{return null}
}

export function createReportStore({getSql=getNeonSql}={}){
  let setup;
  async function sql(){
    const db=getSql();
    if(!setup)setup=db.query(`CREATE TABLE IF NOT EXISTS bls_filing_reports_v1 (
      report_key TEXT PRIMARY KEY, payload TEXT, expires_at TIMESTAMPTZ,
      lease_token TEXT, lease_until TIMESTAMPTZ
    )`).catch(error=>{setup=null;throw error});
    await setup;return db;
  }
  return {
    async get(key){
      const payload=(await (await sql()).query('SELECT payload FROM bls_filing_reports_v1 WHERE report_key=$1 AND expires_at>NOW()',[key]))[0]?.payload;
      return payload?JSON.parse(payload):null;
    },
    async claim(key,token){
      const rows=await (await sql()).query(`INSERT INTO bls_filing_reports_v1(report_key,lease_token,lease_until)
        VALUES($1,$2,NOW()+INTERVAL '65 seconds') ON CONFLICT(report_key) DO UPDATE
        SET lease_token=$2,lease_until=NOW()+INTERVAL '65 seconds'
        WHERE bls_filing_reports_v1.lease_until IS NULL OR bls_filing_reports_v1.lease_until<NOW()
        RETURNING report_key`,[key,token]);return rows.length===1;
    },
    async save(key,token,record){
      const rows=await (await sql()).query(`UPDATE bls_filing_reports_v1 SET payload=$3,expires_at=$4::timestamptz
        WHERE report_key=$1 AND lease_token=$2 RETURNING report_key`,[key,token,JSON.stringify(record),new Date(record.expiresAt).toISOString()]);
      if(!rows.length)throw Error('REPORT_LEASE_LOST');
    },
    async release(key,token){await (await sql()).query('UPDATE bls_filing_reports_v1 SET lease_token=NULL,lease_until=NULL WHERE report_key=$1 AND lease_token=$2',[key,token])},
  };
}

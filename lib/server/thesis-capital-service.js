import 'server-only';
import {hash} from '../research/filing-engine.mjs';
import {defaultAssumptions,valueThesis,portfolioImpact} from '../research/thesis-valuation.mjs';
import {valuationRevision} from '../research/valuation-revision.mjs';
const checksum=/^[a-f0-9]{64}$/;
function checked(record){if(!record)return null;const {hash:id,...body}=record;if(hash(body)!==id)throw Error('CORRUPT_RECORD');return record}
export function createCapitalService({store,thesisStore,loadFinancial,readPortfolio,clock=()=>new Date()}){
 async function owned(owner,id){if(!owner||!checksum.test(id||''))throw Error('INVALID_CAPITAL_REQUEST');const r=checked(await thesisStore.findHash(owner,id));if(!r)throw Error('THESIS_NOT_FOUND');if(hash(r.dossier)!==r.evidenceHash)throw Error('CORRUPT_RECORD');return r}
 async function previous(owner,thesis){
  let current=thesis;const seen=new Set();
  // Same revision first, then its actual ancestry. Never another branch/owner.
  for(let depth=0;current&&depth<8;depth++){
   if(seen.has(current.hash))throw Error('CORRUPT_RECORD');seen.add(current.hash);
   const record=checked(await store.latestValuation(owner,current.hash));
   if(record){if(record.kind!=='valuation'||record.thesisHash!==current.hash)throw Error('CORRUPT_RECORD');return record}
   current=current.parentHash?await owned(owner,current.parentHash):null;
  }
  return null;
 }
 return {
  async list(owner,id){await owned(owner,id);return (await store.list(owner,id)).map(checked)},
  async run(owner,workspace,body){
   const allowed=body?.action==='load'?['action','thesisHash']:body?.action==='calculate'?['action','thesisHash','inputHash','assumptions']:[];
   if(!allowed.length||Object.keys(body).sort().join()!==allowed.sort().join())throw Error('INVALID_CAPITAL_REQUEST');
   const thesis=await owned(owner,body.thesisHash);let content,savedAt;
   if(body.action==='load'){
    const {financial,quote}=await loadFinancial(thesis.dossier);
    let portfolio;try{portfolio=await readPortfolio(owner,workspace)}catch{portfolio={status:'unavailable',holdings:[]}}
    content={kind:'inputs',financial,quote,portfolio,assumptions:defaultAssumptions(financial)};savedAt=clock().toISOString();
   }else{
    if(!checksum.test(body.inputHash||''))throw Error('INVALID_CAPITAL_REQUEST');
    const inputs=checked(await store.find(owner,body.inputHash));
    if(!inputs||inputs.kind!=='inputs'||inputs.thesisHash!==body.thesisHash)throw Error('INPUTS_NOT_FOUND');
    const at=clock().toISOString(),valuation=valueThesis(inputs.financial,body.assumptions,inputs.quote,at);savedAt=at;
    content={kind:'valuation',inputHash:inputs.hash,assumptions:structuredClone(body.assumptions),valuation,
     impact:portfolioImpact(inputs.portfolio,valuation,inputs.quote,at),
     // Self-contained export: exact inputs survive history pagination and later refreshes.
     financial:inputs.financial,quote:inputs.quote,portfolio:inputs.portfolio};
    const before=await previous(owner,thesis);
    content.revisionBridge=valuationRevision(before,{...content,savedAt});
    // Preserve enough to reproduce the comparison after pagination or an export,
    // but never recursively embed the previous record's own baseline/history.
    content.revisionBaseline=before?Object.fromEntries(['hash','kind','thesisHash','savedAt','financial','assumptions','quote','portfolio','valuation'].map(k=>[k,before[k]])):null;
   }
   const record={version:'bls-thesis-capital-record-v1',thesisHash:body.thesisHash,savedAt,...content};record.hash=hash(record);
   return store.append(owner,record);
  },
 };
}
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export function createCapitalHttp({authenticate,service}){
 return async request=>{
  const session=await authenticate(request);if(session instanceof Response)return session;
  try{
   if(request.method==='GET')return json({records:await service.list(session.user.id,new URL(request.url).searchParams.get('thesisHash')),historyLimit:30});
   if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
   const url=new URL(request.url),host=request.headers.get('host'),origin=host?`${url.protocol}//${host}`:url.origin;
   if(request.headers.get('origin')!==origin)return json({error:'ORIGIN_REJECTED'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'INVALID_CAPITAL_REQUEST'},400);
   let body;try{const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();return json({error:'REQUEST_TOO_LARGE'},413)}chunks.push(Buffer.from(value))}
    body=JSON.parse(Buffer.concat(chunks).toString());
   }catch{return json({error:'INVALID_CAPITAL_REQUEST'},400)}
   return json({record:await service.run(session.user.id,session.workspace.id,body)});
  }catch(e){
   if(['THESIS_NOT_FOUND','INPUTS_NOT_FOUND'].includes(e.message))return json({error:e.message},404);
   if(['INVALID_CAPITAL_REQUEST','INVALID_ASSUMPTIONS','IDENTITY_MISMATCH'].includes(e.message))return json({error:e.message},400);
   // Fixed error vocabulary: no SQL, private notes, holdings, keyed URLs or provider bodies in logs.
   if(e.message==='FINANCIAL_SOURCE_BUSY')return json({error:e.message},503);
   return json({error:'CAPITAL_UNAVAILABLE'},503);
  }
 };
}

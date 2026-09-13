import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dossier=require('../lib/research/published/MSFT.json');
const implementation=()=>import('../lib/server/filing-report-cache.js');

test('progress records cannot be published as reports or resumed against changed evidence',async()=>{
 const {makeProgressRecord,readProgressRecord,readRecord}=await implementation();
 const {hash}=await import('../lib/research/filing-engine.mjs');
 const now=Date.parse(dossier.asOf)+60000;
 const checkpoint={engineVersion:'test-v1',language:'es',dossierHash:hash(dossier)};
 const record=makeProgressRecord(dossier,checkpoint,now+20000,now);
 const fresh={...dossier,asOf:new Date(now).toISOString()};
 assert.deepEqual(readProgressRecord(record,fresh,'es','test-v1',now),record);
 assert.equal(readRecord(record,fresh,'es','test-v1',now),null);
 for(const [changed,lang,version] of [[{...fresh,sections:[]},'es','test-v1'],[fresh,'en','test-v1'],[fresh,'es','test-v2'],[{...fresh,asOf:'2000-01-01'},'es','test-v1']])
  assert.equal(readProgressRecord(record,changed,lang,version,now),null);
 assert.equal(readProgressRecord(record,fresh,'es','test-v1',now+3600001),null);
 assert.equal(readProgressRecord({...record,notBefore:0},fresh,'es','test-v1',now),null);
});

test('an interrupted report resumes under the same lease protocol and admission without exposing the draft',async()=>{
 const {createAnalysisHandler,generateAnalysis,signDossier}=await import('../lib/server/filing-analysis.js');
 const {referenceProviderPayload}=await import('./fixtures/reference-provider.mjs');
 const packet={...dossier,sections:dossier.sections.map(s=>({...s,extracts:s.extracts.slice(0,1)}))};
 const draft={sections:packet.sections.map(s=>({id:s.id,findings:[{kind:'interpretation',text:'La empresa describe sus actividades.',evidence:[{chunkId:s.extracts[0].id}]}],unknowns:[],checks:[]}))};
 const reviews={reviews:packet.sections.map(s=>({id:`${s.id}:0`,verdict:'supported',reason:'Está documentado.',support:[{chunkId:s.extracts[0].id,quote:s.extracts[0].text}]}))};
 let record=null,lease=null,calls=0,charged=0,failSave=false;
 const store={get:async()=>record,claim:async(_key,token)=>{if(lease)return false;lease=token;return true},release:async(_key,token)=>{assert.equal(lease,token);lease=null},
  save:async(_key,token,value)=>{assert.equal(lease,token);if(failSave)throw Error('offline');record=structuredClone(value)}};
 const handler=createAnalysisHandler({store,secret:()=> 'secret',consume:async()=>{charged++;return {allowed:true}},
  generate:(input,options)=>generateAnalysis(input,{...options,apiKey:'secret',diagnose:()=>{},fetcher:async()=>{
   calls++;if(calls===2)return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'20'}});
   // The fixture's reference converter uses the declared section chunk IDs.
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(referenceProviderPayload(calls===1?draft:reviews,packet))}}],usage:{total_tokens:12}});
  }})});
 const request=(input=packet)=>new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:'https://www.blsprime.com','Content-Type':'application/json'},body:JSON.stringify({dossier:input,ticket:signDossier(input,'secret')})});
 const first=await handler(request());assert.equal(first.status,202);assert.equal(first.headers.get('retry-after'),'20');
 const pending=await first.json();assert.equal(pending.resumable,true);assert.equal(pending.analysis,undefined);assert.equal(pending.checkpoint,undefined);
 assert.equal(calls,2);assert.equal(charged,2);assert.equal(lease,null);
 const waiting=await handler(request());assert.equal(waiting.status,202);assert.equal(calls,2);assert.equal(charged,2);
 const {makeProgressRecord}=await implementation();record=makeProgressRecord(record.dossier,record.checkpoint,0);
 const fresh={...packet,asOf:new Date(Date.parse(packet.asOf)+1000).toISOString()};
 const resumed=await handler(request(fresh));assert.equal(resumed.status,200);
 const result=await resumed.json();assert.equal(result.reportDossier.asOf,packet.asOf);assert.equal(calls,3);assert.equal(charged,2);
 assert.equal(result.analysis.sections.length,3);assert.ok(result.analysis.sections.every(s=>s.findings.length===1));
 const cached=await handler(request(fresh));assert.equal(cached.status,200);assert.equal((await cached.json()).cached,true);assert.equal(calls,3);
 // A storage outage must stop a new job before any external inference.
 record=null;failSave=true;const failed=await handler(request());assert.equal(failed.status,503);assert.equal((await failed.json()).error,'REPORT_STORAGE_UNAVAILABLE');assert.equal(calls,3);assert.equal(lease,null);
});

test('stored reports preserve exact dossier serialization and lease ownership',async()=>{
 const {createReportStore}=await implementation();let payload,queries=[];
 const store=createReportStore({getSql:()=>({query:async(sql,args)=>{queries.push(sql);if(sql.startsWith('SELECT'))return payload?[{payload}]:[];if(sql.startsWith('UPDATE')&&sql.includes('SET payload'))payload=args[2];return [{report_key:'key'}]}})});
 const record={z:1,a:{z:2,a:3},dossier};
 assert.equal(await store.get('key'),null);assert.equal(await store.claim('key','owner'),true);
 await store.save('key','owner',{...record,expiresAt:Date.now()+1000});
 assert.equal(JSON.stringify((await store.get('key')).dossier),JSON.stringify(dossier));
 assert.ok(queries[0].includes('payload TEXT'));assert.ok(queries.some(q=>q.includes('lease_token=$2')));
});

test('cache hits bypass generation budgets, pending leases do not duplicate work, failures release leases',async()=>{
 const {makeRecord}=await implementation();const {createAnalysisHandler,VERSION,signDossier}=await import('../lib/server/filing-analysis.js');
 const {hash}=await import('../lib/research/filing-engine.mjs');
 const analysis={version:VERSION,status:'draft',language:'es',dossierHash:hash(dossier)};
 const record=makeRecord(dossier,analysis);let released=0,reads=0;
 const request=()=>new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:'https://www.blsprime.com','Content-Type':'application/json'},body:JSON.stringify({dossier,ticket:signDossier(dossier,'secret')})});
 const options={secret:()=> 'secret',consume:()=>assert.fail('cached and pending requests do not consume budgets'),generate:()=>assert.fail('must not regenerate')};
 const hit=await createAnalysisHandler({...options,store:{get:async()=>record}})(request());
 assert.equal(hit.status,200);assert.equal((await hit.json()).cached,true);
 assert.equal((await createAnalysisHandler({...options,store:{get:async()=>null,claim:async()=>false}})(request())).status,202);
 const raced=await createAnalysisHandler({...options,store:{get:async()=>++reads===1?null:record,claim:async()=>true,release:async()=>released++}})(request());
 assert.equal(raced.status,200);assert.equal(released,1);
 const fail=await createAnalysisHandler({...options,consume:async()=>({allowed:true}),generate:async()=>{throw Error('PROVIDER_RATE_LIMIT')},store:{get:async()=>null,claim:async()=>true,release:async()=>released++}})(request());
 assert.equal(fail.status,429);assert.equal(released,2);
});

test('report reuse ignores retrieval times, not evidence, language, cutoff or engine changes',async()=>{
 const {reportKey,makeRecord,readRecord}=await implementation();
 const now=Date.parse(dossier.asOf)+60000;
 const analysis={version:'test-v1',status:'draft',dossierHash:(await import('../lib/research/filing-engine.mjs')).hash(dossier),language:'es',generatedAt:new Date(now).toISOString()};
 const record=makeRecord(dossier,analysis,now);
 const fresh={...dossier,asOf:new Date(now+1000).toISOString(),packetHash:'new-retrieval',sources:dossier.sources.map(s=>({...s,retrievedAt:new Date(now).toISOString()}))};
 assert.equal(reportKey(fresh,'es','test-v1'),reportKey(dossier,'es','test-v1'));
 assert.deepEqual(readRecord(record,fresh,'es','test-v1',now+1000),record);
 for(const changed of [{...fresh,name:'Different issuer'},{...fresh,sections:[]},{...fresh,sources:[]},{...fresh,asOf:'2000-01-01T00:00:00Z'}])assert.equal(readRecord(record,changed,'es','test-v1',now+1000),null);
 assert.equal(readRecord(record,fresh,'en','test-v1',now+1000),null);
 assert.equal(readRecord(record,fresh,'es','test-v2',now+1000),null);
 assert.equal(readRecord(record,fresh,'es','test-v1',now+86400001),null);
 assert.equal(readRecord({...record,analysis:{...analysis,status:'invented'}},fresh,'es','test-v1',now+1000),null);
});

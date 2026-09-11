import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dossier=require('../lib/research/published/MSFT.json');
const implementation=()=>import('../lib/server/filing-report-cache.js');

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

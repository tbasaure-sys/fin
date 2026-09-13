import test from 'node:test';
import assert from 'node:assert/strict';
import {signDossier} from '../lib/server/filing-analysis.js';
const dossier={ticker:'TEST',cik:1,asOf:'2026-09-13T00:00:00Z',sources:[]};
async function handler(deps){const mod=await import('../lib/server/financial-reading-service.js').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {}});assert.equal(typeof mod.createFinancialReadingHandler,'function');return mod.createFinancialReadingHandler(deps)}
const request=(body,origin='https://example.com')=>new Request('https://example.com/api/research/financial-reading',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('financial reading requires authentication and a signed, same-origin dossier before any source call',async()=>{
 let authorized=false,calls=0;
 const h=await handler({authenticate:async()=>authorized?{user:{id:'owner'}}:Response.json({error:'AUTH_REQUIRED'},{status:401}),secret:()=> 'test-secret',consume:async()=>({allowed:true}),load:async()=>{calls++;return {financial:{ticker:'TEST',asOf:dossier.asOf,history:[]}}}});
 const body={dossier,ticket:signDossier(dossier,'test-secret')};
 assert.equal((await h(request(body))).status,401);authorized=true;
 assert.equal((await h(request(body,'https://foreign.example'))).status,403);
 assert.equal((await h(request({...body,dossier:{...dossier,ticker:'OTHER'}}))).status,409);
 assert.equal(calls,0);
 const response=await h(request(body));assert.equal(response.status,200);assert.equal(calls,1);
 const result=await response.json();assert.equal(result.reading.status,'unresolved');assert.match(result.dossierHash,/^[a-f0-9]{64}$/);
});
test('malformed and oversized requests cannot consume provider capacity',async()=>{
 const h=await handler({authenticate:async()=>({user:{id:'owner'}}),secret:()=> 'test-secret',consume:()=>assert.fail('no budget consumption'),load:()=>assert.fail('no provider call')});
 for(const body of [null,[],{dossier},{dossier,ticket:'wrong',extra:true}])assert.equal((await h(request(body))).status,400);
 assert.equal((await h(request({dossier:'a'.repeat(91000)}))).status,413);
});
test('source failures use a bounded error vocabulary, not raw provider errors or keyed URLs',async()=>{
 const h=await handler({authenticate:async()=>({user:{id:'owner'}}),secret:()=> 'test-secret',consume:async()=>({allowed:true}),load:async()=>{throw Error('provider url apikey=private-value')}});
 const r=await h(request({dossier,ticket:signDossier(dossier,'test-secret')}));assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{error:'FINANCIAL_SOURCE_UNAVAILABLE'});
});

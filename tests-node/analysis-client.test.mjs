import test from 'node:test';import assert from 'node:assert/strict';
import {requestAnalysis} from '../lib/research/analysis-client.mjs';
test('pending reports are polled but quota or auth failures never generate an automatic request loop',async()=>{
 let calls=0;const waits=[],original={asOf:'2026-01-01'};
 const result=await requestAnalysis({},{fetcher:async()=>++calls===1?Response.json({pending:true},{status:202}):Response.json({analysis:{status:'draft',sections:[]},reportDossier:original,cached:true}),wait:async ms=>waits.push(ms)});
 assert.equal(calls,2);assert.deepEqual(waits,[3000]);assert.deepEqual(result.reportDossier,original);assert.equal(result.cached,true);
 calls=0;await assert.rejects(()=>requestAnalysis({},{fetcher:async()=>{calls++;return Response.json({error:'PROVIDER_RATE_LIMIT'},{status:429,headers:{'retry-after':'32'}})}}),e=>e.retryAfterSeconds===32);assert.equal(calls,1);
 await assert.rejects(()=>requestAnalysis({},{fetcher:async()=>Response.json({},{status:401})}),/AUTH_REQUIRED/);
});

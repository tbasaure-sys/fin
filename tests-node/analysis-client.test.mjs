import test from 'node:test';import assert from 'node:assert/strict';
import {requestAnalysis} from '../lib/research/analysis-client.mjs';
test('resumable polling respects provider waits rather than hammering the endpoint every three seconds',async()=>{
 let calls=0;const waits=[];
 await requestAnalysis({},{fetcher:async()=>++calls<3?Response.json({pending:true,resumable:true,retryAfterSeconds:calls===1?20:120},{status:202}):Response.json({analysis:{status:'draft',sections:[]}}),wait:async ms=>waits.push(ms)});
 assert.equal(calls,3);assert.deepEqual(waits,[20000,60000]);
});
test('an abort while awaiting persisted work reports pending, but an unrelated network abort does not',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(()=>requestAnalysis({},{signal:controller.signal,fetcher:async()=>{calls++;return Response.json({pending:true,resumable:true},{status:202})},wait:async()=>controller.abort()}),/REPORT_PENDING/);
 assert.equal(calls,1);
 await assert.rejects(()=>requestAnalysis({},{signal:AbortSignal.abort(),fetcher:()=>assert.fail('already aborted')}),e=>e.name==='AbortError');
});
test('default pending wait is immediately interruptible and never turns an auth failure into pending',async()=>{
 const controller=new AbortController();
 const operation=requestAnalysis({},{signal:controller.signal,fetcher:async()=>{setTimeout(()=>controller.abort(),5);return Response.json({pending:true,resumable:true,retryAfterSeconds:60},{status:202})}});
 await assert.rejects(()=>operation,/REPORT_PENDING/);
 let calls=0;
 await assert.rejects(()=>requestAnalysis({},{fetcher:async()=>++calls===1?Response.json({pending:true,resumable:true},{status:202}):Response.json({},{status:401}),wait:async()=>{}}),/AUTH_REQUIRED/);
});
test('pending reports are polled but quota or auth failures never generate an automatic request loop',async()=>{
 let calls=0;const waits=[],original={asOf:'2026-01-01'};
 const result=await requestAnalysis({},{fetcher:async()=>++calls===1?Response.json({pending:true},{status:202}):Response.json({analysis:{status:'draft',sections:[]},reportDossier:original,cached:true}),wait:async ms=>waits.push(ms)});
 assert.equal(calls,2);assert.deepEqual(waits,[3000]);assert.deepEqual(result.reportDossier,original);assert.equal(result.cached,true);
 calls=0;await assert.rejects(()=>requestAnalysis({},{fetcher:async()=>{calls++;return Response.json({error:'PROVIDER_RATE_LIMIT'},{status:429,headers:{'retry-after':'32'}})}}),e=>e.retryAfterSeconds===32);assert.equal(calls,1);
 await assert.rejects(()=>requestAnalysis({},{fetcher:async()=>Response.json({},{status:401})}),/AUTH_REQUIRED/);
});

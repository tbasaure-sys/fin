import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
async function api(){const m=await import('../scripts/claim-review-trial.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {}});assert.equal(typeof m.prepareTrial,'function','a frozen claim trial must be runnable');return m;}
const dossier={sections:[{extracts:[{id:'D1:1',text:'The company sells products.'},{id:'D2:1',text:'The company may repay debt.'}]}]};
const cases=[{id:'faithful',text:'The company sells products.',chunkIds:['D1:1'],expected:true,requiredSupport:['sells products']},{id:'unsupported',text:'Debt repayment is guaranteed.',chunkIds:['D2:1'],expected:false}];
const response=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({c0:{scope:'entailed',relationship:'entailed',qualification:'entailed',gap:'',evidence:{s0:{first:0,last:0}}}})}}],usage:{total_tokens:10}});
async function temp(run){const parent=await mkdtemp(join(tmpdir(),'bls-claim-trial-test-'));try{return await run(join(parent,'run'))}finally{await rm(parent,{recursive:true,force:true})}}

test('each frozen provider request contains one claim and no case labels or unrelated sources',async()=>temp(async directory=>{
 const m=await api(),manifest=await m.prepareTrial({directory,dossier,cases,notBefore:200});
 assert.equal(manifest.jobs.length,2);
 for(const [i,job] of manifest.jobs.entries()){
  const input=JSON.parse(job.request.messages[1].content);assert.equal(Object.keys(input.claims).length,1);
  assert.equal(input.claims.c0.text,cases[i].text);assert.ok(!job.request.messages[1].content.includes('expected'));
 }
 assert.ok(!manifest.jobs[0].request.messages[1].content.includes('repay debt'));
 await assert.rejects(()=>m.prepareTrial({directory,dossier,cases,notBefore:200}),/EEXIST/);
}));

test('a provider cooldown prevents requests and the one-call resume never repeats a recorded result',async()=>temp(async directory=>{
 const m=await api();await m.prepareTrial({directory,dossier,cases,notBefore:200});let calls=0;
 const fetcher=async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).messages[1].content.includes('expected'),false);return response()};
 assert.equal((await m.runTrial({directory,live:true,apiKey:'test',now:()=>100,fetcher})).status,'waiting');assert.equal(calls,0);
 let r=await m.runTrial({directory,live:true,apiKey:'test',now:()=>200,fetcher});assert.equal(calls,1);assert.equal(r.next,1);assert.equal(r.status,'ready_for_next');
 assert.equal(r.summary.passed,false,'an unfinished suite cannot pass after its first positive control');
 r=await m.runTrial({directory,live:true,apiKey:'test',now:()=>200,fetcher});assert.equal(calls,2);assert.equal(r.status,'finished');
 assert.equal(r.summary.falseApprovals,1,'accepting every claim must fail the negative control');assert.equal(r.summary.passed,false);
 await m.runTrial({directory,live:true,apiKey:'test',now:()=>200,fetcher});assert.equal(calls,2);
}));

test('an invalid citation cannot hide the models approval of an unsupported assertion',async()=>temp(async directory=>{
 const m=await api();await m.prepareTrial({directory,dossier,cases:[cases[1]],notBefore:0});
 const fetcher=async()=>{const raw=await response().json();const review=JSON.parse(raw.choices[0].message.content);review.c0.evidence.s0={first:-1,last:-1};raw.choices[0].message.content=JSON.stringify(review);return Response.json(raw)};
 const r=await m.runTrial({directory,live:true,apiKey:'test',now:()=>200,fetcher});
 assert.equal(r.summary.falseApprovals,0);
 assert.equal(r.summary.modelFalseApprovals,1);
 assert.equal(r.summary.passed,false);
}));

test('a rate-limit response preserves the current case and its retry-after deadline',async()=>temp(async directory=>{
 const m=await api();await m.prepareTrial({directory,dossier,cases,notBefore:0});let calls=0;
 const fetcher=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'60'}})};
 const r=await m.runTrial({directory,live:true,apiKey:'test',now:()=>1000,fetcher});
 assert.equal(r.status,'cooldown');assert.equal(r.notBefore,61000);assert.equal(r.next,0);assert.equal(r.calls,1);
 await m.runTrial({directory,live:true,apiKey:'test',now:()=>2000,fetcher});assert.equal(calls,1);
 const saved=await readFile(join(directory,'response-1.json'),'utf8');assert.ok(!saved.includes('Authorization'));
}));

test('a correct positive verdict with a heading-only citation cannot pass the trial',async()=>temp(async directory=>{
 const m=await api(),d=structuredClone(dossier);d.sections[0].extracts[0].text='Business overview.\nThe company sells products.';
 await m.prepareTrial({directory,dossier:d,cases:[cases[0]],notBefore:0});
 const r=await m.runTrial({directory,live:true,apiKey:'test',now:()=>200,fetcher:response});
 assert.equal(r.results[0].review.accepted,true,'the protocol itself only knows that the reference exists');
 assert.equal(r.summary.supportFailures,1,'fixed evidence expectations must catch irrelevant but valid references');
 assert.equal(r.summary.passed,false);
}));

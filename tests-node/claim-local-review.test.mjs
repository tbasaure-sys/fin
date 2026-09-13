import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hash} from '../lib/research/filing-engine.mjs';
import {validateAnalysis,applyReferenceAnalysisReview} from '../lib/server/filing-analysis.js';
const load=async name=>JSON.parse(await readFile(new URL(`./fixtures/${name}`,import.meta.url),'utf8'));
async function api(){const m=await import('../lib/research/claim-local-review.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {}});assert.equal(typeof m.prepareClaimReview,'function','claim-local protocol must exist');return m;}
const dossier={sections:[{extracts:[{id:'D1:1',text:'Products margin improved in the third quarter.\nServices margin percentage was flat.'},{id:'D2:1',text:'The company may refinance debt.\nNo guarantee is stated.'}]}]};
const claims=[{id:'business:0',text:'Products margin improved in the third quarter.',chunkIds:['D1:1']},{id:'cash:0',text:'The company may refinance debt.',chunkIds:['D2:1']}];
const row=()=>({scope:'entailed',relationship:'entailed',qualification:'entailed',gap:'',evidence:{s0:{first:0,last:0}}});

test('model input and output schemas keep each claim bound to only its cited sources',async()=>{
 const m=await api(),p=m.prepareClaimReview(claims,dossier);
 assert.deepEqual(p.input.claims.c0.sources.s0,['Products margin improved in the third quarter.','Services margin percentage was flat.']);
 assert.deepEqual(p.input.claims.c1.sources.s0,['The company may refinance debt.','No guarantee is stated.']);
 assert.equal(p.input.claims.c0.text,claims[0].text);
 assert.deepEqual(p.schema.required,['c0','c1']);
 assert.equal(p.schema.properties.c0.properties.evidence.properties.s0.properties.last.maximum,1);
 assert.equal(p.schema.additionalProperties,false);
 assert.ok(!JSON.stringify(p.input).includes('business:0'),'diagnostic case identity is not a model hint');
});

test('all three semantic dimensions must agree, and gaps must come from the original claim',async()=>{
 const m=await api(),p=m.prepareClaimReview(claims,dossier),raw={c0:row(),c1:row()};
 assert.equal(m.resolveClaimReview(raw,p)[0].accepted,true);
 for(const axis of ['scope','relationship','qualification']){
  const bad=structuredClone(raw);bad.c0[axis]='not_established';bad.c0.gap='third quarter';
  const result=m.resolveClaimReview(bad,p);assert.equal(result[0].accepted,false);assert.equal(result[0].verdict,'unsupported');assert.equal(result[1].accepted,true);
 }
 raw.c0.scope='uncertain';raw.c0.gap='third quarter';assert.equal(m.resolveClaimReview(raw,p)[0].verdict,'uncertain');
 raw.c0.gap='An invented allegation';assert.throws(()=>m.resolveClaimReview(raw,p),/INVALID_CLAIM_REVIEW/);
});

test('source ranges preserve complete long evidence without a twelve-line truncation',async()=>{
 const m=await api(),text=Array.from({length:20},(_,i)=>`Statement ${i}.`).join('\n');
 const p=m.prepareClaimReview([{id:'long',text:'Statement 0.',chunkIds:['D1:1']}],{sections:[{extracts:[{id:'D1:1',text}]}]});
 const r=m.resolveClaimReview({c0:{...row(),evidence:{s0:{first:0,last:19}}}},p)[0];
 assert.equal(r.accepted,true);assert.equal(r.support[0].quote,text);assert.equal(r.support[0].end,text.length);
 assert.equal(r.semanticVerification,'experimental_model_judgment_not_certification');
});

test('foreign, missing and invalid ranges never provide support',async()=>{
 const m=await api(),p=m.prepareClaimReview(claims,dossier),raw={c0:row(),c1:row()};
 for(const range of [{first:-1,last:-1},{first:1,last:0},{first:0,last:99}]){
  const bad=structuredClone(raw);bad.c0.evidence.s0=range;
  const r=m.resolveClaimReview(bad,p)[0];assert.equal(r.accepted,false);assert.equal(r.provenanceValid,false);
 }
 raw.c0.evidence={s1:{first:0,last:0}};assert.throws(()=>m.resolveClaimReview(raw,p),/INVALID_CLAIM_REVIEW/);
 assert.throws(()=>m.resolveClaimReview({c0:row()},p),/INVALID_CLAIM_REVIEW/);
});

test('multi-source assertions require evidence from every originally cited source',async()=>{
 const m=await api(),p=m.prepareClaimReview([{id:'combined',text:'A compound claim.',chunkIds:['D1:1','D2:1']}],dossier);
 const raw={c0:{...row(),evidence:{s0:{first:0,last:0},s1:{first:-1,last:-1}}}};
 assert.equal(m.resolveClaimReview(raw,p)[0].accepted,false);
 raw.c0.evidence.s1={first:0,last:0};assert.deepEqual(m.resolveClaimReview(raw,p)[0].support.map(s=>s.chunkId),['D1:1','D2:1']);
});

test('the actual Apple failure retains semantic false approvals even though format blocked publication',async()=>{
 const recorded=await load('aapl-recorded-review-v114.json'),fixture=await load('aapl-recorded-date-repair.json');
 assert.equal(hash(fixture.dossier),recorded.dossierHash);
 const falseApprovals=recorded.checks.mustNotPublishUnchanged.filter(c=>recorded.review.reviews.find(r=>r.id===c.id).verdict==='supported').map(c=>c.id);
 assert.deepEqual(falseApprovals,['business:1','business:2','cash:2']);
 assert.throws(()=>applyReferenceAnalysisReview(validateAnalysis(recorded.draft,fixture.dossier),recorded.review,fixture.dossier),/INVALID_ANALYSIS/);
 const m=await api(),inputClaims=recorded.draft.sections.flatMap(s=>s.findings.map((f,i)=>({id:`${s.id}:${i}`,text:f.text,chunkIds:f.evidence.map(e=>e.chunkId)})));
 const p=m.prepareClaimReview(inputClaims,fixture.dossier);
 assert.equal(p.input.claims.c5.text,inputClaims[5].text);
 assert.ok(!JSON.stringify(p.input.claims.c5).includes('Repayments of term debt'),'cash-flow evidence not cited by the debt claim cannot leak into its local packet');
 assert.ok(!JSON.stringify(p.input).includes('mustNotPublishUnchanged'));
});

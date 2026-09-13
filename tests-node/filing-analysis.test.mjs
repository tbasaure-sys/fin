import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {referenceProviderPayload} from './fixtures/reference-provider.mjs';
const require=createRequire(import.meta.url);
const dossier=require('../lib/research/published/MSFT.json');
// Removing quote validation, signature binding or the resource gate must break these tests.
const moduleUrl=new URL('../lib/server/filing-analysis.js',import.meta.url);
async function implementation(){let mod;try{mod=await import(moduleUrl.href)}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}assert.ok(mod,'filing analysis implementation must exist');return mod}
function answer(){return {sections:dossier.sections.map(s=>({id:s.id,findings:[{kind:'interpretation',text:'La evidencia requiere contrastar inversión y caja.',evidence:[{chunkId:s.extracts[0].id}]}],unknowns:['No se conoce el capex de mantenimiento.'],checks:['Contrastar contra el siguiente informe trimestral.']}))}}
function supportedReviews(){return dossier.sections.map(s=>({id:`${s.id}:0`,verdict:'supported',reason:'Lectura acotada.',allClausesSupported:true,scopeLimited:true,catalystStatus:'not_claimed',support:[{chunkId:s.extracts[0].id,quote:s.extracts[0].text.slice(0,90)}]}))}
const completionResponse=raw=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(referenceProviderPayload(raw,dossier))}}],usage:{total_tokens:12}});

test('a persisted draft resumes at review after quota interruption without generating it again',async()=>{
 const m=await implementation();let progress,calls=0;
 const onCheckpoint=async state=>{progress=structuredClone(state)};
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',onCheckpoint,diagnose:()=>{},wait:()=>assert.fail('persisted work yields instead of holding a server request'),fetcher:async()=>{
  calls++;return calls===1?completionResponse(answer()):Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'20'}});
 }}),e=>e.message==='REPORT_PENDING'&&e.retryAfterSeconds===20);
 assert.equal(calls,2);assert.ok(progress.completed.draft);
 const result=await m.generateAnalysis(dossier,{apiKey:'secret',resume:progress,onCheckpoint,diagnose:()=>{},fetcher:async(_url,options)=>{
  calls++;assert.ok(JSON.parse(options.body).response_format.json_schema.schema.properties.reviews,'the draft must not be requested a second time');
  return completionResponse({reviews:supportedReviews()});
 }});
 assert.equal(calls,3);assert.equal(result.attempts.filter(a=>a.stage==='draft').length,1);
 assert.equal(result.totalTokens,24);assert.ok(result.sections.every(s=>s.findings.length===1));
 for(const [changed,language] of [[{...dossier,name:'changed issuer'},'es'],[dossier,'en']])
  await assert.rejects(()=>m.generateAnalysis(changed,{apiKey:'secret',resume:progress,language,diagnose:()=>{},fetcher:()=>assert.fail('must reject incompatible progress before inference')}),/INVALID_CHECKPOINT/);
});

test('progress persistence failure prevents a provider call rather than silently losing resumability',async()=>{
 const m=await implementation();let calls=0;
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},onCheckpoint:async()=>{throw Error('storage error')},fetcher:async()=>{calls++;return completionResponse(answer())}}),/REPORT_STORAGE_UNAVAILABLE/);
 assert.equal(calls,0);
});

test('agenda references to known spans resolve to their source without discarding useful questions',async()=>{
 const m=await implementation();const {reviewReferences}=await import('../lib/research/reference-review.mjs');
 const draft=m.validateAnalysis(answer(),dossier);
 const packet=reviewReferences(draft.sections.flatMap(s=>s.findings.map((f,i)=>({id:`${s.id}:${i}`,text:f.text,chunkIds:f.evidence.map(e=>e.chunkId)}))),dossier);
 const source=packet.sources[0],span=source.spans[0].id;
 const raw=referenceProviderPayload({reviews:supportedReviews()},dossier);
 raw.agenda=[{id:'business:unknowns:0',verdict:'relevant',reason:'Pregunta motivada por la fuente.',sourceIds:[span]}];
 const result=m.applyReferenceAnalysisReview(draft,raw,dossier);
 assert.equal(result.sections[0].unknowns.length,1);
 assert.deepEqual(result.review.agendaAssessments[0].sourceIds,[source.chunkId]);
 assert.deepEqual(result.review.agendaAssessments[0].originalSourceIds,[span]);
 raw.agenda[0].sourceIds=[span,'invented:1'];
 assert.equal(m.applyReferenceAnalysisReview(draft,raw,dossier).sections[0].unknowns.length,0,'a valid reference must not launder an unknown reference');
 raw.agenda[0].sourceIds=[source.chunkId];
 assert.equal(m.applyReferenceAnalysisReview(draft,raw,dossier).sections[0].unknowns.length,1);
});

test('resuming cannot reset the provider call budget or change a stage request',async()=>{
 const m=await implementation();let progress,calls=0;
 const options={apiKey:'secret',diagnose:()=>{},onCheckpoint:async state=>{progress=structuredClone(state)},fetcher:async()=>{calls++;return Response.json({},{status:429,headers:{'retry-after':'1'}})}};
 for(let i=0;i<16;i++)await assert.rejects(()=>m.generateAnalysis(dossier,{...options,resume:progress}),/REPORT_PENDING/);
 await assert.rejects(()=>m.generateAnalysis(dossier,{...options,resume:progress}),/REPORT_ATTEMPTS_EXHAUSTED/);
 assert.equal(calls,16);
 const incompatible=structuredClone(progress);incompatible.providerCalls=1;incompatible.work.draft.fingerprint='changed';
 await assert.rejects(()=>m.generateAnalysis(dossier,{...options,resume:incompatible}),/INVALID_CHECKPOINT/);assert.equal(calls,16);
});

test('quota during reconstruction stays pending and resumes without publishing an intermediate report',async()=>{
 const m=await implementation();let progress,calls=0;
 const options={apiKey:'secret',diagnose:()=>{},onCheckpoint:async state=>{progress=structuredClone(state)}};
 await assert.rejects(()=>m.generateAnalysis(dossier,{...options,fetcher:async()=>{
  calls++;
  if(calls===3)return Response.json({},{status:429,headers:{'retry-after':'15'}});
  if(calls===1)return completionResponse(answer());
  const reviews=supportedReviews();reviews[0]={...reviews[0],verdict:'unsupported',reason:'La inferencia no consta.',support:[]};
  return completionResponse({reviews});
 }}),/REPORT_PENDING/);
 assert.ok(progress.completed.review);assert.equal(calls,3);
 const result=await m.generateAnalysis(dossier,{...options,resume:progress,fetcher:async()=>completionResponse(++calls===4?answer():{reviews:supportedReviews()})});
 assert.equal(calls,5);assert.equal(result.reconstruction.status,'recovered');assert.equal(result.sections[0].findings.length,1);
 assert.equal(result.attempts.filter(a=>a.stage==='draft').length,1);assert.equal(result.totalTokens,48);
});

test('an interrupted format repair keeps the original candidate instead of restarting the draft',async()=>{
 const m=await implementation();let progress,calls=0;
 const malformed=answer();malformed.sections[0].checks=['Confirmar capex de 10 millones'];
 const onCheckpoint=async state=>{progress=structuredClone(state)};
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',onCheckpoint,diagnose:()=>{},fetcher:async()=>++calls===1?completionResponse(malformed):Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'60'}})}),/REPORT_PENDING/);
 await m.generateAnalysis(dossier,{apiKey:'secret',resume:progress,onCheckpoint,diagnose:()=>{},fetcher:async(_url,options)=>{
  calls++;if(calls===3){assert.ok(JSON.stringify(JSON.parse(options.body).messages).includes('Confirmar capex de 10 millones'));return completionResponse(answer())}
  return completionResponse({reviews:supportedReviews()});
 }});
 assert.equal(calls,4);
});

test('format repair uses the draft, not a duplicate full evidence packet',async()=>{
 const m=await implementation();let calls=0;
 await m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},fetcher:async(_url,options)=>{
  const body=JSON.parse(options.body);calls++;
  if(calls===1){const raw=answer();raw.sections[0].checks=['Confirmar capex de 10 millones'];return completionResponse(raw)}
  if(calls===2){assert.ok(!JSON.stringify(body.messages).includes(dossier.sections[0].extracts[0].text.slice(0,120)));assert.ok(JSON.stringify(body.messages).includes('Confirmar capex de 10 millones'));return completionResponse(answer())}
  return completionResponse({reviews:supportedReviews()});
 }});assert.equal(calls,3);
});

test('provider retry-after is honored once within the deadline, never guessed',async()=>{
 const m=await implementation();let calls=0;const waits=[];
 await m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},wait:async ms=>waits.push(ms),fetcher:async(_url,options)=>{
  calls++;if(calls===1)return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'Retry-After':'2'}});
  return completionResponse(JSON.parse(options.body).response_format.json_schema.schema.properties.sections?answer():{reviews:supportedReviews()});
 }});
 assert.equal(calls,3);assert.deepEqual(waits,[2000]);
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},wait:()=>assert.fail('must not wait hours'),fetcher:async()=>new Response('',{status:429,headers:{'Retry-After':'7200'}})}),e=>e.message==='PROVIDER_RATE_LIMIT'&&e.retryAfterSeconds===7200);
});

test('oversized provider requests are not treated as transient capacity or retried',async()=>{
 const m=await implementation();let calls=0;
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},wait:()=>assert.fail('waiting cannot reduce request size'),fetcher:async()=>{
  calls++;return Response.json({error:{code:'rate_limit_exceeded',message:'Request too large; private provider details'}},{status:413,headers:{'Retry-After':'4'}});
 }}),e=>e.message==='PROVIDER_REQUEST_TOO_LARGE'&&e.retryAfterSeconds===undefined);
 assert.equal(calls,1);
 const handler=m.createAnalysisHandler({secret:()=> 'secret',consume:async()=>({allowed:true}),generate:async()=>{throw Error('PROVIDER_REQUEST_TOO_LARGE')}});
 const response=await handler(new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:'https://www.blsprime.com','Content-Type':'application/json'},body:JSON.stringify({dossier,ticket:m.signDossier(dossier,'secret')})}));
 const body=await response.json();assert.equal(response.status,503);assert.equal(body.error,'PROVIDER_REQUEST_TOO_LARGE');assert.equal(body.retryAfterSeconds,null);assert.equal(response.headers.get('retry-after'),null);
});

test('an explicit token-cap rejection reduces only the output reservation once, preserving all evidence',async()=>{
 const m=await implementation();const sent=[],diagnostics=[];
 const result=await m.generateAnalysis(dossier,{apiKey:'secret',diagnose:e=>diagnostics.push(e),fetcher:async(_url,options)=>{
  const request=JSON.parse(options.body);sent.push(request);
  if(sent.length===1)return Response.json({error:{code:'rate_limit_exceeded',message:'Request too large. Limit 8000, Requested 9471. private-account-name'}},{status:413,headers:{'x-ratelimit-limit-tokens':'8000'}});
  if(sent.length===2){
   assert.deepEqual(request.messages,sent[0].messages);assert.deepEqual(request.response_format,sent[0].response_format);
   assert.ok(request.max_completion_tokens>=2048,'do not trade completeness for an arbitrarily small output');
   assert.ok(request.max_completion_tokens+3971<8000,'fit the observed reservation envelope with headroom');
   return completionResponse(answer());
  }
  return completionResponse({reviews:supportedReviews()});
 }});
 assert.equal(sent.length,3);assert.ok(result.sections.every(s=>s.findings.length===1));
 assert.ok(diagnostics.some(e=>e.code==='provider_capacity_adjustment'));
 assert.ok(!JSON.stringify(diagnostics).includes('private-account-name'));
 assert.equal(result.attempts[0].maxCompletionTokens,sent[1].max_completion_tokens);
});

test('capacity adaptation never loops, trusts contradictory limits, or squeezes an impossible request',async()=>{
 const m=await implementation();
 for(const [message,header,wantCalls] of [
  ['Limit 8000, Requested 9471','8000',2],
  ['Limit 8000, Requested 9471','4000',1],
  ['Limit 8000, Requested 20000','8000',1],
  ['Limit 8000, Requested 9471',null,1],
 ]){
  let calls=0;
  await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},wait:()=>assert.fail('size is not a time-based limit'),fetcher:async()=>{
   calls++;return Response.json({error:{code:'rate_limit_exceeded',message}},{status:413,headers:header?{'x-ratelimit-limit-tokens':header}:{}});
  }}),e=>e.message==='PROVIDER_REQUEST_TOO_LARGE');
  assert.equal(calls,wantCalls);
 }
});

test('a reduced reservation never licenses a truncated report or resets its ceiling during format repair',async()=>{
 const m=await implementation();const sent=[];
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},fetcher:async(_url,options)=>{
  const request=JSON.parse(options.body);sent.push(request);
  if(sent.length===1)return Response.json({error:{code:'rate_limit_exceeded',message:'Limit 8000, Requested 9471'}},{status:413,headers:{'x-ratelimit-limit-tokens':'8000'}});
  return Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify(answer())}}]});
 }}),e=>e.message==='INVALID_ANALYSIS'&&e.issue==='response_truncated');
 assert.equal(sent.length,3);assert.equal(sent[1].max_completion_tokens,sent[2].max_completion_tokens);
 assert.ok(sent[1].max_completion_tokens<sent[0].max_completion_tokens);
});

test('normal research allows a third report and burst protection clears within a minute',async()=>{
 const m=await implementation();const {consumePublicRateLimit}=await import('../lib/server/data/public-rate-limit.js');
 let now=Date.UTC(2040,0,1),generated=0;
 const handler=m.createAnalysisHandler({secret:()=> 'secret',consume:args=>consumePublicRateLimit({...args,now,storageBackend:'memory',environment:'test'}),generate:async()=>{generated++;return {status:'draft'}}});
 const make=()=>new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:'https://www.blsprime.com','Content-Type':'application/json','x-vercel-forwarded-for':'203.0.113.43'},body:JSON.stringify({dossier,ticket:m.signDossier(dossier,'secret')})});
 for(let i=0;i<3;i++)assert.equal((await handler(make())).status,200);
 const blocked=await handler(make());assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))<=60);assert.equal(generated,3);
 now+=61000;assert.equal((await handler(make())).status,200);assert.equal(generated,4);
});

test('one malformed draft is repaired server-side before independent review',async()=>{
 const m=await implementation();let calls=0;const events=[];
 const out=await m.generateAnalysis(dossier,{apiKey:'secret',diagnose:e=>events.push(e),fetcher:async(_url,options)=>{
  calls++;const b=JSON.parse(options.body);
  if(calls===1){const a=answer();a.sections[0].unknowns=['El capex fue 51.4 billion'];return completionResponse(a)}
  if(calls===2){assert.match(JSON.stringify(b.messages),/sections\[0\]\.unknowns/);return completionResponse(answer())}
  return completionResponse({reviews:supportedReviews()});
 }});
 assert.equal(calls,3);assert.equal(out.recovery.length,1);assert.equal(out.recovery[0].stage,'draft');assert.equal(out.sections[0].findings.length,1);
 assert.ok(events.some(e=>e.stage==='draft'&&e.code==='INVALID_ANALYSIS'));
 assert.ok(!JSON.stringify(events).includes('51.4'));
});

test('missing review rows trigger bounded repair, never implicit approval',async()=>{
 const m=await implementation();let calls=0;
 const out=await m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},fetcher:async()=>{
  calls++;return completionResponse(calls===1?answer():{reviews:calls===2?supportedReviews().slice(1):supportedReviews()});
 }});
 assert.equal(calls,3);assert.equal(out.recovery[0].stage,'review');assert.equal(out.review.assessments.length,3);
});

test('repair never retries provider quota failures and rejects repeated invalid output',async()=>{
 const m=await implementation();let calls=0;
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},fetcher:async()=>{calls++;return new Response('',{status:429})}}),/PROVIDER_RATE_LIMIT/);
 assert.equal(calls,1);calls=0;
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},fetcher:async()=>{calls++;return completionResponse({sections:[]})}}),/INVALID_ANALYSIS/);
 assert.equal(calls,2);
});

test('malformed nested fields have safe typed validation errors',async()=>{
 const m=await implementation();for(const mutate of [a=>a.sections[0]=null,a=>a.sections[0].findings=[null],a=>a.sections[0].findings[0].evidence=[null]]){
  const a=answer();mutate(a);assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/);
 }
});

test('null, scalar and malformed analysis requests are rejected before budgets or inference',async()=>{
 const m=await implementation();const handler=m.createAnalysisHandler({secret:()=> 'secret',consume:()=>assert.fail('no budget consumption'),generate:()=>assert.fail('no generation')});
 for(const body of ['null','[]','42','true','"text"','{',JSON.stringify({dossier:null,ticket:'x'}),JSON.stringify({dossier,ticket:'x',language:[]})]){
  const r=await handler(new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:'https://www.blsprime.com','Content-Type':'application/json'},body}));
  assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'INVALID_REQUEST'});
 }
});

test('reviewer approval without exact claim-local support cannot publish a finding',async()=>{
 const m=await implementation();const a=m.validateAnalysis(answer(),dossier);
 for(const change of [r=>r.support=[],r=>r.support[0].quote='Invented sufficient liquidity statement.',r=>r.support[0]={chunkId:'D999:C1',quote:'Foreign source'},r=>r.allClausesSupported=false,r=>r.scopeLimited=false,r=>r.catalystStatus='unsupported']){
  const reviews=supportedReviews();change(reviews[0]);const out=m.applyReview(a,{reviews});
  assert.equal(out.sections[0].findings.length,0);assert.equal(out.sections[1].findings.length,1);assert.equal(out.interpretationVerified,false);
 }
});

test('support spans and source claim identities survive filtering for audit',async()=>{
 const m=await implementation();const a=m.validateAnalysis(answer(),dossier);const out=m.applyReview(a,{reviews:supportedReviews()});
 assert.equal(out.sections[0].findings[0].reviewId,'business:0');
 assert.deepEqual(out.review.assessments[0].support,supportedReviews()[0].support);
});
test('signed dossier rejects tampering and expiry',async()=>{const m=await implementation();const ticket=m.signDossier(dossier,'secret',1000);assert.equal(m.verifyDossier(dossier,ticket,'secret',2000),true);assert.equal(m.verifyDossier({...dossier,name:'changed'},ticket,'secret',2000),false);assert.equal(m.verifyDossier(dossier,ticket,'secret',3601001),false);assert.equal(m.verifyDossier(dossier,ticket,'other',2000),false)});
test('analysis never upgrades quote validation into verified investment claims',async()=>{const m=await implementation();const a=m.validateAnalysis(answer(),dossier);assert.equal(a.status,'draft');assert.equal(a.interpretationVerified,false);assert.equal(a.valuation,null);assert.equal(a.mispricing,null);assert.equal(a.citationsVerified,true);assert.equal(a.sections.length,3)});
test('fabricated quote, foreign chunk and missing section fail closed',async()=>{const m=await implementation();for(const mutate of [a=>a.sections[0].findings[0].evidence[0].quote='THIS IS NOT IN THE SOURCE DOCUMENT',a=>a.sections[0].findings[0].evidence[0].chunkId='D999:C1',a=>a.sections.pop()]){const a=answer();mutate(a);assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/)}});
test('Groq failure is typed, never returned with secret or raw provider payload',async()=>{const m=await implementation();await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',fetcher:async()=>new Response('secret: provider dump',{status:429})}),/PROVIDER_RATE_LIMIT/)});

test('provider schema failures are diagnosable without logging provider content',async()=>{
 const m=await implementation();const logs=[];
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'private-key',diagnose:event=>logs.push(event),fetcher:async()=>Response.json({error:{code:'json_validate_failed',message:'private-key',failed_generation:'private-document'}},{status:400})}),/INVALID_ANALYSIS/);
 assert.equal(logs.filter(e=>e.code==='json_validate_failed').length,2);
 assert.equal(logs.filter(e=>e.stage==='draft').length,2);
 assert.ok(!JSON.stringify(logs).includes('private-'));
});
test('complete response binds dossier, model and prompt hashes without exposing credentials',async()=>{const m=await implementation();const a=await m.generateAnalysis(dossier,{apiKey:'secret',fetcher:async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.response_format.json_schema.strict,true);assert.ok(body.messages[1].content.includes(dossier.sections[0].extracts[0].id));const payload=body.response_format.json_schema.schema.properties.reviews?{reviews:supportedReviews()}:answer();return completionResponse(payload)}});assert.equal(a.packetHash,dossier.packetHash);assert.ok(a.model);assert.match(a.promptHash,/^[a-f0-9]{64}$/);assert.equal(a.review.model,a.attempts.find(s=>s.stage==='review').model);assert.equal(a.sections[0].findings.length,1);assert.ok(!JSON.stringify(a).includes('secret'))});
test('review removes unsupported claims without silently inventing replacements',async()=>{const m=await implementation();assert.equal(typeof m.applyReview,'function');const a=m.validateAnalysis(answer(),dossier);const out=m.applyReview(a,{reviews:[{id:'business:0',verdict:'unsupported',reason:'Una mención de riesgo no prueba ventaja competitiva.'},supportedReviews()[1],{id:'thesis:0',verdict:'uncertain',reason:'Falta un desencadenante documentado.'}]});assert.equal(out.sections[0].findings.length,0);assert.equal(out.sections[1].findings.length,1);assert.equal(out.review.excluded.length,2);assert.equal(out.interpretationVerified,false);assert.throws(()=>m.applyReview(a,{reviews:[]}),/INVALID_ANALYSIS/)});
test('numeric paraphrases cannot turn capex deltas into total investment',async()=>{const m=await implementation();const a=answer();a.sections[1].findings[0].text='El capex fue 51.4 billion.';assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/)});

test('spelling percentages in words does not evade quantitative paraphrase checks',async()=>{
 const m=await implementation();for(const value of ['Representa diez por ciento de las cuentas.','It represents ten percent of receivables.','Se gastaron veinte millones.']){
  const a=answer();a.sections[0].findings[0].text=value;assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/);
  const b=answer();b.sections[0].unknowns=[value];assert.throws(()=>m.validateAnalysis(b,dossier),/INVALID_ANALYSIS/);
 }
});
test('a documented product name is not mistaken for a financial quantity',async()=>{const m=await implementation();const a=answer();a.sections[0].findings[0].text='Microsoft\u202f365 exige contrastar la retención.';assert.equal(m.validateAnalysis(a,dossier).status,'draft')});
test('filing names and note locators are not rejected as invented financial numbers',async()=>{const m=await implementation();const a=answer();a.sections[0].checks=['Consultar la nota 12 del 10-K y contrastar con el 10-Q.'];assert.equal(m.validateAnalysis(a,dossier).sections[0].checks.length,1)});

test('calendar qualifiers and filing item locators are not financial amounts',async()=>{
 const m=await implementation();
 for(const s of ['En el trimestre de 2026, la empresa describe mayores cobros.','Al 27‑jun‑2026 la empresa declara deuda.','Consultar Item 8 del informe anual.']){
  const a=answer();a.sections[0].findings[0].text=s;assert.equal(m.validateAnalysis(a,dossier).sections[0].findings[0].text,s);
 }
 for(const s of ['La caja creció en 2026 millones.','Cash increased in 2026 dollars.','La caja creció en 2026%.','La deuda fue de 2026,5 millones.']){
  const a=answer();a.sections[0].findings[0].text=s;assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/);
 }
});
test('typographic hyphens in filing names do not cause a false financial-quantity rejection',async()=>{const m=await implementation();for(const name of ['10‑K','10–Q','8‐K']){const a=answer();a.sections[0].checks=[`Consultar la nota 12 del ${name}.`];assert.equal(m.validateAnalysis(a,dossier).sections[0].checks.length,1)}});
test('a risk excerpt can support business analysis when it belongs to the same signed dossier',async()=>{const m=await implementation();const a=answer();a.sections[0].findings[0].evidence=[{chunkId:dossier.sections[2].extracts[0].id}];assert.equal(m.validateAnalysis(a,dossier).sections[0].findings[0].evidence[0].quote,dossier.sections[2].extracts[0].text)});
test('reported facts must be exact source text, not generated summaries',async()=>{const m=await implementation();const a=answer();a.sections[0].findings[0].kind='reported_fact';assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/)});
test('truncated response and missing provider fail before publishing any draft',async()=>{const m=await implementation();await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:''}),/PROVIDER_UNAVAILABLE/);await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',fetcher:async()=>Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify(answer())}}]})}),/INVALID_ANALYSIS/)});
test('denied resource budget and invalid signature never call Groq',async()=>{const m=await implementation();let calls=0;const handler=m.createAnalysisHandler({secret:()=> 'secret',consume:async()=>({allowed:false,retryAfterSeconds:30}),generate:async()=>{calls++;return {}}});const make=body=>new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:'https://www.blsprime.com','Content-Type':'application/json'},body:JSON.stringify(body)});const ticket=m.signDossier(dossier,'secret');assert.equal((await handler(make({dossier,ticket}))).status,429);assert.equal((await handler(make({dossier,ticket:'invalid'}))).status,409);assert.equal(calls,0)});
test('cross-origin requests fail and the global limit is consumed before model execution',async()=>{const m=await implementation();const calls=[];const handler=m.createAnalysisHandler({secret:()=> 'secret',consume:async({scope})=>{calls.push(scope);return {allowed:true}},generate:async()=>{calls.push('generate');return {status:'draft'}}});const make=origin=>new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({dossier,ticket:m.signDossier(dossier,'secret')})});assert.equal((await handler(make('https://evil.example'))).status,403);assert.equal((await handler(make('https://www.blsprime.com'))).status,200);assert.deepEqual(calls,['filing-analysis-burst-v1','filing-analysis-global-v1','generate'])});

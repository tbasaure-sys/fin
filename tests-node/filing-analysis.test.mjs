import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const dossier=require('../lib/research/published/MSFT.json');
// Removing quote validation, signature binding or the resource gate must break these tests.
const moduleUrl=new URL('../lib/server/filing-analysis.js',import.meta.url);
async function implementation(){let mod;try{mod=await import(moduleUrl.href)}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}assert.ok(mod,'filing analysis implementation must exist');return mod}
function answer(){return {sections:dossier.sections.map(s=>({id:s.id,findings:[{kind:'interpretation',text:'La evidencia requiere contrastar inversión y caja.',evidence:[{chunkId:s.extracts[0].id}]}],unknowns:['No se conoce el capex de mantenimiento.'],checks:['Contrastar contra el siguiente informe trimestral.']}))}}
function supportedReviews(){return dossier.sections.map(s=>({id:`${s.id}:0`,verdict:'supported',reason:'Lectura acotada.',allClausesSupported:true,scopeLimited:true,catalystStatus:'not_claimed',support:[{chunkId:s.extracts[0].id,quote:s.extracts[0].text.slice(0,90)}]}))}
const completionResponse=raw=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}],usage:{total_tokens:12}});

test('format repair uses the draft, not a duplicate full evidence packet',async()=>{
 const m=await implementation();let calls=0;
 await m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},fetcher:async(_url,options)=>{
  const body=JSON.parse(options.body);calls++;
  if(calls===1){const raw=answer();raw.sections[0].checks=['Revisar 10-K'];return completionResponse(raw)}
  if(calls===2){assert.ok(!JSON.stringify(body.messages).includes(dossier.sections[0].extracts[0].text.slice(0,120)));assert.ok(JSON.stringify(body.messages).includes('Revisar 10-K'));return completionResponse(answer())}
  return completionResponse({reviews:supportedReviews()});
 }});assert.equal(calls,3);
});

test('provider retry-after is honored once within the deadline, never guessed',async()=>{
 const m=await implementation();let calls=0;const waits=[];
 await m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},wait:async ms=>waits.push(ms),fetcher:async(_url,options)=>{
  calls++;if(calls===1)return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'Retry-After':'2'}});
  return completionResponse(JSON.parse(options.body).model===m.MODEL?answer():{reviews:supportedReviews()});
 }});
 assert.equal(calls,3);assert.deepEqual(waits,[2000]);
 await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',diagnose:()=>{},wait:()=>assert.fail('must not wait hours'),fetcher:async()=>new Response('',{status:429,headers:{'Retry-After':'7200'}})}),e=>e.message==='PROVIDER_RATE_LIMIT'&&e.retryAfterSeconds===7200);
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
test('complete response binds dossier, model and prompt hashes without exposing credentials',async()=>{const m=await implementation();const a=await m.generateAnalysis(dossier,{apiKey:'secret',fetcher:async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');const body=JSON.parse(options.body);assert.equal(body.response_format.json_schema.strict,true);assert.ok(body.messages[1].content.includes(dossier.sections[0].extracts[0].id));const payload=body.model==='openai/gpt-oss-20b'?{reviews:supportedReviews()}:answer();return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(payload)}}],usage:{total_tokens:123}})}});assert.equal(a.packetHash,dossier.packetHash);assert.ok(a.model);assert.match(a.promptHash,/^[a-f0-9]{64}$/);assert.equal(a.review.model,'openai/gpt-oss-20b');assert.equal(a.sections[0].findings.length,1);assert.ok(!JSON.stringify(a).includes('secret'))});
test('review removes unsupported claims without silently inventing replacements',async()=>{const m=await implementation();assert.equal(typeof m.applyReview,'function');const a=m.validateAnalysis(answer(),dossier);const out=m.applyReview(a,{reviews:[{id:'business:0',verdict:'unsupported',reason:'Una mención de riesgo no prueba ventaja competitiva.'},supportedReviews()[1],{id:'thesis:0',verdict:'uncertain',reason:'Falta un desencadenante documentado.'}]});assert.equal(out.sections[0].findings.length,0);assert.equal(out.sections[1].findings.length,1);assert.equal(out.review.excluded.length,2);assert.equal(out.interpretationVerified,false);assert.throws(()=>m.applyReview(a,{reviews:[]}),/INVALID_ANALYSIS/)});
test('numeric paraphrases cannot turn capex deltas into total investment',async()=>{const m=await implementation();const a=answer();a.sections[1].findings[0].text='El capex fue 51.4 billion.';assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/)});

test('spelling percentages in words does not evade quantitative paraphrase checks',async()=>{
 const m=await implementation();for(const value of ['Representa diez por ciento de las cuentas.','It represents ten percent of receivables.','Se gastaron veinte millones.']){
  const a=answer();a.sections[0].findings[0].text=value;assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/);
  const b=answer();b.sections[0].unknowns=[value];assert.throws(()=>m.validateAnalysis(b,dossier),/INVALID_ANALYSIS/);
 }
});
test('a documented product name is not mistaken for a financial quantity',async()=>{const m=await implementation();const a=answer();a.sections[0].findings[0].text='Microsoft\u202f365 exige contrastar la retención.';assert.equal(m.validateAnalysis(a,dossier).status,'draft')});
test('a risk excerpt can support business analysis when it belongs to the same signed dossier',async()=>{const m=await implementation();const a=answer();a.sections[0].findings[0].evidence=[{chunkId:dossier.sections[2].extracts[0].id}];assert.equal(m.validateAnalysis(a,dossier).sections[0].findings[0].evidence[0].quote,dossier.sections[2].extracts[0].text)});
test('reported facts must be exact source text, not generated summaries',async()=>{const m=await implementation();const a=answer();a.sections[0].findings[0].kind='reported_fact';assert.throws(()=>m.validateAnalysis(a,dossier),/INVALID_ANALYSIS/)});
test('truncated response and missing provider fail before publishing any draft',async()=>{const m=await implementation();await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:''}),/PROVIDER_UNAVAILABLE/);await assert.rejects(()=>m.generateAnalysis(dossier,{apiKey:'secret',fetcher:async()=>Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify(answer())}}]})}),/INVALID_ANALYSIS/)});
test('denied resource budget and invalid signature never call Groq',async()=>{const m=await implementation();let calls=0;const handler=m.createAnalysisHandler({secret:()=> 'secret',consume:async()=>({allowed:false,retryAfterSeconds:30}),generate:async()=>{calls++;return {}}});const make=body=>new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:'https://www.blsprime.com','Content-Type':'application/json'},body:JSON.stringify(body)});const ticket=m.signDossier(dossier,'secret');assert.equal((await handler(make({dossier,ticket}))).status,429);assert.equal((await handler(make({dossier,ticket:'invalid'}))).status,409);assert.equal(calls,0)});
test('cross-origin requests fail and the global limit is consumed before model execution',async()=>{const m=await implementation();const calls=[];const handler=m.createAnalysisHandler({secret:()=> 'secret',consume:async({scope})=>{calls.push(scope);return {allowed:true}},generate:async()=>{calls.push('generate');return {status:'draft'}}});const make=origin=>new Request('https://www.blsprime.com/api/public/research/analyze',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({dossier,ticket:m.signDossier(dossier,'secret')})});assert.equal((await handler(make('https://evil.example'))).status,403);assert.equal((await handler(make('https://www.blsprime.com'))).status,200);assert.deepEqual(calls,['filing-analysis-burst-v1','filing-analysis-global-v1','generate'])});

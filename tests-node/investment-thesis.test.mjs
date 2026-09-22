import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {THESIS_SECTIONS,THESIS_VERSION,validateInvestmentThesis,generateInvestmentThesis} from '../lib/server/investment-thesis.js';
import {createAnalysisHandler,signDossier} from '../lib/server/filing-analysis.js';
import {reportKey,makeRecord} from '../lib/server/filing-report-cache.js';
import {hash} from '../lib/research/filing-engine.mjs';
const dossier=createRequire(import.meta.url)('../lib/research/published/MSFT.json');
const chunk=dossier.sections[0].extracts[0];
const answer=()=>({sections:THESIS_SECTIONS.map(id=>({id,findings:[{text:'A conditional case grounded in the reported business.',evidence:[{chunkId:chunk.id}]}],unknowns:['The durability of the economics remains unresolved.'],checks:['Check whether future filings contradict the reported economics.']}))});
test('generated theses bind every quote to the signed evidence and reject fabricated citations or prices',()=>{
 const result=validateInvestmentThesis(answer(),dossier);
 assert.equal(result.sections[0].findings[0].evidence[0].quote,chunk.text);
 const fake=answer();fake.sections[0].findings[0].evidence[0].chunkId='invented';
 assert.throws(()=>validateInvestmentThesis(fake,dossier),/INVALID_ANALYSIS/);
 const price=answer();price.sections[0].findings[0].text='Target price $200';
 assert.throws(()=>validateInvestmentThesis(price,dossier),/INVALID_ANALYSIS/);
 const order=answer();order.sections.reverse();assert.throws(()=>validateInvestmentThesis(order,dossier),/INVALID_ANALYSIS/);
 const empty=answer();empty.sections[4].findings=[];assert.equal(validateInvestmentThesis(empty,dossier).sections[4].findings.length,0);
});
test('ticker-only generation reviews public generated claims without a saved user thesis',async()=>{
 let reviewed;
 const result=await generateInvestmentThesis(dossier,{language:'en',apiKey:'test',fetcher:async(url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  const body=JSON.parse(options.body);assert.ok(body.messages[0].content.includes('never ask them to supply their thesis'));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer())}}]});
 },jev:{evaluate:async(kind,items)=>{assert.equal(kind,'thesis');reviewed=items;return {status:'available',items:[]}}}});
 assert.equal(result.version,THESIS_VERSION);assert.equal(reviewed.length,6);assert.equal(reviewed[0].evidence[0].text,chunk.text.slice(0,2000));
 assert.equal(result.dossierHash,hash(dossier));assert.equal(result.language,'en');
 assert.equal(result.valuation,null);
});
test('Jev outage preserves the generated draft with an explicit unavailable review',async()=>{
 const result=await generateInvestmentThesis(dossier,{apiKey:'test',fetcher:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer())}}]}),jev:{evaluate:async()=>{throw Error('outage')}}});
 assert.equal(result.review.status,'unavailable');assert.equal(result.sections.length,6);
});
test('thesis generation uses a separate cache version and requires the signed dossier',async()=>{
 const secret='test-signing-secret',ticket=signDossier(dossier,secret);let storedKey;
 const analysis={...validateInvestmentThesis(answer(),dossier),language:'en',dossierHash:hash(dossier)};
 const handler=createAnalysisHandler({secret:()=>secret,version:THESIS_VERSION,consume:()=>assert.fail('cache hit must not spend quota'),generate:()=>assert.fail('cache hit must not generate'),store:{get:async key=>{storedKey=key;return makeRecord(dossier,analysis)}}});
 const request=body=>new Request('https://example.com/api/research/investment-thesis',{method:'POST',headers:{origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(body)});
 const response=await handler(request({dossier,ticket,language:'en'}));assert.equal(response.status,200);assert.equal((await response.json()).cached,true);
 assert.equal(storedKey,reportKey(dossier,'en',THESIS_VERSION));
 assert.equal((await handler(request({dossier:{...dossier,ticker:'WRONG'},ticket,language:'en'}))).status,409);
});

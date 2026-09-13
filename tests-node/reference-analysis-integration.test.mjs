import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../lib/server/filing-analysis.js';
const sentence='The company may repurchase shares but has no minimum purchase obligation.';
const dossier={ticker:'TEST',name:'Test issuer',packetHash:'test',sources:[{id:'D1',form:'10-K',acceptedAt:'2026-01-01'}],sections:['business','cash','thesis'].map(id=>({id,extracts:[{id:`D1:${id}`,text:sentence}]}))};
const draft={sections:dossier.sections.map(s=>({id:s.id,findings:[{kind:'interpretation',text:'La empresa puede recomprar acciones sin obligación mínima.',evidence:[{chunkId:s.extracts[0].id}]}],unknowns:[],checks:[]}))};
const response=raw=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}],usage:{total_tokens:10}});
test('production generation resolves reviewer references into exact source text and offsets',async()=>{
 let calls=0,reviewPacket;
 const result=await m.generateAnalysis(dossier,{apiKey:'fixture-key',diagnose:()=>{},fetcher:async(_url,options)=>{
  if(++calls===1)return response(draft);
  const packet=JSON.parse(JSON.parse(options.body).messages[1].content);
  reviewPacket=packet;
  if(!packet.sources)return response({reviews:draft.sections.map(s=>({id:`${s.id}:0`,verdict:'supported',reason:'Supported.',allClausesSupported:true,scopeLimited:true,catalystStatus:'not_claimed',support:[{chunkId:s.findings[0].evidence[0].chunkId,quote:sentence}]})),agenda:[]});
  return response({reviews:packet.claims.map((c,i)=>({id:c.id,verdict:'supported',unsupportedClause:'',supportIds:[`source${i}:0`]})),agenda:[]});
 }});
 assert.ok(Array.isArray(reviewPacket.sources),'reviewer must receive server-addressable source spans');
 for(const source of reviewPacket.sources)for(const span of source.spans){
  assert.deepEqual(Object.keys(span).sort(),['id','text'],'wire packet omits server-only offsets without omitting source text');
 }
 assert.equal(calls,2);assert.equal(result.sections[0].findings.length,1);
 const support=result.review.assessments[0].support[0];
 assert.equal(support.quote,sentence);assert.equal(support.start,0);assert.equal(support.end,sentence.length);
 assert.equal(result.interpretationVerified,false);assert.equal(result.review.protocol,'reference-review-v1');
 assert.equal(result.review.model,result.attempts.find(a=>a.stage==='review').model);
});
test('foreign support, missing coverage and a remaining unsupported clause cannot publish',()=>{
 assert.equal(typeof m.applyReferenceAnalysisReview,'function');
 const a=m.validateAnalysis(draft,dossier);
 const rows=draft.sections.map((s,i)=>({id:`${s.id}:0`,verdict:'supported',unsupportedClause:'',supportIds:[`source${i}:0`]}));
 for(const patch of [{supportIds:['source1:0']},{supportIds:[]},{unsupportedClause:'obligatory'}]){
  const raw={reviews:[{...rows[0],...patch},...rows.slice(1)],agenda:[]};
  const result=m.applyReferenceAnalysisReview(a,raw,dossier);
  assert.equal(result.sections[0].findings.length,0);assert.equal(result.sections[1].findings.length,1);
 }
 assert.throws(()=>m.applyReferenceAnalysisReview(a,{reviews:[],agenda:[]},dossier),/INVALID_ANALYSIS/);
});

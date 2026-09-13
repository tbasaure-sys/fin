import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {validateAnalysis,applyReview,generateAnalysis,preserveValidatedFields} from '../lib/server/filing-analysis.js';
import {reportDelivery} from '../lib/research/report-delivery.mjs';
import {referenceProviderPayload} from './fixtures/reference-provider.mjs';
const require=createRequire(import.meta.url);
const dossier=require('../lib/research/published/MSFT.json');
const draft=()=>({sections:dossier.sections.map(s=>({id:s.id,
 findings:[{kind:'interpretation',text:`Lectura acotada sobre ${s.id}.`,evidence:[{chunkId:s.extracts[0].id}]}],
 unknowns:['¿Qué obligación cambia la caja disponible?'],checks:['Revisar las obligaciones en la nota citada.']}))});
function review(raw,{reject=false}={}) {
 return {reviews:raw.sections.flatMap(s=>s.findings.map((f,i)=>({id:`${s.id}:${i}`,verdict:reject?'unsupported':'supported',
 reason:'Alcance contrastado.',allClausesSupported:!reject,scopeLimited:true,catalystStatus:'not_claimed',
 support:reject?[]:f.evidence.map(e=>({chunkId:e.chunkId,quote:dossier.sections.flatMap(s=>s.extracts).find(c=>c.id===e.chunkId).text.slice(0,90)}))}))),
 agenda:raw.sections.flatMap(s=>['unknowns','checks'].flatMap(kind=>s[kind].map((_,i)=>({id:`${s.id}:${kind}:${i}`,
 verdict:'relevant',reason:'Pregunta vinculada a un pasaje, sin presuponer la respuesta.',sourceIds:[s.findings[0]?.evidence[0].chunkId||dossier.sections.find(d=>d.id===s.id).extracts[0].id]}))))};
}
const response=raw=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(referenceProviderPayload(raw,dossier))}}],usage:{total_tokens:10}});

test('format repair cannot rewrite valid findings or erase valid research questions',async()=>{
 const original=draft();original.sections[1].findings[0].text='La caja aumentó 10 millones.';
 const repaired=draft();
 for(const s of repaired.sections){s.findings[0].text='Texto reescrito durante reparación.';s.unknowns=[];s.checks=[];}
 const expected=structuredClone(original);expected.sections[1].findings[0]=repaired.sections[1].findings[0];
 let calls=0;
 const result=await generateAnalysis(dossier,{apiKey:'test-key',diagnose:()=>{},fetcher:async(_url,options)=>{
  calls++;if(calls<3)return response(calls===1?original:repaired);
  const context=JSON.parse(JSON.parse(options.body).messages[1].content),r=review(expected);
  r.agenda=r.agenda.filter(row=>context.agenda.some(a=>a.id===row.id));return response(r);
 }});
 assert.equal(calls,3);
 assert.equal(result.sections[0].findings[0].text,'Lectura acotada sobre business.');
 assert.equal(result.sections[1].findings[0].text,'Texto reescrito durante reparación.');
 assert.deepEqual(result.sections[0].unknowns,['¿Qué obligación cambia la caja disponible?']);
 assert.deepEqual(result.sections[2].checks,['Revisar las obligaciones en la nota citada.']);
});

test('correcting quantitative prose cannot rebind its valid original citation',()=>{
 const original=draft(),repaired=draft();
 original.sections[0].findings[0].text='La caja fue 10 millones.';
 repaired.sections[0].findings[0].text='La empresa describe su negocio.';
 repaired.sections[0].findings[0].evidence=[{chunkId:dossier.sections[1].extracts[0].id}];
 const out=preserveValidatedFields(original,repaired,dossier);
 assert.deepEqual(out.sections[0].findings[0].evidence,original.sections[0].findings[0].evidence);
 assert.equal(out.sections[0].findings[0].text,'La empresa describe su negocio.');
});

test('a repair cannot silently drop an invalid finding or append a new one',()=>{
 const original=draft(),repaired=draft();
 original.sections[0].findings[0].text='La caja fue 10 millones.';
 repaired.sections[0].findings=[];
 assert.throws(()=>preserveValidatedFields(original,repaired,dossier),/INVALID_ANALYSIS/);
 const good=draft();repaired.sections[0].findings=[...good.sections[0].findings,...good.sections[0].findings];
 const out=preserveValidatedFields(good,repaired,dossier);
 assert.equal(out.sections[0].findings.length,1);
 assert.deepEqual(good,draft(),'original input must remain immutable');
});

test('a document brief requires developed sections and never certifies investment quality',()=>{
 const a=draft();assert.equal(reportDelivery(a).status,'partial');
 for(const s of a.sections)s.findings.push({...s.findings[0],text:'Otro hallazgo.'});
 const out=reportDelivery(a);assert.equal(out.status,'documentary_brief');assert.equal(out.qualityCertified,false);assert.equal(out.investmentAnalysisComplete,false);
 a.sections.pop();assert.equal(reportDelivery(a).status,'partial');
 assert.equal(reportDelivery(null).status,'insufficient');
});

test('a malformed or duplicated agenda cannot pass the review boundary',()=>{
 const a=draft();for(const agenda of [{},'invalid',[...review(a).agenda,review(a).agenda[0]]]){
  assert.throws(()=>applyReview(validateAnalysis(a,dossier),{...review(a),agenda},dossier),/INVALID_ANALYSIS/);
 }
});

test('absence of a useful question does not force fabricated tasks or another formatting call',()=>{
 const a=draft();a.sections[0].unknowns=[];a.sections[0].checks=[];
 assert.deepEqual(validateAnalysis(a,dossier).sections[0].unknowns,[]);
});

test('unreviewed and irrelevant questions do not survive as research tasks',()=>{
 const a=draft(),r=review(a);r.agenda[0].verdict='irrelevant';
 const result=applyReview(validateAnalysis(a,dossier),r,dossier);
 assert.deepEqual(result.sections[0].unknowns,[]);
 assert.deepEqual(result.sections[0].checks,['Revisar las obligaciones en la nota citada.']);
 assert.equal(result.review.agendaExcluded[0].id,'business:unknowns:0');
 delete r.agenda;
 assert.deepEqual(applyReview(validateAnalysis(a,dossier),r,dossier).sections[1].checks,[]);
});

test('a positive relevance verdict with a foreign source is not evidence',()=>{
 const a=draft(),r=review(a);r.agenda[0].sourceIds=['D999:C1'];
 assert.deepEqual(applyReview(validateAnalysis(a,dossier),r,dossier).sections[0].unknowns,[]);
});

test('review context shares source bytes instead of duplicating them per finding',async()=>{
 const a=draft();let calls=0,sourceCopies;
 await generateAnalysis(dossier,{apiKey:'test-key',diagnose:()=>{},fetcher:async(_url,options)=>{
  calls++;if(calls===2){const context=JSON.parse(JSON.parse(options.body).messages[1].content);
   const id=dossier.sections[0].extracts[0].id;
   sourceCopies=context.sources.filter(s=>s.chunkId===id).length+context.additionalExtracts.filter(s=>s.id===id).length;
  }
  return response(calls===1?a:review(a));
 }});
 assert.equal(sourceCopies,1);
});

test('rejected readings get one reconstruction, then another independent review',async()=>{
 const a=draft(),b=draft();b.sections[0].findings[0].text='La actividad descrita incluye servicios de soporte.';
 let calls=0;
 const result=await generateAnalysis(dossier,{apiKey:'test-key',diagnose:()=>{},fetcher:async()=>{
  calls++;return response([a,review(a,{reject:true}),b,review(b)][calls-1]);
 }});
 assert.equal(calls,4);
 assert.equal(result.sections[0].findings[0].text,b.sections[0].findings[0].text);
 assert.equal(result.reconstruction.status,'recovered');
 assert.equal(result.reconstruction.originalReview.excluded.length,3);
 assert.equal(result.delivery.status,'partial');
 assert.equal(result.predictiveClaim,false);
});

test('reconstruction cannot publish a second unsupported interpretation',async()=>{
 const a=draft();let calls=0;
 const result=await generateAnalysis(dossier,{apiKey:'test-key',diagnose:()=>{},fetcher:async()=>{
  calls++;return response(calls%2?a:review(a,{reject:true}));
 }});
 assert.equal(calls,4);
 assert.equal(result.sections.flatMap(s=>s.findings).length,0);
 assert.equal(result.delivery.status,'insufficient');
 assert.equal(result.reconstruction.status,'no_additional_support');
});

test('optional reconstruction failure preserves supported work without claiming recovery',async()=>{
 const a=draft(),r=review(a);r.reviews[0]={...r.reviews[0],verdict:'unsupported',support:[]};let calls=0;
 const result=await generateAnalysis(dossier,{apiKey:'test-key',diagnose:()=>{},fetcher:async()=>{
  calls++;if(calls===3)return new Response('',{status:429});return response(calls===1?a:r);
 }});
 assert.equal(result.sections[1].findings[0].text,a.sections[1].findings[0].text);
 assert.equal(result.sections[0].findings.length,0);
 assert.equal(result.reconstruction.status,'unavailable');
 assert.equal(result.delivery.status,'partial');
});

test('reconstruction retains accepted findings, not the replacement models preferred rewrite',async()=>{
 const a=draft(),b=draft(),r=review(a);r.reviews[0]={...r.reviews[0],verdict:'unsupported',support:[]};
 b.sections[1].findings[0].text='Una conclusión nueva no solicitada.';let calls=0;
 const result=await generateAnalysis(dossier,{apiKey:'test-key',diagnose:()=>{},fetcher:async()=>{
  calls++;return response([a,r,b,review(b)][calls-1]);
 }});
 assert.equal(calls,4);
 assert.equal(result.sections[1].findings[0].text,a.sections[1].findings[0].text);
 assert.ok(result.sections[1].findings.every(f=>f.text!=='Una conclusión nueva no solicitada.'));
});

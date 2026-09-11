import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {newThesis, validateThesis, evaluateThesis, compareTheses, compareEvidence, assistedProposal} from '../lib/research/thesis-engine.mjs';
const dossier=createRequire(import.meta.url)('../lib/research/published/MSFT.json');
const copy=x=>structuredClone(x);
const at='2026-09-11T12:00:00Z';

test('a blank thesis keeps capital unassessed and does not turn missing evidence into failure',()=>{
 const t=newThesis(dossier); const result=evaluateThesis(t,at);
 assert.equal(result.capital,'not_assessed'); assert.equal(result.performance,null);
 assert.equal(result.predictiveClaim,false); assert.equal(result.nextCheck,null);
 assert.ok(result.nodes.every(n=>n.state==='unresolved'));
});
test('a material, discriminating, actionable unknown earns research attention but no capital license',()=>{
 const t=newThesis(dossier); const n=t.nodes.find(n=>n.id==='cash');
 Object.assign(n,{question:'Is maintenance investment understated?',test:'Read the capital investment note',ifYes:'Lower retained cash',ifNo:'Retained cash unchanged',material:true});
 const result=evaluateThesis(t,at);
 assert.equal(result.nextCheck.id,'cash'); assert.equal(result.capital,'not_assessed');
 n.ifNo=''; assert.equal(evaluateThesis(t,at).nextCheck,null);
});
test('supporting and contradictory source links yield conflict, never verified truth',()=>{
 const t=newThesis(dossier), id=dossier.sections[0].extracts[0].id;
 t.nodes[0].statement='Working explanation'; t.nodes[0].evidence=[{chunkId:id,relation:'supports'},{chunkId:id,relation:'contradicts'}];
 const result=evaluateThesis(t,at); assert.equal(result.nodes[0].state,'conflicted');
 assert.equal(result.nodes[0].claim,'user_interpretation');
 t.nodes[0].evidence.pop(); assert.equal(evaluateThesis(t,at).nodes[0].state,'linked_unverified');
});
test('citations are bound to the actual source, hash and public availability, not period end',()=>{
 const t=newThesis(dossier);t.nodes[0].evidence=[{chunkId:'D9:invented',relation:'supports'}];
 assert.throws(()=>validateThesis(t,dossier),/INVALID_EVIDENCE/);
 t.nodes[0].evidence=[];const future=copy(dossier);future.sources[0].acceptedAt='2027-01-01T00:00:00Z';
 assert.throws(()=>validateThesis(t,future),/FUTURE_SOURCE/);
});
test('unknown properties cannot smuggle a buy flag or a valuation into the thesis contract',()=>{
 const t=newThesis(dossier);t.recommendation='buy';assert.throws(()=>validateThesis(t,dossier),/INVALID_THESIS/);
});
test('a missed review date is an overdue check, not proof the economic thesis failed',()=>{
 const t=newThesis(dossier);t.nodes[1].nextAt='2026-09-01';
 const result=evaluateThesis(t,at);assert.equal(result.nodes[1].overdue,true);assert.equal(result.nodes[1].state,'unresolved');
});
test('revision differences identify changed assumptions and downstream rechecks without mutating old thesis',()=>{
 const before=newThesis(dossier),after=copy(before);after.nodes[1].statement='More maintenance capital required';
 const diff=compareTheses(before,after);
 assert.deepEqual(diff.changed,['cash']);assert.deepEqual(diff.recheck,['security','expectations','realization','downside']);
 assert.equal(before.nodes[1].statement,'');
});
test('a price-only hypothesis edit cannot change upstream business or cash statements',()=>{
 const before=newThesis(dossier),after=copy(before);after.nodes[3].statement='The observed price is different';
 const diff=compareTheses(before,after);assert.deepEqual(diff.changed,['expectations']);
 assert.ok(!diff.recheck.includes('business'));assert.ok(!diff.recheck.includes('cash'));
});
test('retrieval clocks and chunk renumbering are not new economic information',()=>{
 const fresh=copy(dossier);fresh.asOf=at;fresh.packetHash='f'.repeat(64);fresh.sources[0].retrievedAt=at;fresh.sources[0].id='D99';
 assert.deepEqual(compareEvidence(dossier,fresh),{added:[],changed:[],missing:[],kind:'same_documents'});
 fresh.sources[0].sha256='f'.repeat(64);assert.equal(compareEvidence(dossier,fresh).kind,'document_change_unclassified');
});
test('same ticker with another issuer is not accepted as the original thesis identity',()=>{
 const t=newThesis(dossier), other=copy(dossier);other.cik=123;
 assert.throws(()=>validateThesis(t,other),/IDENTITY_MISMATCH/);
});
test('assisted proposals preserve draft provenance, link only exact packet evidence and do not invent outcomes',()=>{
 const e=dossier.sections[0].extracts[0];
 const analysis={version:'test-model-v1',responseHash:'a'.repeat(64),sections:[{id:'business',findings:[{text:'A qualitative reading',evidence:[{chunkId:e.id,quote:e.text}]}],unknowns:['Is this durable?'],checks:['Read segment disclosures']}]};
 const proposal=assistedProposal('business',{analysis,dossier},dossier);
 assert.equal(proposal.draftSource.responseHash,'a'.repeat(64));assert.equal(proposal.evidence[0].relation,'context');assert.equal(proposal.ifYes,undefined);
 const wrong=copy(dossier);wrong.sources[0].sha256='e'.repeat(64);
 assert.equal(assistedProposal('business',{analysis,dossier:wrong},dossier),null);
 assert.equal(assistedProposal('expectations',{analysis,dossier},dossier),null);
});

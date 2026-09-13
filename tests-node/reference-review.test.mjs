import test from 'node:test';
import assert from 'node:assert/strict';
async function api(){const m=await import('../lib/research/reference-review.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {}});assert.equal(typeof m.reviewReferences,'function');return m}
const dossier={sections:[{extracts:[{id:'D1:0',text:'The company may issue notes for general corporate purposes, including buybacks.\nThis disclosure does not state the share of funding.'}]}]};
const claims=[{id:'c1',text:'The company may issue notes for buybacks.',chunkIds:['D1:0']}];
test('support is recovered from server-owned references rather than model-written quotes',async()=>{
 const m=await api(),p=m.reviewReferences(claims,dossier),ref=p.sources[0].spans[0];
 const out=m.resolveReferenceReview({reviews:[{id:'c1',verdict:'supported',unsupportedClause:'',supportIds:[ref.id]}]},p);
 assert.equal(out[0].accepted,true);assert.equal(out[0].support[0].quote,dossier.sections[0].extracts[0].text.split('\n')[0]);
 assert.equal(out[0].support[0].start,0);
});
test('unknown references, foreign claim sources and unresolved clauses cannot approve a claim',async()=>{
 const m=await api(),d=structuredClone(dossier);d.sections[0].extracts.push({id:'D2:0',text:'A different source contains this unrelated funding statement.'});
 const p=m.reviewReferences([...claims,{id:'c2',text:'Other claim.',chunkIds:['D2:0']}],d);
 for(const patch of [{supportIds:['invented']},{supportIds:[p.sources[1].spans[0].id]},{unsupportedClause:'principally'}]){
  const out=m.resolveReferenceReview({reviews:[{id:'c1',verdict:'supported',unsupportedClause:'',supportIds:[p.sources[0].spans[0].id],...patch},{id:'c2',verdict:'uncertain',unsupportedClause:'Unknown.',supportIds:[]}]},p);
  assert.equal(out[0].accepted,false);
 }
 assert.throws(()=>m.resolveReferenceReview({reviews:[]},p),/INVALID_REFERENCE_REVIEW/);
});
test('reference spans preserve exact offsets and conflicting chunk identities are rejected',async()=>{
 const m=await api();const d=structuredClone(dossier);d.sections[0].extracts[0].text='Long source text: '+('Cash flow may decline. '.repeat(90));
 const p=m.reviewReferences(claims,d),raw=d.sections[0].extracts[0].text;
 for(const span of p.sources[0].spans){assert.equal(raw.slice(span.start,span.end),span.text);assert.ok(span.text.length<=600)}
 d.sections.push({extracts:[{id:'D1:0',text:'Conflicting source'}]});assert.throws(()=>m.reviewReferences(claims,d),/CONFLICTED_CHUNK/);
});

test('every cited source must be covered and duplicate reviews cannot replace missing ones', async()=>{
 const m=await api(), d=structuredClone(dossier);
 d.sections[0].extracts.push({id:'D2:0',text:'An additional statement about funding.'});
 const p=m.reviewReferences([{...claims[0],chunkIds:['D1:0','D2:0']}],d);
 const row={id:'c1',verdict:'supported',unsupportedClause:'',supportIds:[p.sources[0].spans[0].id]};
 assert.equal(m.resolveReferenceReview({reviews:[row]},p)[0].accepted,false);
 row.supportIds.push(p.sources[1].spans[0].id);
 assert.equal(m.resolveReferenceReview({reviews:[row]},p)[0].accepted,true);
 assert.throws(()=>m.resolveReferenceReview({reviews:[row,row]},p),/INVALID_REFERENCE_REVIEW/);
 assert.throws(()=>m.reviewReferences([claims[0],claims[0]],d),/INVALID_REFERENCE_REVIEW/);
 assert.throws(()=>m.reviewReferences([{...claims[0],chunkIds:['missing']}],d),/INVALID_REFERENCE_REVIEW/);
});

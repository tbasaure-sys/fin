import {reviewReferences,resolveReferenceReview} from './reference-review.mjs';
const invalid=()=>{throw Error('INVALID_CALIBRATION')};
export function prepareCalibration(groups){
 if(!Array.isArray(groups)||!groups.length)invalid();
 const claims=[],labels=[],extracts=[],issuers=new Set();
 for(const {dossier,cases} of groups){
  if(!dossier?.ticker||issuers.has(dossier.ticker)||!Array.isArray(cases)||!cases.length)invalid();
  issuers.add(dossier.ticker);
  const chunks=new Map();
  for(const section of dossier.sections||[])for(const c of section.extracts||[]){
   if(chunks.has(c.id)&&chunks.get(c.id)!==c.text)invalid();chunks.set(c.id,c.text);
  }
  const keys=new Set();
  for(const c of cases){
   if(c.chunkIds!==undefined&&c.chunkId!==undefined)invalid();
   const sourceIds=c.chunkIds??[c.chunkId];
   if(!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>4||new Set(sourceIds).size!==sourceIds.length
    ||!sourceIds.every(id=>typeof id==='string'&&typeof chunks.get(id)==='string'))invalid();
   const sources=sourceIds.map(id=>chunks.get(id));
   if(!c.id||keys.has(c.id)||typeof c.expected!=='boolean'||typeof c.text!=='string'||!c.text.trim()||!Array.isArray(c.requiredSupport)
    ||c.expected&&!c.requiredSupport.length||!c.requiredSupport.every(s=>typeof s==='string'&&s.length>0&&sources.some(source=>source.includes(s))))invalid();
   keys.add(c.id);
   const id=`c${claims.length}`,chunkIds=sourceIds.map(sourceId=>`${dossier.ticker}:${sourceId}`);
   claims.push({id,text:c.text,chunkIds});
   labels.push({id,caseKey:`${dossier.ticker}:${c.id}`,expected:c.expected,requiredSupport:[...c.requiredSupport]});
   chunkIds.forEach((chunkId,i)=>{if(!extracts.some(e=>e.id===chunkId))extracts.push({id:chunkId,text:sources[i]});});
  }
 }
 return {packet:reviewReferences(claims,{sections:[{extracts}]}),labels,issuers:[...issuers]};
}
export function evaluateCalibration(raw,prepared){
 const resolved=resolveReferenceReview(raw,prepared.packet);
 const observations=prepared.labels.map(label=>{
  const r=resolved.find(r=>r.id===label.id),quote=r.support.map(s=>s.quote).join('\n');
  return {...r,caseKey:label.caseKey,expected:label.expected,supportCoverage:!label.expected||label.requiredSupport.every(s=>quote.includes(s))};
 });
 const falsePositives=observations.filter(r=>r.accepted&&!r.expected).length;
 const falseNegatives=observations.filter(r=>!r.accepted&&r.expected).length;
 const supportFailures=observations.filter(r=>r.expected&&r.accepted&&!r.supportCoverage).length;
 // Publication safeguards and model judgment are distinct. A foreign reference
 // can block a false claim without the reviewer ever recognizing the overreach.
 const modelFalsePositives=observations.filter(r=>r.verdict==='supported'&&!r.expected).length;
 const modelFalseNegatives=observations.filter(r=>r.verdict!=='supported'&&r.expected).length;
 const blockedModelFalsePositives=observations.filter(r=>r.verdict==='supported'&&!r.expected&&!r.accepted).length;
 const modelUncertain=observations.filter(r=>r.verdict==='uncertain').length;
 return {version:'review-calibration-v2',cases:observations.length,falsePositives,falseNegatives,supportFailures,
  modelFalsePositives,modelFalseNegatives,blockedModelFalsePositives,modelUncertain,
  passed:falsePositives+falseNegatives+supportFailures+modelFalsePositives+modelFalseNegatives===0,qualityCertified:false,observations};
}

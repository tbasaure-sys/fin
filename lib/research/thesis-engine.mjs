// A research notebook, not an underwriting or return-prediction engine.
export const THESIS_VERSION = 'bls-living-thesis-v1';
export const NODE_IDS = Object.freeze(['business','cash','security','expectations','realization','downside']);
export const CHANGE_KINDS = Object.freeze(['interpretation','document_update','technical_correction','market_observation']);
const textOK = (s,max=2000) => typeof s==='string' && s.length<=max;
const exactKeys = (o,keys) => o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).length===keys.length && Object.keys(o).every(k=>keys.includes(k));
export function companyKey(dossier) { return `${String(dossier.cik ?? 'unresolved')}:${dossier.ticker}`; }
export function newThesis(dossier) {
  return {version:THESIS_VERSION,companyKey:companyKey(dossier),name:'Base',explanation:'',alternative:'',
    nodes:NODE_IDS.map(id=>({id,statement:'',question:'',test:'',ifYes:'',ifNo:'',nextAt:'',material:true,evidence:[],draftSource:null}))};
}
export function validateThesis(t,dossier) {
  if(!exactKeys(t,['version','companyKey','name','explanation','alternative','nodes']) || t.version!==THESIS_VERSION || !textOK(t.name,80) || !t.name.trim() || !textOK(t.explanation) || !textOK(t.alternative) || !Array.isArray(t.nodes) || t.nodes.length!==6) throw Error('INVALID_THESIS');
  if(t.companyKey!==companyKey(dossier)) throw Error('IDENTITY_MISMATCH');
  const cutoff=Date.parse(dossier.asOf);
  if(!Number.isFinite(cutoff)) throw Error('INVALID_EVIDENCE');
  const sources=new Map(dossier.sources.map(s=>[s.id,s]));
  for(const s of sources.values()) {
    if(!Number.isFinite(Date.parse(s.acceptedAt)) || Date.parse(s.acceptedAt)>cutoff) throw Error('FUTURE_SOURCE');
    if(!/^[a-f0-9]{64}$/.test(s.sha256)) throw Error('INVALID_EVIDENCE');
  }
  const chunks=new Set(dossier.sections.flatMap(s=>s.extracts.map(e=>e.id)));
  t.nodes.forEach((n,i)=>{
    if(!exactKeys(n,['id','statement','question','test','ifYes','ifNo','nextAt','material','evidence','draftSource']) || n.id!==NODE_IDS[i] || !['statement','question','test','ifYes','ifNo'].every(k=>textOK(n[k])) || typeof n.material!=='boolean' || !textOK(n.nextAt,10) || (n.nextAt && (!/^\d{4}-\d{2}-\d{2}$/.test(n.nextAt) || !Number.isFinite(Date.parse(n.nextAt)) || new Date(n.nextAt).toISOString().slice(0,10)!==n.nextAt)) || !Array.isArray(n.evidence) || n.evidence.length>16) throw Error('INVALID_THESIS');
    if(n.draftSource!==null&&(!exactKeys(n.draftSource,['version','responseHash'])||!textOK(n.draftSource.version,100)||!/^[a-f0-9]{64}$/.test(n.draftSource.responseHash)))throw Error('INVALID_THESIS');
    const seen=new Set();
    for(const e of n.evidence) {
      if(!exactKeys(e,['chunkId','relation']) || !chunks.has(e.chunkId) || !sources.has(e.chunkId.split(':')[0]) || !['supports','contradicts','context'].includes(e.relation)) throw Error('INVALID_EVIDENCE');
      const key=`${e.chunkId}:${e.relation}`;if(seen.has(key))throw Error('INVALID_EVIDENCE');seen.add(key);
    }
  });
  return structuredClone(t);
}
export function evaluateThesis(thesis,now=new Date().toISOString()) {
  const nodes=thesis.nodes.map(n=>{
    const support=n.evidence.some(e=>e.relation==='supports'),against=n.evidence.some(e=>e.relation==='contradicts');
    const state=support&&against?'conflicted':against?'counterevidence':support&&n.statement.trim()?'linked_unverified':'unresolved';
    const discriminating=Boolean(n.question.trim()&&n.test.trim()&&n.ifYes.trim()&&n.ifNo.trim()&&n.ifYes.trim()!==n.ifNo.trim());
    return {id:n.id,state,claim:'user_interpretation',overdue:Boolean(n.nextAt&&n.nextAt<now.slice(0,10)),researchReady:n.material&&discriminating,
      question:n.question,test:n.test,ifYes:n.ifYes,ifNo:n.ifNo,nextAt:n.nextAt};
  });
  // A transparent work queue, not a security ranking. Due checks precede undated ones.
  const queue=nodes.filter(n=>n.researchReady).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.nextAt||'9999').localeCompare(b.nextAt||'9999')||NODE_IDS.indexOf(a.id)-NODE_IDS.indexOf(b.id));
  return {nodes,queue,nextCheck:queue[0]||null,capital:'not_assessed',capitalBlockers:['unreconciled_security_and_cash','no_validated_valuation','no_portfolio_mandate'],performance:null,predictiveClaim:false};
}
export function compareTheses(before,after) {
  if(!before)return {changed:[],recheck:[]};
  const changed=NODE_IDS.filter((id,i)=>JSON.stringify(before.nodes[i])!==JSON.stringify(after.nodes[i]));
  for(const key of ['explanation','alternative','name'])if(before[key]!==after[key])changed.push(key);
  // Review dependencies are workflow assumptions, NOT estimated causal relationships.
  const first=changed.some(id=>id==='explanation'||id==='alternative')?-1:Math.min(...changed.filter(id=>NODE_IDS.includes(id)).map(id=>NODE_IDS.indexOf(id)));
  return {changed,recheck:NODE_IDS.filter((id,i)=>i>first&&!changed.includes(id))};
}
export function compareEvidence(before,after) {
  const index=d=>new Map(d.sources.map(s=>[s.accession||s.url,s.sha256]));
  const a=index(before),b=index(after);
  const added=[...b.keys()].filter(k=>!a.has(k)),changed=[...b.keys()].filter(k=>a.has(k)&&a.get(k)!==b.get(k)),missing=[...a.keys()].filter(k=>!b.has(k));
  return {added,changed,missing,kind:added.length||changed.length||missing.length?'document_change_unclassified':'same_documents'};
}
export function assistedProposal(nodeId,report,dossier) {
  const sectionId={business:'business',cash:'cash',downside:'thesis'}[nodeId];
  if(!sectionId||!report?.analysis||!report.dossier||companyKey(report.dossier)!==companyKey(dossier)||compareEvidence(report.dossier,dossier).kind!=='same_documents')return null;
  const section=report.analysis.sections?.find(s=>s.id===sectionId),finding=section?.findings?.[0];
  if(!finding||typeof report.analysis.version!=='string'||!/^[a-f0-9]{64}$/.test(report.analysis.responseHash))return null;
  const chunks=new Map(dossier.sections.flatMap(s=>s.extracts.map(e=>[e.id,e.text])));
  if(!finding.evidence?.length||finding.evidence.some(e=>chunks.get(e.chunkId)!==e.quote))return null;
  return {statement:finding.text,question:section.unknowns?.[0]||'',test:section.checks?.[0]||'',
    evidence:finding.evidence.map(e=>({chunkId:e.chunkId,relation:'context'})),
    draftSource:{version:report.analysis.version,responseHash:report.analysis.responseHash}};
}
// An explicit user import of a question is not evidence or a verified thesis.
// Existing writing and source bindings are never overwritten by this proposal.
export function researchQuestionProposal(thesis,prompt,dossier){
 if(!prompt?.dossier||!NODE_IDS.includes(prompt.nodeId)||!textOK(prompt.question)||!prompt.question.trim()
  ||!textOK(prompt.test)||!prompt.test.trim()||companyKey(prompt.dossier)!==companyKey(dossier)
  ||prompt.dossier.asOf!==dossier.asOf||compareEvidence(prompt.dossier,dossier).kind!=='same_documents')return null;
 const node=thesis.nodes.find(n=>n.id===prompt.nodeId);
 if(!node||node.question||node.test)return null;
 return {nodeId:prompt.nodeId,question:prompt.question,test:prompt.test};
}

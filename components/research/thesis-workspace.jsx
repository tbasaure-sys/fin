"use client";
import {useEffect,useRef,useState} from 'react';
import {newThesis,evaluateThesis,compareEvidence,companyKey,NODE_IDS,assistedProposal} from '@/lib/research/thesis-engine.mjs';
import {THESIS_COPY} from './thesis-copy';
import styles from './thesis.module.css';
import {CapitalWorkspace} from './capital-workspace';

export function ThesisWorkspace({dossier,ticket,language,report,onRead}){
 const c=THESIS_COPY[language]||THESIS_COPY.es;
 const [thesis,setThesis]=useState(()=>newThesis(dossier));
 const [pinned,setPinned]=useState(dossier),[records,setRecords]=useState([]),[branch,setBranch]=useState('base');
 const [current,setCurrent]=useState(null),[parent,setParent]=useState(null),[active,setActive]=useState(0),[view,setView]=useState('editor');
 const [capitalDirty,setCapitalDirty]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const [reason,setReason]=useState(''),[kind,setKind]=useState('interpretation'),[attempt,setAttempt]=useState(0),[chunk,setChunk]=useState(''),[relation,setRelation]=useState('context');
 const saveController=useRef(null);
 useEffect(()=>()=>saveController.current?.abort(),[]);
 useEffect(()=>{
  const controller=new AbortController();let live=true;const timer=setTimeout(()=>controller.abort(),30000);
  setLoading(true);setError('');
  fetch(`/api/research/theses?ticker=${encodeURIComponent(dossier.ticker)}`,{signal:controller.signal,cache:'no-store'})
   .then(async r=>{const body=await r.json();if(!r.ok)throw Error(r.status===401?'AUTH_REQUIRED':body.error);if(!live)return;
    const rows=body.revisions.filter(r=>r.thesis.companyKey===companyKey(dossier));setRecords(rows);
    const base=rows.find(r=>r.branch==='base');if(base){setThesis(base.thesis);setPinned(base.dossier);setCurrent(base)}
   }).catch(e=>{if(live)setError(e.message||'THESIS_STORAGE_UNAVAILABLE')}).finally(()=>{clearTimeout(timer);if(live)setLoading(false)});
  return()=>{live=false;clearTimeout(timer);controller.abort()};
 },[dossier.ticker,dossier.cik,attempt]);
 useEffect(()=>{if(!dirty)return;const warn=e=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 const assessment=evaluateThesis(thesis),node=thesis.nodes[active],status=assessment.nodes[active];
 const proposal=assistedProposal(node.id,report,pinned);
 const documents=compareEvidence(pinned,dossier),chunks=[...new Map(pinned.sections.flatMap(s=>s.extracts.map(e=>[e.id,e]))).values()];
 const heads=[...new Map([...records].reverse().map(r=>[r.branch,r])).values()];
 function edit(key,value){setThesis(t=>({...t,[key]:value}));setDirty(true);setSaved(false)}
 function editNode(key,value){setThesis(t=>({...t,nodes:t.nodes.map((n,i)=>i===active?{...n,[key]:value}:n)}));setDirty(true);setSaved(false)}
 function choose(id){
  if((dirty||capitalDirty)&&!window.confirm(c.discard))return;
  const record=heads.find(r=>r.branch===id);if(!record)return;
  setBranch(id);setCurrent(record);setParent(null);setThesis(record.thesis);setPinned(record.dossier);setDirty(false);setSaved(false);setError('');setReason('');setChunk('');
 }
 function fork(){if(dirty||!current)return;if(capitalDirty&&!window.confirm(c.discard))return;setBranch(`scenario-${crypto.randomUUID()}`);setParent(current);setCurrent(null);setThesis({...thesis,name:c.newScenario});setDirty(true);setSaved(false);setReason('');setError('')}
 async function save(){
  if(capitalDirty&&!window.confirm(c.discard))return;
  if(saving)return;const controller=new AbortController();saveController.current=controller;
  const timer=setTimeout(()=>controller.abort(),30000);setSaving(true);setError('');setSaved(false);
  try{
   const response=await fetch('/api/research/theses',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
    body:JSON.stringify({thesis,dossier:pinned,ticket,branch,expectedRevision:current?.revision||0,parentHash:parent?.hash||null,reason,changeKind:kind})});
   const body=await response.json();if(!response.ok)throw Error(response.status===401?'AUTH_REQUIRED':body.error);
   const record=body.revision;setCurrent(record);setParent(null);setRecords(rows=>[record,...rows].slice(0,100));setDirty(false);setSaved(true);setReason('');
  }catch(e){setError(e.message||'THESIS_STORAGE_UNAVAILABLE')}
  finally{clearTimeout(timer);setSaving(false);saveController.current=null}
 }
 function download(){const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),unsaved:dirty,branch,thesis,dossier:pinned,assessment,revisions:records},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${dossier.ticker}-thesis.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function adopt(){if(!window.confirm(c.adoptConfirm))return;setPinned(dossier);setThesis(t=>({...t,nodes:t.nodes.map(n=>({...n,evidence:[]}))}));setDirty(true);setSaved(false);setKind('document_update');setChunk('')}
 function importDraft(){if(!proposal||node.statement||node.question||node.test||node.evidence.length)return;setThesis(t=>({...t,nodes:t.nodes.map((n,i)=>i===active?{...n,...proposal}:n)}));setDirty(true);setSaved(false)}
 const label=id=>c.labels[NODE_IDS.indexOf(id)]||({explanation:c.explanation,alternative:c.alternative,name:c.name}[id]||id);
 const describe=n=>n?['statement','question','test','ifYes','ifNo','nextAt'].filter(k=>n[k]).map(k=>`${c[k]}: ${n[k]}`).concat(n.evidence.map(e=>`${c.relation[e.relation]}: ${e.chunkId}`)).join('\n')||'—':'—';
 return <section className={styles.desk} aria-label={c.title}>
  <header className={styles.heading}><div><p className={styles.eyebrow}>01 / {language==='en'?'LIVING THESIS':'TESIS VIVA'}</p><h2>{c.title}</h2><p>{c.intro}</p></div><button type="button" className={styles.textButton} onClick={download}>{c.download} ↓</button></header>
  {loading?<p role="status">{language==='en'?'Loading your private revisions…':'Cargando tus revisiones privadas…'}</p>:null}
  {error?<div role="alert" className={styles.error}><p>{c.errors[error]||c.errors.THESIS_STORAGE_UNAVAILABLE}</p>{!dirty?<button onClick={()=>setAttempt(a=>a+1)}>{c.retry}</button>:null}</div>:null}
  <fieldset disabled={loading||saving} className={styles.fieldset}>
   <div className={styles.toolbar}>
    <label>{c.scenario}<select aria-label={c.scenario} value={branch} onChange={e=>choose(e.target.value)}>{!heads.some(h=>h.branch===branch)?<option value={branch}>{thesis.name}</option>:null}{heads.map(h=><option key={h.branch} value={h.branch}>{h.thesis.name} · v{h.revision}</option>)}</select></label>
    <button onClick={fork} disabled={!current||dirty}>{c.fork}</button>
    <nav aria-label={language==='en'?'Thesis views':'Vistas de tesis'}><button aria-pressed={view==='editor'} onClick={()=>setView('editor')}>{c.editor}</button><button aria-pressed={view==='capital'} onClick={()=>setView('capital')}>{language==='en'?'Valuation and portfolio':'Valoración y cartera'}</button><button aria-pressed={view==='history'} onClick={()=>setView('history')}>{c.history}</button></nav>
   </div>
   <p className={styles.provenance}>{c.cutoff}: {pinned.asOf.slice(0,10)} · {c.noClaim}</p>
   {documents.kind!=='same_documents'?<div className={styles.error}><p>{c.newDocs}</p><button onClick={adopt}>{c.adopt}</button></div>:null}
   {view==='history'?<div className={styles.history}>
    <h3>{c.history}</h3><p>{documents.kind==='same_documents'?c.sameDocs:c.newDocs}</p>
    {!records.length?<p>{c.none}</p>:null}
    {records.map(r=>{const prior=records.find(p=>p.hash===r.parentHash);return <details key={r.hash}><summary>{r.thesis.name} · v{r.revision} · {r.savedAt.slice(0,16).replace('T',' ')} UTC</summary><p>{r.reason}</p><p>{c.kinds[r.changeKind]} · {language==='en'?'Economic novelty not verified':'Novedad económica no verificada'}</p>
     {r.changes.changed.map(id=><div key={id}><strong>{label(id)}</strong><p>{language==='en'?'Before: ':'Antes: '}{prior?(NODE_IDS.includes(id)?describe(prior.thesis.nodes.find(n=>n.id===id)):prior.thesis[id])||'—':'—'}</p><p>{language==='en'?'After: ':'Después: '}{NODE_IDS.includes(id)?describe(r.thesis.nodes.find(n=>n.id===id)):r.thesis[id]}</p></div>)}
     <p>{c.dependency}: {r.changes.recheck.map(label).join(' → ')||'—'}</p><small>{r.hash}</small></details>})}
    {records.length===100?<p>{c.historyLimit}</p>:null}
   </div>:<div hidden={view!=='editor'}>
    <div className={styles.explanations}>
     <label>{c.explanation}<textarea aria-label={c.explanation} maxLength={2000} rows={4} value={thesis.explanation} onChange={e=>edit('explanation',e.target.value)} placeholder={language==='en'?'What would have to be true?':'¿Qué tendría que ser cierto?'} /></label>
     <label>{c.alternative}<textarea aria-label={c.alternative} maxLength={2000} rows={4} value={thesis.alternative} onChange={e=>edit('alternative',e.target.value)} placeholder={language==='en'?'The strongest explanation against your thesis.':'La explicación más fuerte en contra de tu tesis.'} /></label>
    </div>
    <div className={styles.bridge}><p className={styles.eyebrow}>{c.bridge}</p><nav aria-label={c.bridge}>{c.labels.map((name,i)=><button key={name} aria-pressed={active===i} onClick={()=>{setActive(i);setChunk('')}}><span>0{i+1}</span> {name}</button>)}</nav></div>
    <div className={styles.columns}><div className={styles.editor}>
     <div className={styles.nodeTitle}><h3>{c.labels[active]}</h3><span>{c.state[status.state]}</span></div><p>{c.prompts[active]}</p>
     {proposal?<button onClick={importDraft} disabled={Boolean(node.statement||node.question||node.test||node.evidence.length)}>{language==='en'?'Use reading as a draft':'Usar lectura como borrador'}</button>:!report?<button className={styles.textButton} onClick={onRead}>{language==='en'?'Start with documents and an assisted reading →':'Empezar por documentos y una lectura asistida →'}</button>:null}
     {node.draftSource?<p>{language==='en'?'Origin: assisted reading · still to be tested':'Origen: lectura asistida · aún por contrastar'}</p>:null}
     <label>{c.statement}<textarea aria-label={c.statement} rows={3} maxLength={2000} value={node.statement} onChange={e=>editNode('statement',e.target.value)} /></label>
     <details className={styles.evidence}><summary>{c.evidence} · {node.evidence.length}</summary><p>{c.evidenceHint}</p>
      <label>{c.select}<select value={chunk} onChange={e=>setChunk(e.target.value)}><option value="">—</option>{chunks.map(e=><option key={e.id} value={e.id}>{e.id} · {e.text.slice(0,90)}</option>)}</select></label>
      {chunk?<blockquote lang="en">{chunks.find(e=>e.id===chunk)?.text}</blockquote>:null}
      <label>{language==='en'?'Relationship':'Relación'}<select value={relation} onChange={e=>setRelation(e.target.value)}>{Object.entries(c.relation).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <button disabled={!chunk||node.evidence.length>=16||node.evidence.some(e=>e.chunkId===chunk&&e.relation===relation)} onClick={()=>{editNode('evidence',[...node.evidence,{chunkId:chunk,relation}]);setChunk('')}}>{c.add}</button>
      {node.evidence.map((e,i)=>{const quote=chunks.find(v=>v.id===e.chunkId),source=pinned.sources.find(s=>s.id===e.chunkId.split(':')[0]);return <details key={`${e.chunkId}:${e.relation}`}><summary>{e.chunkId} · {c.relation[e.relation]}</summary><blockquote lang="en">{quote?.text}</blockquote><a href={source?.url} target="_blank" rel="noreferrer">{c.quote} ↗</a><p>{source?.acceptedAt} · SHA-256 {source?.sha256}</p><button onClick={()=>editNode('evidence',node.evidence.filter((_,j)=>j!==i))}>{c.remove}</button></details>})}
     </details>
     <label>{c.question}<textarea aria-label={c.question} rows={2} maxLength={2000} value={node.question} onChange={e=>editNode('question',e.target.value)} /></label>
     <label>{c.test}<textarea aria-label={c.test} rows={2} maxLength={2000} value={node.test} onChange={e=>editNode('test',e.target.value)} /></label>
     <div className={styles.twoFields}>{['ifYes','ifNo'].map(key=><label key={key}>{c[key]}<textarea aria-label={c[key]} rows={2} maxLength={2000} value={node[key]} onChange={e=>editNode(key,e.target.value)} /></label>)}</div>
     <div className={styles.twoFields}><label>{c.nextAt}<input type="date" value={node.nextAt} onChange={e=>editNode('nextAt',e.target.value)} /></label><label className={styles.check}><input type="checkbox" checked={node.material} onChange={e=>editNode('material',e.target.checked)} />{c.material}</label></div>
     <details className={styles.dependency}><summary>{c.dependency}</summary><p>{c.labels.slice(active+1).join(' → ')||'—'}</p><small>{c.dependencyNote}</small></details>
    </div><aside className={styles.attention}>
     <section data-testid="next-check"><p className={styles.eyebrow}>{c.next}</p>{assessment.nextCheck?<><h3>{label(assessment.nextCheck.id)}</h3><p>{assessment.nextCheck.question}</p><strong>{assessment.nextCheck.test}</strong><p>{c.ifYes}: {assessment.nextCheck.ifYes}<br/>{c.ifNo}: {assessment.nextCheck.ifNo}</p>{assessment.nextCheck.overdue?<p>{c.overdue}</p>:null}</>:<p>{c.noNext}</p>}<small>{c.queueRule}</small></section>
     <section><h3>{c.capital}</h3><p>{c.capitalBody}</p></section>
    </aside></div>
    <div className={styles.saveBar}>
     <label>{c.name}<input maxLength={80} value={thesis.name} onChange={e=>edit('name',e.target.value)} /></label>
     <label>{c.kind}<select value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(c.kinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
     <label className={styles.reason}>{c.reason}<input maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} /></label>
     <button className={styles.primary} onClick={save} disabled={!dirty||!reason.trim()||!thesis.name.trim()}>{saving?c.saving:c.save}</button>
    </div>
    <p role="status" className={styles.saveStatus}>{saved?`${c.saved} · v${current?.revision}`:dirty?c.unsaved:''}</p>
   </div>}
   {view==='capital'&&dirty?<p>{language==='en'?'Save your thesis changes first to value this revision.':'Guarda los cambios de tu tesis antes de valorar esta revisión.'}</p>:null}
   <div hidden={view!=='capital'||dirty}><CapitalWorkspace key={current?.hash||'unsaved'} revision={current} language={language} active={view==='capital'} onDirty={setCapitalDirty}/></div>
  </fieldset>
 </section>;
}

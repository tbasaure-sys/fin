'use client';
import {useEffect,useRef,useState} from 'react';
import {requestAnalysis} from '@/lib/research/analysis-client.mjs';
import styles from './terminal.module.css';
const titles={es:['Tesis de inversión','Caso favorable','Caso contrario','Riesgos','Catalizadores y próximos hitos','Qué invalidaría la tesis'],en:['Investment thesis','Bull case','Bear case','Risks','Catalysts and milestones','What would invalidate the thesis']};
function ThesisFinding({finding,sourceDossier,en}){
 const premiseLabels={supports:en?'Premise supported by the quoted text':'Premisa respaldada por el texto citado',contradicts:en?'Evidence contradicts the premise':'La evidencia contradice la premisa',context:en?'Related evidence; premise not established':'Evidencia relacionada; premisa no establecida',unknown:en?'Premise support unresolved':'Respaldo de la premisa sin resolver'};
 const reasoningLabels={bounded:en?'Conditional reasoning; not a verified outcome':'Razonamiento condicional; resultado no verificado',overreach:en?'Argument exceeds the evidence':'El argumento excede la evidencia',unknown:en?'Reasoning review unresolved':'Revisión del razonamiento sin resolver'};
 const content=<>
  <p><strong>{en?'Source premise: ':'Premisa de origen: '}</strong>{finding.premise}</p>
  <p className={styles.caption}>Jev · {premiseLabels[finding.premiseStatus||'unknown']}</p>
  <p><strong>{finding.kind==='test'?(en?'Proposed test: ':'Prueba propuesta: '):finding.kind==='reported'?(en?'Reported statement: ':'Declaración reportada: '):(en?'Conditional argument: ':'Argumento condicional: ')}</strong>{finding.text}</p>
  <p className={styles.caption}>Jev · {reasoningLabels[finding.reasoningStatus||'unknown']}</p>
  {finding.timing?.date?<p className={styles.caption}>{en?'Calendar period in source: ':'Período calendario en la fuente: '}{finding.timing.date}</p>:null}
  {finding.evidence.map(e=>{const source=sourceDossier.sources.find(s=>s.id===e.chunkId.split(':')[0]);return <details key={`${e.chunkId}:${e.spanId}`}><summary>{en?'View source':'Ver fuente'} · {source?.form||e.chunkId}{source?.acceptedAt?` · ${source.acceptedAt.slice(0,10)}`:''}</summary><blockquote lang="en">{e.span}</blockquote><details><summary>{en?'Full excerpt':'Extracto completo'}</summary><blockquote lang="en">{e.quote}</blockquote></details>{source?<a href={source.url} target="_blank" rel="noreferrer">{en?'Open original document':'Abrir documento original'}</a>:null}</details>})}
 </>;
 return finding.reviewState==='challenged'?<details><summary>{en?'Challenged argument — inspect before using':'Argumento cuestionado: revisar antes de usar'}</summary>{content}</details>:<div>{content}</div>;
}
export function InvestmentThesis({dossier,ticket,available,language}){
 const en=language==='en',lang=en?'en':'es';
 const [state,setState]=useState({busy:false,report:null,error:''}),[follow,setFollow]=useState({busy:false,message:'',error:''}),controller=useRef(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function generate(){
  if(controller.current)return;
  const ac=new AbortController();controller.current=ac;
  const timer=setTimeout(()=>ac.abort(),115000);setState({busy:true,report:null,error:''});
  try{const body=await requestAnalysis({dossier,ticket,language:lang},{endpoint:'/api/research/investment-thesis',signal:ac.signal});if(!ac.signal.aborted)setState({busy:false,report:body,error:''})}
  catch(e){setState({busy:false,report:null,error:e.name==='AbortError'?'TIMEOUT':e.message})}
  finally{clearTimeout(timer);controller.current=null}
 }
 const report=state.report?.analysis,sourceDossier=state.report?.reportDossier||dossier;
 const errors={AUTH_REQUIRED:en?'Sign in again to generate your thesis.':'Vuelve a iniciar sesión para generar la tesis.',DOSSIER_EXPIRED:en?'Reload the company page to refresh its documents.':'Recarga la página de la empresa para actualizar sus documentos.',DAILY_LIMIT:en?'Today’s generation capacity has been reached. Try again later.':'Se alcanzó la capacidad de generación de hoy. Reintenta más tarde.',RATE_LIMITED:en?'Please wait a minute before trying again.':'Espera un minuto antes de reintentar.',PROVIDER_RATE_LIMIT:en?'The analysis provider is temporarily at capacity. Try again later.':'El proveedor de análisis alcanzó su capacidad temporal. Reintenta más tarde.',INVALID_ANALYSIS:en?'The generated draft failed its evidence or format checks. Try again.':'El borrador no superó los controles de evidencia o formato. Reintenta.',REPORT_PENDING:en?'The thesis is still being generated. Try again shortly to retrieve it.':'La tesis sigue en preparación. Reintenta en unos segundos para recuperarla.'};
 async function followCase(){
  if(!report||follow.busy)return;setFollow({busy:true,message:'',error:''});
  try{const response=await fetch('/api/research/living-case',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'follow',dossier,ticket,language:lang})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'CASE_UNAVAILABLE');
   setFollow({busy:false,message:en?'Saved to your private portfolio follow-up.':'Guardada para seguimiento en tu cartera privada.',error:''});
  }catch{setFollow({busy:false,message:'',error:en?'Could not save the case. Reload the company page and retry.':'No pudimos guardarla. Recarga la página de la empresa y reintenta.'})}
 }
 function download(){const url=URL.createObjectURL(new Blob([JSON.stringify(state.report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${dossier.ticker}-investment-thesis.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className={`${styles.panel} ${styles.jevPanel}`} aria-label={en?'Generated investment thesis':'Tesis de inversión generada'} aria-busy={state.busy}>
  <h2>{en?`Investment thesis · ${dossier.ticker}`:`Tesis de inversión · ${dossier.ticker}`}</h2>
  <p>{en?'Start with our analysis: the investment case, the strongest counterargument, risks, milestones and what would change the conclusion. No thesis or saved notes required.':'Empieza con nuestro análisis: la tesis, su principal contraargumento, riesgos, hitos y qué cambiaría la conclusión. No necesitas escribir una tesis ni guardar notas.'}</p>
  {!report?<>
   <button type="button" onClick={generate} disabled={state.busy||!ticket||!available}>{state.busy?(en?'Generating and reviewing thesis…':'Generando y revisando la tesis…'):(en?'Generate investment thesis':'Generar tesis de inversión')}</button>
   <p className={styles.caption}>{en?'Uses the company’s public filing excerpts. Jev reviews the generated claims against their sources when available. Your private notes and holdings are not sent.':'Usa extractos de los documentos públicos de la empresa. Jev contrasta las afirmaciones generadas con sus fuentes cuando está disponible. No se envían tus notas privadas ni posiciones.'}</p>
   {state.busy?<p role="status">{en?'Reading the filings, building both cases and checking the draft. This can take about a minute.':'Leyendo los documentos, desarrollando ambos casos y contrastando el borrador. Puede tardar cerca de un minuto.'}</p>:null}
   {!available||!ticket?<p role="status">{en?'Thesis generation is currently unavailable. The company documents remain accessible.':'La generación de tesis no está disponible en este momento. Puedes consultar los documentos de la empresa.'}</p>:null}
  </>:null}
  {state.error?<p role="alert">{errors[state.error]||(en?'We could not finish the thesis. Retry; your existing work is preserved.':'No pudimos completar la tesis. Reintenta; tu trabajo existente se conserva.')}</p>:null}
  {report?<>
   <p>{en?'Research cutoff':'Corte de investigación'} · {sourceDossier.asOf.slice(0,10)}{state.report.cached?(en?' · Saved report retrieved':' · Informe guardado recuperado'):''}</p>
   <p className={styles.caption}>{en?'The cutoff is the retrieval date, not the date of the events. Filing dates appear with each source.':'El corte es la fecha de consulta, no la fecha de los eventos. Cada fuente muestra la fecha de presentación.'}</p>
   <p className={styles.caption}>{en?'Based on selected filing excerpts. Quotes are checked against the source; the thesis remains an interpretation. A fair value or price target has not been calculated.':'Basado en extractos seleccionados. Las citas se comprueban contra la fuente; la tesis sigue siendo una interpretación. No se ha calculado un valor razonable ni un precio objetivo.'}</p>
   <p role="status">{['available','partial'].includes(report.review?.status)?(en?'Jev evidence review included below; unresolved claims remain tentative.':'La revisión de evidencia de Jev se muestra abajo; las afirmaciones sin resolver siguen siendo tentativas.'):(en?'Jev review was unavailable for this draft. The source-linked draft is shown without that review.':'La revisión de Jev no estuvo disponible para este borrador. Se muestra el análisis con sus fuentes, sin esa revisión.')}</p>
   {report.sections.map((section,index)=><section key={section.id}>
    <h3>{titles[lang][index]}</h3>
    {section.withheld?<p className={styles.caption}>{en?'A generated claim was withheld because its figures could not be matched to its cited excerpts.':'Se omitió una afirmación generada porque sus cifras no coincidían con sus extractos citados.'}</p>:null}
    {!section.findings.length?<p>{en?'The available excerpts do not support a conclusion for this section.':'Los extractos disponibles no respaldan una conclusión para esta sección.'}</p>:null}
    {section.id==='catalysts'?<>
     <h4>{en?'Upcoming milestones with dated evidence':'Próximos hitos con evidencia fechada'}</h4>
     {!section.findings.some(f=>f.timing.status==='upcoming')?<p>{en?'No upcoming catalyst could be established from these excerpts.':'No se pudo establecer un próximo catalizador con estos extractos.'}</p>:null}
     {['upcoming','undated','historical'].map(status=>{const findings=section.findings.filter(f=>f.timing.status===status);return findings.length?<div key={status}>
      {status==='historical'?<h4>{en?'Historical context — already elapsed':'Contexto histórico: ya transcurrido'}</h4>:status==='undated'?<h4>{en?'Timing or completion unconfirmed':'Fecha o cumplimiento sin confirmar'}</h4>:null}
      {findings.map((finding,i)=><ThesisFinding key={i} finding={finding} sourceDossier={sourceDossier} en={en}/>)}
     </div>:null})}
    </>:section.findings.map((finding,i)=><ThesisFinding key={i} finding={finding} sourceDossier={sourceDossier} en={en}/>)}
    <h4>{en?'What remains unknown':'Qué falta por saber'}</h4><ul>{section.unknowns.map((t,i)=><li key={i}>{t}</li>)}</ul>
    <h4>{en?'What to check next':'Qué comprobar después'}</h4><ul>{section.checks.map((t,i)=><li key={i}>{t}</li>)}</ul>
   </section>)}
   <div><button type="button" onClick={followCase} disabled={follow.busy}>{follow.busy?(en?'Saving…':'Guardando…'):(en?'Follow this thesis':'Seguir esta tesis')}</button> <a href={`/app/carteras?lang=${lang}`}>{en?'My portfolio and followed cases':'Mi cartera y tesis seguidas'}</a></div>
   {follow.message?<p role="status">{follow.message}</p>:null}{follow.error?<p role="alert">{follow.error}</p>:null}
   <button type="button" onClick={download}>{en?'Download thesis and sources':'Descargar tesis y fuentes'}</button>
  </>:null}
 </section>;
}

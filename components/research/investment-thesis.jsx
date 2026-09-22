'use client';
import {useEffect,useRef,useState} from 'react';
import {requestAnalysis} from '@/lib/research/analysis-client.mjs';
import styles from './terminal.module.css';
const titles={es:['Tesis de inversión','Caso favorable','Caso contrario','Riesgos','Catalizadores y próximos hitos','Qué invalidaría la tesis'],en:['Investment thesis','Bull case','Bear case','Risks','Catalysts and milestones','What would invalidate the thesis']};
export function InvestmentThesis({dossier,ticket,available,language}){
 const en=language==='en',lang=en?'en':'es';
 const [state,setState]=useState({busy:false,report:null,error:''}),controller=useRef(null);
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
   <p>{en?'Generated research draft':'Borrador de investigación generado'} · {sourceDossier.asOf.slice(0,10)}{state.report.cached?(en?' · Saved report retrieved':' · Informe guardado recuperado'):''}</p>
   <p className={styles.caption}>{en?'Based on selected filing excerpts. Quotes are checked against the source; the thesis remains an interpretation. A fair value or price target has not been calculated.':'Basado en extractos seleccionados. Las citas se comprueban contra la fuente; la tesis sigue siendo una interpretación. No se ha calculado un valor razonable ni un precio objetivo.'}</p>
   <p role="status">{['available','partial'].includes(report.review?.status)?(en?'Jev evidence review included below; unresolved claims remain tentative.':'La revisión de evidencia de Jev se muestra abajo; las afirmaciones sin resolver siguen siendo tentativas.'):(en?'Jev review was unavailable for this draft. The source-linked draft is shown without that review.':'La revisión de Jev no estuvo disponible para este borrador. Se muestra el análisis con sus fuentes, sin esa revisión.')}</p>
   {report.sections.map((section,index)=><section key={section.id}>
    <h3>{titles[lang][index]}</h3>
    {section.withheld?<p className={styles.caption}>{en?'A generated claim was withheld because its figures could not be matched to its cited excerpts.':'Se omitió una afirmación generada porque sus cifras no coincidían con sus extractos citados.'}</p>:null}
    {!section.findings.length?<p>{en?'The available excerpts do not support a conclusion for this section.':'Los extractos disponibles no respaldan una conclusión para esta sección.'}</p>:null}
    {section.findings.map((finding,i)=>{const review=report.review?.items?.find(r=>r.id===`${section.id}:${i}`),answer=review?.answers?.relation;return <div key={i}>
     <p>{finding.text}</p>
     {answer?<p className={styles.caption}>Jev · {answer.uncertain?(en?'Unresolved':'Sin resolver'):({supports:en?'Textual support':'Apoyo textual',contradicts:en?'Contradictory evidence':'Evidencia contradictoria',mixed:en?'Mixed evidence':'Evidencia mixta',context:en?'Context only':'Solo contexto',unknown:en?'Unresolved':'Sin resolver'}[answer.choice])}</p>:null}
     {finding.evidence.map(e=>{const source=sourceDossier.sources.find(s=>s.id===e.chunkId.split(':')[0]);return <details key={e.chunkId}><summary>{en?'View source':'Ver fuente'} · {source?.form||e.chunkId}</summary><blockquote lang="en">{e.quote}</blockquote>{source?<a href={source.url} target="_blank" rel="noreferrer">{en?'Open original document':'Abrir documento original'}</a>:null}</details>})}
    </div>})}
    <h4>{en?'What remains unknown':'Qué falta por saber'}</h4><ul>{section.unknowns.map((t,i)=><li key={i}>{t}</li>)}</ul>
    <h4>{en?'What to check next':'Qué comprobar después'}</h4><ul>{section.checks.map((t,i)=><li key={i}>{t}</li>)}</ul>
   </section>)}
   <button type="button" onClick={download}>{en?'Download thesis and sources':'Descargar tesis y fuentes'}</button>
  </>:null}
 </section>;
}

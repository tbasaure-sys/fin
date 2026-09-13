"use client";
import {trackProductEvent} from '@/lib/product-events.mjs';
import {useEffect,useRef,useState} from 'react';
import styles from './research.module.css';
import {requestAnalysis} from '@/lib/research/analysis-client.mjs';
import {reportDelivery} from '@/lib/research/report-delivery.mjs';

const COPY={es:{
 title:'Informe del negocio',generate:'Generar informe',busy:'Analizando las fuentes…',
 intro:'Analiza el negocio, la caja, los riesgos y las preguntas que faltan por resolver. Al continuar, se envían únicamente extractos de documentos públicos a un servicio externo de análisis.',
 draft:'Borrador de IA · requiere revisión',caution:'Las citas coinciden con los extractos. Eso no verifica la interpretación ni los cálculos. Sin precio y expectativas contrastadas no hay diagnóstico de mispricing.',
 unavailable:'El proveedor no está disponible. La evidencia documental sigue accesible.',
 missing:'Preguntas abiertas',checks:'Dónde contrastarlas',cite:'Ver cita de respaldo',download:'Descargar informe y fuentes',
 kinds:{reported_fact:'Declaración del filing',interpretation:'Interpretación',hypothesis:'Hipótesis por contrastar'},
 errors:{PROVIDER_REQUEST_TOO_LARGE:'No pudimos procesar este expediente: el envío de documentos superó la capacidad por solicitud. Es un fallo de nuestra integración, no de tu cuenta. Reintentar el mismo envío no lo resuelve; las fuentes siguen disponibles.',RATE_LIMITED:'Recibimos varias solicitudes seguidas. Espera un minuto antes de generar otro informe.',DAILY_LIMIT:'Se alcanzó la capacidad diaria de análisis. Tus documentos siguen disponibles.',AUTH_REQUIRED:'Tu sesión expiró. Inicia sesión para continuar.',REPORT_PENDING:'El informe sigue en preparación. Vuelve a consultarlo en unos segundos.',REPORT_STORAGE_UNAVAILABLE:'No pudimos recuperar o guardar el informe. Tus fuentes siguen disponibles.',PROVIDER_RATE_LIMIT:'Se alcanzó un límite de capacidad del servicio de análisis.',DOSSIER_EXPIRED:'El permiso de análisis expiró. Recarga el expediente antes de reintentar.',INVALID_ANALYSIS:'No logramos validar el informe después de intentar repararlo automáticamente. No mostramos afirmaciones sin respaldo. Puedes descargar el expediente y consultar las fuentes mientras resolvemos el fallo.',LIMIT_UNAVAILABLE:'No pudimos comprobar la disponibilidad del servicio. No se inició el análisis.'},
},en:{
 title:'Business report',generate:'Generate report',busy:'Analyzing sources…',
 intro:'Explore the business, cash generation, risks and unanswered questions. Continuing sends only excerpts from public documents to an external analysis service.',
 draft:'AI draft · review required',caution:'Quotes match the excerpts. This does not verify interpretations or calculations. Without price and independently checked expectations, mispricing remains unresolved.',
 unavailable:'The provider is unavailable. Documentary evidence remains accessible.',missing:'Open questions',checks:'Where to investigate',cite:'View supporting quote',download:'Download report and sources',
 kinds:{reported_fact:'Filing statement',interpretation:'Interpretation',hypothesis:'Hypothesis to test'},
 errors:{PROVIDER_REQUEST_TOO_LARGE:'We could not process this dossier: the document request exceeded the per-request capacity. This is an integration fault, not an issue with your account. Retrying the same request will not fix it; your sources remain available.',RATE_LIMITED:'Several requests arrived in quick succession. Wait one minute before generating another report.',DAILY_LIMIT:'Daily analysis capacity has been reached. Your documents remain available.',AUTH_REQUIRED:'Your session expired. Sign in to continue.',REPORT_PENDING:'The report is still being prepared. Check again shortly.',REPORT_STORAGE_UNAVAILABLE:'The report could not be retrieved or saved. Your sources remain available.',PROVIDER_RATE_LIMIT:'The analysis service reached a capacity limit.',DOSSIER_EXPIRED:'The analysis permit expired. Reload the dossier before retrying.',INVALID_ANALYSIS:'The report could not be validated after automatic repair was attempted. Unsupported claims are withheld. You can download the dossier and consult the sources while we investigate.',LIMIT_UNAVAILABLE:'Service availability could not be checked. No analysis was started.'},
}};
export function AnalysisPanel({dossier,ticket,available,language,sectionId,onStarted,onReport}){
 const copy=COPY[language]||COPY.es;
 const [state,setState]=useState({analysis:null,loading:false,error:null});
 const controller=useRef(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function generate(){
  if(controller.current)return;
  const abort=new AbortController();controller.current=abort;
  const timer=setTimeout(()=>abort.abort(),115000);
  setState({analysis:null,loading:true,error:null});
  onStarted?.();
  try{
   const body=await requestAnalysis({dossier,ticket,language},{signal:abort.signal});
   setState({analysis:body.analysis,reportDossier:body.reportDossier||dossier,cached:body.cached===true,loading:false,error:null});
   onReport?.({analysis:body.analysis,dossier:body.reportDossier||dossier});
   // A transport success or a page of unanswered questions is not a delivered brief.
   if(reportDelivery(body.analysis).status==='documentary_brief')trackProductEvent('report_generated');
  }catch(e){setState({analysis:null,loading:false,error:e.message,reference:e.reference,retryAfterSeconds:e.retryAfterSeconds})}
  finally{clearTimeout(timer);controller.current=null}
 }
 function download(){
  const url=URL.createObjectURL(new Blob([JSON.stringify({dossier:state.reportDossier||dossier,analysis:state.analysis},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`${dossier.ticker}-filing-analysis.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const section=state.analysis?.sections.find(s=>s.id===sectionId);
 const delivery=reportDelivery(state.analysis);
 const sectionDelivery=delivery.sections.find(s=>s.id===sectionId);
 const reportDossier=state.reportDossier||dossier;
 const consulted=reportDossier.sections.find(s=>s.id===sectionId)?.extracts||[];
 const en=language==='en';
 return <section className={styles.analysis} data-analysis aria-busy={state.loading}>
  <h3>{copy.title}</h3>
  {!state.analysis?<>
   <p>{copy.intro}</p>
   <button className={styles.analysisButton} onClick={generate} disabled={!ticket||!available||state.loading}>
    {state.loading?copy.busy:copy.generate}
   </button>
   {(!ticket||!available)?<p>{copy.unavailable}</p>:null}
   {state.loading?<p role="status">{language==='en'?'Reading, checking citations and independently reviewing the draft. Format errors receive one automatic repair per stage.':'Leyendo, comprobando citas y revisando el borrador. Los errores de formato reciben una reparación automática por etapa.'}</p>:null}
  </>:<>
   <div className={styles.reportMeta}>
    <strong data-report-section-state={sectionDelivery?.status||'insufficient'}>{sectionDelivery?.status==='insufficient'?(en?'Insufficient analysis in this section':'Análisis insuficiente en esta sección'):sectionDelivery?.status==='partial'?(en?'Partial documentary analysis':'Análisis documental parcial'):(en?'Documentary analysis':'Análisis documental')}</strong>
    <small>{en?'AI-assisted · ':'Asistido por IA · '}{state.analysis.generatedAt?.slice(0,10)}</small>
   </div>
   {section?.findings.length>0&&delivery.status!=='documentary_brief'?<p className={styles.reportScope}>{en?'These findings cover part of the research. Open questions remain; this is not a complete investment assessment.':'Estos hallazgos cubren parte de la investigación. Quedan cuestiones abiertas; no es una evaluación integral de inversión.'}</p>:null}
   {section?.findings.map((finding,i)=><div className={styles.finding} key={i}>
    <span className={styles.kicker}>{copy.kinds[finding.kind]}</span><p>{finding.text}</p>
    {finding.evidence.map((e,j)=>{const source=(state.reportDossier||dossier).sources.find(s=>s.id===e.chunkId.split(':')[0]);return <details key={j}>
      <summary>{copy.cite}</summary><blockquote lang="en">{e.quote}</blockquote>
      <a href={source?.url} target="_blank" rel="noreferrer">{source?.form} · {e.chunkId} ↗</a>
    </details>})}
   </div>)}
   {!section?.findings.length?<div className={styles.reportGap}>
    <p>{en?'The analysis could not support an explanation for this section. This does not mean the company has no information or that the business is weak.':'El análisis no logró sostener una explicación para esta sección. Eso no significa que la empresa no informe ni que el negocio sea débil.'}</p>
    {consulted.length>0?<details className={styles.consultedSources} data-consulted-sources key={`${reportDossier.asOf}:${sectionId}`}>
     <summary>{en?'View the passages consulted':'Ver los pasajes consultados'} ({consulted.length})</summary>
     <p>{en?'Original excerpts, not conclusions. Report source cutoff: ':'Extractos originales, no conclusiones. Corte documental del informe: '}{reportDossier.asOf?.slice(0,10)}.</p>
     {consulted.map(extract=>{const source=reportDossier.sources.find(s=>s.id===extract.id.split(':')[0]);return <div key={extract.id}>
      <blockquote lang="en">{extract.text}</blockquote>
      {source?<a href={source.url} target="_blank" rel="noreferrer">{source.form} · {extract.id} ↗</a>:null}
     </div>})}
    </details>:null}
    <a href={`#sources-${sectionId}`}>{en?'Read the sources for this section':'Consultar las fuentes de esta sección'} →</a>
   </div>:null}
   {section?.unknowns.length>0?<><h4>{copy.missing}</h4><ul>{section.unknowns.map((s,i)=><li key={i}>{s}</li>)}</ul></>:null}
   {section?.checks.length>0?<><h4>{copy.checks}</h4><ul>{section.checks.map((s,i)=><li key={i}>{s}</li>)}</ul></>:null}
   <details className={styles.reportAudit}>
    <summary>{en?'Sources, scope and review':'Fuentes, alcance y revisión'}</summary>
    <p>{copy.draft}. {copy.caution}</p>
    {state.cached?<p>{en?'Saved report · reused without generating it again. Original source cutoff: ':'Informe guardado · recuperado sin generarlo de nuevo. Corte documental original: '}{state.reportDossier?.asOf?.slice(0,10)}.</p>:null}
    {state.analysis.recovery?.length?<p>{en?'A formatting correction was applied before source review.':'Se aplicó una corrección de formato antes de revisar las fuentes.'}</p>:null}
    {state.analysis.review?<p>{en?'Automated review, not human certification.':'Revisión automática, no certificación humana.'}</p>:null}
    {state.analysis.reconstruction?.status==='recovered'?<p>{en?'Additional supported findings were recovered in a second drafting and review pass. Initial review notes below are retained for traceability.':'Una segunda redacción y revisión recuperó hallazgos respaldados. Las observaciones iniciales de abajo se conservan por trazabilidad.'}</p>:null}
    {['unavailable','budget_exhausted'].includes(state.analysis.reconstruction?.status)?<p>{en?'The additional analysis could not finish. Previously reviewed findings were retained.':'La ampliación del análisis no pudo terminar. Se conservan los hallazgos ya revisados.'}</p>:null}
    {state.analysis.review?.excluded?.filter(r=>r.id.startsWith(`${sectionId}:`)).map(r=><p key={r.id}>{en?'Initial review: ':'Revisión inicial: '}{r.reason}</p>)}
   </details>
   <button className={styles.quietButton} onClick={download}>{copy.download} ↓</button>
  </>}
  {state.error?<div role="alert"><p>{copy.errors[state.error]||copy.unavailable}</p>{state.retryAfterSeconds>0?<p>{language==='en'?`The service indicates a retry after ${state.retryAfterSeconds} seconds.`:`El servicio indica reintentar después de ${state.retryAfterSeconds} segundos.`}</p>:null}{state.error==='AUTH_REQUIRED'?<a href={`/login?intent=signin&lang=${language}&next=${encodeURIComponent(`/research?ticker=${dossier.ticker}&lang=${language}`)}`}>{language==='en'?'Sign in':'Iniciar sesión'} →</a>:null}{state.reference?<small>{language==='en'?'Error reference':'Referencia del fallo'}: {state.reference}</small>:null}</div>:null}
 </section>;
}

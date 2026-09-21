"use client";
import {trackProductEvent} from '@/lib/product-events.mjs';
import {useEffect,useRef,useState} from 'react';
import styles from './research.module.css';
import {requestAnalysis} from '@/lib/research/analysis-client.mjs';

const COPY={es:{
 title:'Informe del negocio',generate:'Generar informe',busy:'Analizando las fuentes…',
 intro:'Analiza el negocio, la caja, los riesgos y las preguntas que faltan por resolver. Al continuar, se envían únicamente extractos de documentos públicos a un servicio externo de análisis.',
 draft:'Borrador de IA · requiere revisión',caution:'Las citas coinciden con los extractos. Eso no verifica la interpretación ni los cálculos. Sin precio y expectativas contrastadas no hay diagnóstico de mispricing.',
 unavailable:'El proveedor no está disponible. La evidencia documental sigue accesible.',
 missing:'Qué no sabemos',checks:'Cómo contrastarlo',cite:'Ver cita de respaldo',download:'Descargar informe y fuentes',
 kinds:{reported_fact:'Declaración del filing',interpretation:'Interpretación',hypothesis:'Hipótesis por contrastar'},
 errors:{RATE_LIMITED:'Recibimos varias solicitudes seguidas. Espera un minuto antes de generar otro informe.',DAILY_LIMIT:'Se alcanzó la capacidad diaria de análisis. Tus documentos siguen disponibles.',AUTH_REQUIRED:'Tu sesión expiró. Inicia sesión para continuar.',REPORT_PENDING:'El informe sigue en preparación. Vuelve a consultarlo en unos segundos.',REPORT_STORAGE_UNAVAILABLE:'No pudimos recuperar o guardar el informe. Tus fuentes siguen disponibles.',PROVIDER_RATE_LIMIT:'Se alcanzó un límite de capacidad del servicio de análisis.',DOSSIER_EXPIRED:'El permiso de análisis expiró. Recarga el expediente antes de reintentar.',INVALID_ANALYSIS:'No logramos validar el informe después de intentar repararlo automáticamente. No mostramos afirmaciones sin respaldo. Puedes descargar el expediente y consultar las fuentes mientras resolvemos el fallo.',LIMIT_UNAVAILABLE:'No pudimos comprobar la disponibilidad del servicio. No se inició el análisis.'},
},en:{
 title:'Business report',generate:'Generate report',busy:'Analyzing sources…',
 intro:'Explore the business, cash generation, risks and unanswered questions. Continuing sends only excerpts from public documents to an external analysis service.',
 draft:'AI draft · review required',caution:'Quotes match the excerpts. This does not verify interpretations or calculations. Without price and independently checked expectations, mispricing remains unresolved.',
 unavailable:'The provider is unavailable. Documentary evidence remains accessible.',missing:'What remains unknown',checks:'How to test it',cite:'View supporting quote',download:'Download report and sources',
 kinds:{reported_fact:'Filing statement',interpretation:'Interpretation',hypothesis:'Hypothesis to test'},
 errors:{RATE_LIMITED:'Several requests arrived in quick succession. Wait one minute before generating another report.',DAILY_LIMIT:'Daily analysis capacity has been reached. Your documents remain available.',AUTH_REQUIRED:'Your session expired. Sign in to continue.',REPORT_PENDING:'The report is still being prepared. Check again shortly.',REPORT_STORAGE_UNAVAILABLE:'The report could not be retrieved or saved. Your sources remain available.',PROVIDER_RATE_LIMIT:'The analysis service reached a capacity limit.',DOSSIER_EXPIRED:'The analysis permit expired. Reload the dossier before retrying.',INVALID_ANALYSIS:'The report could not be validated after automatic repair was attempted. Unsupported claims are withheld. You can download the dossier and consult the sources while we investigate.',LIMIT_UNAVAILABLE:'Service availability could not be checked. No analysis was started.'},
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
   trackProductEvent('report_generated');
  }catch(e){setState({analysis:null,loading:false,error:e.message,reference:e.reference,retryAfterSeconds:e.retryAfterSeconds})}
  finally{clearTimeout(timer);controller.current=null}
 }
 function download(){
  const url=URL.createObjectURL(new Blob([JSON.stringify({dossier:state.reportDossier||dossier,analysis:state.analysis},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`${dossier.ticker}-filing-analysis.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const section=state.analysis?.sections.find(s=>s.id===sectionId);
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
   <strong>{state.analysis.sections.every(s=>s.findings.length===0)?(language==='en'?'Review completed · no admissible conclusions':'Revisión terminada · sin conclusiones admisibles'):copy.draft}</strong>
   {state.analysis.recovery?.length?<p>{language==='en'?'The format was repaired automatically before publication. All validation checks were reapplied.':'El formato se reparó automáticamente antes de publicar. Se volvieron a aplicar todos los controles.'}</p>:null}
   {state.cached?<p>{language==='en'?'Saved report · reused without generating it again. Original source cutoff: ':'Informe guardado · recuperado sin generarlo de nuevo. Corte documental original: '}{state.reportDossier?.asOf?.slice(0,10)}.</p>:null}
   <p>{copy.caution}</p>
   {state.analysis.review?<p>{language==='en'?'Second automated reading, not human verification.':'Segunda lectura automática, no verificación humana.'}</p>:null}
   <small>{state.analysis.language?.toUpperCase()} · {state.analysis.generatedAt?.slice(0,10)}</small>
   {section?.findings.map((finding,i)=><div className={styles.finding} key={i}>
    <span className={styles.kicker}>{copy.kinds[finding.kind]}</span><p>{finding.text}</p>
    {finding.evidence.map((e,j)=>{const source=(state.reportDossier||dossier).sources.find(s=>s.id===e.chunkId.split(':')[0]);return <details key={j}>
      <summary>{copy.cite}</summary><blockquote lang="en">{e.quote}</blockquote>
      <a href={source?.url} target="_blank" rel="noreferrer">{source?.form} · {e.chunkId} </a>
    </details>})}
   </div>)}
   {state.analysis.review?.excluded.filter(r=>r.id.startsWith(`${sectionId}:`)).map(r=><p key={r.id}>{language==='en'?'Reading withheld by automated critique: ':'Lectura retirada por la revisión automática: '}{r.reason}</p>)}
   {section?.findings.length===0?<p>{language==='en'?'No supported reading to publish for this section. Consult the original evidence.':'No hay una lectura respaldada para publicar en esta sección. Consulta la evidencia original.'}</p>:null}
   <h4>{copy.missing}</h4><ul>{section?.unknowns.map((s,i)=><li key={i}>{s}</li>)}</ul>
   <h4>{copy.checks}</h4><ul>{section?.checks.map((s,i)=><li key={i}>{s}</li>)}</ul>
   <button className={styles.quietButton} onClick={download}>{copy.download} </button>
  </>}
  {state.error?<div role="alert"><p>{copy.errors[state.error]||copy.unavailable}</p>{state.retryAfterSeconds>0?<p>{language==='en'?`The service indicates a retry after ${state.retryAfterSeconds} seconds.`:`El servicio indica reintentar después de ${state.retryAfterSeconds} segundos.`}</p>:null}{state.error==='AUTH_REQUIRED'?<a href={`/login?intent=signin&lang=${language}&next=${encodeURIComponent(`/research?ticker=${dossier.ticker}&lang=${language}`)}`}>{language==='en'?'Sign in':'Iniciar sesión'} </a>:null}{state.reference?<small>{language==='en'?'Error reference':'Referencia del fallo'}: {state.reference}</small>:null}</div>:null}
 </section>;
}

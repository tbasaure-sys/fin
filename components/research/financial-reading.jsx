"use client";
import {useEffect,useRef,useState} from 'react';
import styles from './financial-reading.module.css';
import {CashBridge,CASH_METRIC_LABELS} from './cash-bridge';
import {InterimReading} from './interim-reading';
import {EconomicBrief} from './economic-brief';

const COPY={
 es:{title:'Lectura financiera',subtitle:'Cifras de los informes anuales, sin generación de IA.',loading:'Recuperando cifras comparables…',units:'Millones de USD; acciones en millones. Pulsa una cifra para ver su origen.',missing:'Sin dato',more:'Capital y acciones',source:'Detalle de la cifra',close:'Cerrar detalle',file:'Abrir documento',known:'Publicado',none:'No hay cifras anuales comparables suficientes en estos documentos. El expediente sigue disponible.',error:'No pudimos recuperar las cifras. Puedes reintentar o seguir con los documentos.',retry:'Reintentar cifras',expired:'El expediente venció. Actualiza la página para obtener documentos y cifras del mismo corte.',auth:'Tu sesión expiró. Inicia sesión para recuperar las cifras.',login:'Iniciar sesión',scope:'Alcance y método',method:'Son cifras comparativas contenidas en los documentos de este expediente, no lo que se sabía en cada año. No incorporan los trimestres posteriores. La caja después de inversión resta sólo los pagos por activos físicos a la caja operativa: no es caja normalizada, no separa mantenimiento de crecimiento ni descuenta adquisiciones. No determina el valor de la empresa.',noSignals:'No se activaron estas alertas aritméticas con la evidencia disponible. No equivale a ausencia de riesgos.',signals:'Qué merece una revisión',thesis:'Contrastar con mi tesis',incompatible:'Sin una base documental comparable para calcular esta variación.',change:'Cambio entre los dos últimos años',
  metrics:{revenue:'Ingresos',ebit:'Resultado operativo',operatingMargin:'Margen operativo',netIncome:'Resultado neto',cfo:'Caja operativa',capex:'Inversión en activos físicos',cashAfterCapex:'Caja después de inversión',sbc:'Compensación en acciones',buybacks:'Recompras pagadas',dividends:'Dividendos pagados',distributions:'Recompras + dividendos',shares:'Acciones diluidas medias'},
  signalsText:{CASH_REINVESTMENT_DIVERGENCE:['La inversión creció más que la caja operativa.','La caja operativa aumentó, pero quedó menos después de inversión. Revisa cuánto de la inversión mantiene el negocio y cuánto busca crecimiento.'],DISTRIBUTIONS_EXCEED_RESIDUAL:['Recompras y dividendos superaron la caja después de inversión.','La diferencia no demuestra insolvencia ni identifica cómo se financió. Contrástala con la caja acumulada, la deuda y las demás entradas y salidas.'],DILUTED_SHARES_UP_WITH_BUYBACKS:['Hubo recompras, pero subieron las acciones diluidas medias.','Esta media no es el saldo al cierre. Revisa emisiones, remuneración en acciones y fechas de recompra antes de atribuir una causa.']}
 },
 en:{title:'Financial reading',subtitle:'Annual filing figures, without AI generation.',loading:'Retrieving comparable figures…',units:'USD millions; shares in millions. Select a figure to inspect its source.',missing:'No data',more:'Capital and shares',source:'Figure detail',close:'Close detail',file:'Open filing',known:'Published',none:'These documents do not contain enough comparable annual figures. The dossier remains available.',error:'We could not retrieve the figures. Retry or continue with the documents.',retry:'Retry figures',expired:'This dossier expired. Reload the page to retrieve documents and figures with the same cutoff.',auth:'Your session expired. Sign in to retrieve the figures.',login:'Sign in',scope:'Scope and method',method:'Comparative figures as presented in this dossier’s filings, not information available in each historical year. Subsequent quarters are not included. Cash after investment subtracts only cash PPE purchases from operating cash flow: it is not normalized cash flow, does not separate maintenance from growth, and excludes acquisitions. It does not determine enterprise value.',noSignals:'These arithmetic alerts were not triggered by the available evidence. This does not mean risks are absent.',signals:'What deserves review',thesis:'Compare with my thesis',incompatible:'No consistent filed basis is available to calculate this change.',change:'Change between the latest two years',
  metrics:{revenue:'Revenue',ebit:'Operating income',operatingMargin:'Operating margin',netIncome:'Net income',cfo:'Operating cash flow',capex:'Cash PPE investment',cashAfterCapex:'Cash after investment',sbc:'Share-based compensation',buybacks:'Cash buybacks',dividends:'Cash dividends',distributions:'Buybacks + dividends',shares:'Weighted diluted shares'},
  signalsText:{CASH_REINVESTMENT_DIVERGENCE:['Investment grew more than operating cash flow.','Operating cash flow rose, but less remained after investment. Review how much investment maintains the business and how much funds growth.'],DISTRIBUTIONS_EXCEED_RESIDUAL:['Buybacks and dividends exceeded cash after investment.','The gap does not prove insolvency or identify its funding. Reconcile it with accumulated cash, debt and other inflows and outflows.'],DILUTED_SHARES_UP_WITH_BUYBACKS:['Buybacks occurred, but weighted diluted shares rose.','This average is not the closing share count. Check issuance, share-based compensation and buyback timing before attributing a cause.']}
 }
};
const MAIN=['revenue','ebit','operatingMargin','cfo','capex','cashAfterCapex'];
const CAPITAL=['netIncome','sbc','buybacks','dividends','distributions','shares'];
const FORMULAS={cashAfterCapex:['cfo','−','capex'],operatingMargin:['ebit','÷','revenue'],distributions:['buybacks','+','dividends']};

export function FinancialReading({dossier,ticket,language='es',onThesis}){
 const base=COPY[language]||COPY.es,copy={...base,metrics:{...base.metrics,...(CASH_METRIC_LABELS[language]||CASH_METRIC_LABELS.es)}},locale=language==='en'?'en-US':'es-CL';
 const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0),[selected,setSelected]=useState(null);
 const detailRef=useRef(null);
 useEffect(()=>{if(selected)detailRef.current?.scrollIntoView({block:'nearest'})},[selected]);
 useEffect(()=>{
  let current=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
  setState({loading:true});setSelected(null);
  // Defer dispatch until mount is stable: development StrictMode replays effects.
  // Its setup/cleanup probe must not spend two source admissions for one visit.
  const start=setTimeout(()=>fetch('/api/research/financial-reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dossier,ticket}),signal:controller.signal})
   .then(async response=>{if(response.status===401)throw Error('AUTH_REQUIRED');const body=await response.json();if(!response.ok)throw Error(body.error||'FINANCIAL_SOURCE_UNAVAILABLE');
    if(body.packetHash!==dossier.packetHash||body.reading?.ticker!==dossier.ticker||body.reading?.asOf!==dossier.asOf
     ||body.reading?.version!=='financial-reading-v1'||!Array.isArray(body.reading.periods))throw Error('PACKET_MISMATCH');
    if(current)setState({reading:body.reading});
   }).catch(error=>{if(current)setState({error:error.message})}).finally(()=>clearTimeout(timer)),0);
  return()=>{current=false;clearTimeout(start);clearTimeout(timer);controller.abort()};
 },[dossier,ticket,attempt]);
 const reading=state.reading;
 const format=(value,unit='USD')=>value===null||!Number.isFinite(value)?copy.missing:new Intl.NumberFormat(locale,unit==='ratio'?{style:'percent',maximumFractionDigits:1}:{maximumFractionDigits:2}).format(unit==='ratio'?value:value/1e6);
 const chosen=reading?.periods.find(p=>p.end===selected?.end),cell=chosen?.values[selected?.metric];
 const comparison=selected?reading?.comparisons[selected.metric]:null;
 function table(metrics){return <div className={styles.tableScroll} role="region" aria-label={`${copy.title} · ${metrics===MAIN?copy.title:copy.more}`} tabIndex={0}>
  <table><caption className={styles.srOnly}>{copy.title} · {copy.units}</caption><thead><tr><th scope="col">{language==='en'?'Fiscal year ending':'Ejercicio terminado'}</th>{reading.periods.map(p=><th key={p.end} scope="col"><time dateTime={p.end}>{p.end.slice(0,4)}</time><small>{p.end.slice(5)}</small></th>)}</tr></thead>
   <tbody>{metrics.map(metric=><tr key={metric} className={metric==='cashAfterCapex'?styles.residual:undefined}><th scope="row">{copy.metrics[metric]}</th>{reading.periods.map(p=>{const value=p.values[metric];return <td key={p.end}>{value?.value!==null&&Number.isFinite(value?.value)?<button aria-label={`${copy.metrics[metric]} · ${p.end}`} aria-pressed={selected?.end===p.end&&selected?.metric===metric} onClick={()=>setSelected({end:p.end,metric})}>{format(value.value,value.unit)}</button>:<span className={styles.missing}>{copy.missing}</span>}</td>})}</tr>)}</tbody>
  </table></div>}
 return <section className={styles.reading} data-financial-reading aria-labelledby="financial-reading-title" aria-busy={state.loading||false}>
  <EconomicBrief dossier={dossier} reading={reading} language={language} onThesis={onThesis}/>
  {state.loading?<p role="status">{copy.loading}</p>:null}
  {state.error?<div role="alert"><p>{state.error==='AUTH_REQUIRED'?copy.auth:state.error==='DOSSIER_EXPIRED'?copy.expired:copy.error}</p>
   {state.error==='AUTH_REQUIRED'?<a href={`/login?intent=signin&lang=${language}&next=${encodeURIComponent(`/research?ticker=${dossier.ticker}&lang=${language}`)}`}>{copy.login} →</a>:state.error==='DOSSIER_EXPIRED'?<button onClick={()=>window.location.reload()}>{language==='en'?'Reload dossier':'Actualizar expediente'}</button>:<button onClick={()=>setAttempt(n=>n+1)}>{copy.retry}</button>}</div>:null}
  {reading?.status==='unresolved'?<p>{copy.none}</p>:null}
  <details data-financial-detail><summary>{language==='en'?'Financial figures and source detail':'Cifras financieras y detalle de fuentes'}</summary>
  <header><div><h2 id="financial-reading-title">{copy.title}</h2><p>{reading?.interim?.status==='available'?(language==='en'?'Latest cumulative results and annual context, linked to the filings.':'Últimos resultados acumulados y contexto anual, con fuentes consultables.'):copy.subtitle}</p></div>{reading?.periods.length>0?<span className={styles.years}>{reading.periods[0].end.slice(0,4)} — {(reading.interim?.end||reading.periods.at(-1).end).slice(0,4)}</span>:null}</header>
  {reading?.status==='available'?<>
   <InterimReading interim={reading.interim} language={language} format={format}/>
   {reading.interim?.status==='available'?<h3>{language==='en'?'Annual context':'Contexto anual'}</h3>:null}
   <p className={styles.units}>{copy.units}</p>{table(MAIN)}
   <details className={styles.capital}><summary>{copy.more}</summary>{table(CAPITAL)}</details>
   <CashBridge bridge={reading.cashBridge} language={language} format={format} onSelect={setSelected}/>
   {cell?<section ref={detailRef} className={styles.detail} role="region" aria-label={copy.source}>
    <div className={styles.detailHead}><h3>{copy.metrics[selected.metric]} · {selected.end}</h3><button onClick={()=>setSelected(null)}>{copy.close}</button></div>
    {FORMULAS[selected.metric]?<p className={styles.formula}>{FORMULAS[selected.metric].map((key,i)=>i===1?key:format(chosen.values[key].value)).join(' ')} = {format(cell.value,cell.unit)}</p>:<p className={styles.formula}>{format(cell.value,cell.unit)}</p>}
    <p>{FORMULAS[selected.metric]?FORMULAS[selected.metric].map((key,i)=>i===1?key:copy.metrics[key]).join(' '):copy.metrics[selected.metric]} · {cell.unit==='ratio'?'%':cell.unit==='shares'?(language==='en'?'million shares':'millones de acciones'):'USD M'}</p>
    {selected.end===reading.periods.at(-1).end?<p>{comparison?.status==='comparable'?`${copy.change}: ${cell.unit==='ratio'?new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(comparison.change*100)+' pp':format(comparison.change,cell.unit)}${comparison.percentChange!==null?' ('+format(comparison.percentChange,'ratio')+')':''}`:copy.incompatible}</p>:null}
    <ul>{cell.evidenceKeys.map(key=>{const fact=reading.evidence[key];return <li key={key}><strong>{copy.metrics[key.split(':')[1]]}</strong>: {format(fact.value,fact.unit)}<br/>{fact.start} → {fact.end} · {copy.known}: {fact.availableAt.slice(0,10)}<br/><a href={fact.url} target="_blank" rel="noreferrer">{copy.file} ↗</a><details><summary>{language==='en'?'Technical source':'Identificador de la fuente'}</summary><code>{fact.concepts.join(', ')}<br/>{fact.accession}<br/>SHA-256 {fact.sourceHash}</code></details></li>})}</ul>
   </section>:null}
   <section className={styles.signals}><h3>{reading.interim?.status==='available'?`${language==='en'?'Review of fiscal year ending':'Revisión del cierre anual'} ${reading.periods.at(-1).end}`:copy.signals}</h3>{reading.signals.length?<ul>{reading.signals.map(signal=>{
    const text=copy.signalsText[signal.id];return text?<li key={signal.id}><strong>{text[0]}</strong><p>{text[1]}</p><div>{signal.evidence.map(ref=><button key={`${ref.end}:${ref.metric}`} onClick={()=>setSelected(ref)}>{copy.metrics[ref.metric]} {ref.end.slice(0,4)} ↗</button>)}</div></li>:null;
   })}</ul>:<p>{copy.noSignals}</p>}{onThesis?<button className={styles.thesis} onClick={onThesis}>{copy.thesis} →</button>:null}</section>
   <details className={styles.method}><summary>{reading.interim?.status==='available'?(language==='en'?'Annual context methodology':'Método del contexto anual'):copy.scope}</summary><p>{copy.method}</p></details>
  </>:null}
  </details>
 </section>;
}

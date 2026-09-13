"use client";
import {useEffect,useRef,useState} from 'react';
import styles from './interim-reading.module.css';
import {CashBridge,CASH_METRIC_LABELS} from './cash-bridge';

const METRICS=['revenue','ebit','cfo','capex','cashAfterCapex'];
const ALLOCATION=[['cfo',''],['capex','−'],['buybacks','−'],['dividends','−'],['cashAfterDistributions','='],['otherCashMovements','+'],['cashChange','=']];
const ACTIVITY={es:{title:'Desglosar otros movimientos',scope:'Se excluyen la inversión física, las recompras y los dividendos ya restados arriba. La diferencia pendiente no se atribuye automáticamente a divisas ni a otra causa.',labels:{cfi:'Flujo neto de inversión',cff:'Flujo neto de financiación',otherInvesting:'Inversión restante',otherFinancing:'Financiación restante',unclassifiedCashChange:'Diferencia pendiente de clasificar'}},
 en:{title:'Break down other movements',scope:'Excludes PPE investment, buybacks and dividends already deducted above. Any remaining difference is not automatically attributed to currency effects or another cause.',labels:{cfi:'Net investing cash flow',cff:'Net financing cash flow',otherInvesting:'Remaining investing flows',otherFinancing:'Remaining financing flows',unclassifiedCashChange:'Unclassified reconciliation difference'}}};
const CAPITAL={es:{title:'Caja y retornos al accionista',scope:'Acumulado actual · millones de USD',method:'Esta cuenta no identifica cómo se financió cada pago. El saldo no es caja normalizada ni efectivo disponible: faltan otras entradas y salidas. Otros movimientos es una diferencia calculada, no una explicación económica. El cambio final incluye efectivo restringido.',missing:'Faltan partidas compatibles para calcular el saldo; no se sustituyen por cero.',
 labels:{buybacks:'Recompras de acciones comunes',dividends:'Dividendos pagados',cashAfterDistributions:'Saldo tras estas partidas',otherCashMovements:'Otros movimientos de efectivo',cashChange:'Cambio de efectivo reportado'}},
 en:{title:'Cash and shareholder returns',scope:'Current fiscal year to date · USD millions',method:'This calculation does not identify how each payment was funded. The residual is neither normalized cash flow nor available cash: other inflows and outflows remain. Other movements is a calculated difference, not an economic explanation. The final cash change includes restricted cash.',missing:'Compatible inputs are missing; they are not replaced with zero.',
 labels:{buybacks:'Common-stock repurchases',dividends:'Cash dividends',cashAfterDistributions:'Residual after these items',otherCashMovements:'Other cash movements',cashChange:'Reported cash change'}}};
const TEXT={es:{title:'Desde el último cierre anual',units:'Acumulado del ejercicio, no trimestre aislado. Millones de USD.',prior:'Anterior',current:'Actual',change:'Cambio',trailing:'Doce meses',trailingTitle:'Doce meses reconstruidos',missing:'Sin dato',detail:'Cálculo y fuentes',close:'Cerrar detalle',open:'Abrir documento',published:'Publicado',annual:'Contexto anual',unresolved:'Hay un informe posterior al cierre anual, pero no pudimos reconstruir cifras acumuladas compatibles. No sustituimos ese informe por otro más antiguo.',method:'Año cerrado + acumulado actual − acumulado anterior. La reconstrucción combina dos informes; revisa posibles reclasificaciones antes de usarla para valorar. No es una proyección ni caja normalizada.',
 labels:{revenue:'Ingresos',ebit:'Resultado operativo',cfo:'Caja operativa',capex:'Inversión en activos físicos',cashAfterCapex:'Caja después de inversión'}},
 en:{title:'Since the last fiscal year-end',units:'Fiscal year to date, not the isolated quarter. USD millions.',prior:'Prior',current:'Current',change:'Change',trailing:'Trailing year',trailingTitle:'Reconstructed trailing year',missing:'No data',detail:'Calculation and sources',close:'Close detail',open:'Open filing',published:'Published',annual:'Annual context',unresolved:'A newer interim report exists, but compatible cumulative figures could not be reconstructed. We do not silently substitute an older report.',method:'Annual + current year to date − prior year to date. This reconstruction combines two filings; check potential reclassifications before using it in a valuation. It is not a forecast or normalized cash flow.',
 labels:{revenue:'Revenue',ebit:'Operating income',cfo:'Operating cash flow',capex:'Cash PPE investment',cashAfterCapex:'Cash after investment'}}};

export function InterimReading({interim,language='es',format}){
 const base=TEXT[language]||TEXT.es,capital=CAPITAL[language]||CAPITAL.es;
 const activity=ACTIVITY[language]||ACTIVITY.es;
 const copy={...base,labels:{...base.labels,...capital.labels,...activity.labels,...(CASH_METRIC_LABELS[language]||CASH_METRIC_LABELS.es)}};
 const [selection,setSelection]=useState(null),detailRef=useRef(null);
 useEffect(()=>{if(selection){detailRef.current?.focus({preventScroll:true});detailRef.current?.scrollIntoView({block:'nearest'});}},[selection]);
 if(!interim||interim.status==='no_new_interim')return null;
 if(interim.status!=='available')return <section className={styles.interim} data-interim-reading><h3>{copy.title}</h3><p>{copy.unresolved}</p></section>;
 const selected=selection&&interim.metrics[selection.metric]?.[selection.period];
 const sign=value=>`${value>0?'+':value<0?'−':''}${format(Math.abs(value))}`;
 function cell(metric,period,signed=false){
  const value=interim.metrics[metric]?.[period];
  if(value?.value===null||!Number.isFinite(value?.value))return <span className={styles.missing}>{copy.missing}</span>;
  return <button aria-label={`${copy.labels[metric]} · ${copy[period]}`} onClick={()=>setSelection({metric,period})}>
   {period==='change'||signed?sign(value.value):format(value.value)}
   {period==='change'&&Number.isFinite(value.percentChange)?<small>{format(value.percentChange,'ratio')}</small>:null}
  </button>;
 }
 return <section className={styles.interim} data-interim-reading>
  <div className={styles.heading}><h3>{copy.title}</h3><span>{interim.start} → {interim.end}</span></div>
  <p>{copy.units} {language==='en'?'Compared with the same elapsed fiscal period a year earlier.':'Comparado con el mismo tramo del ejercicio anterior.'}</p>
  <table><caption className={styles.srOnly}>{copy.title} · {interim.start} → {interim.end}</caption>
   <thead><tr><th scope="col">{language==='en'?'Metric':'Concepto'}</th><th scope="col">{copy.prior}</th><th scope="col">{copy.current}</th><th scope="col">{copy.change}</th></tr></thead>
   <tbody>{METRICS.map(metric=><tr key={metric} data-interim-metric={metric} className={metric==='cashAfterCapex'?styles.residual:undefined}>
    <th scope="row">{copy.labels[metric]}</th>{['prior','current','change'].map(period=><td key={period}>{cell(metric,period)}</td>)}
   </tr>)}</tbody>
  </table>
  <CashBridge bridge={interim.cashBridge} language={language} format={format} onSelect={ref=>setSelection({metric:ref.metric,period:ref.period})}/>
  {interim.metrics.buybacks?<section className={styles.allocation} data-cash-allocation>
   <h4>{capital.title}</h4><p>{capital.scope}</p>
   <dl>{ALLOCATION.map(([metric,operator])=><div key={metric} data-allocation-metric={metric} className={operator==='='?styles.subtotal:undefined}>
    <dt><span aria-hidden="true">{operator}</span>{copy.labels[metric]}</dt><dd>{cell(metric,'current',metric==='otherCashMovements')}</dd>
   </div>)}</dl>
   {interim.metrics.otherInvesting?<details className={styles.trailing} data-activity-breakdown>
    <summary>{activity.title}</summary><p>{activity.scope}</p>
    <dl>{['otherInvesting','otherFinancing','unclassifiedCashChange'].map(metric=><div key={metric} data-activity-metric={metric}>
     <dt>{copy.labels[metric]}</dt><dd>{cell(metric,'current',true)}</dd>
    </div>)}</dl>
   </details>:null}
   {interim.metrics.cashAfterDistributions?.current.value===null?<p>{capital.missing}</p>:null}
   <p>{capital.method}</p>
  </section>:null}
  <details className={styles.trailing}><summary>{copy.trailingTitle}</summary>
   <p>{copy.method}</p>
   <dl>{METRICS.map(metric=><div key={metric}><dt>{copy.labels[metric]}</dt><dd>{cell(metric,'trailing')}</dd></div>)}</dl>
  </details>
  {selected?<section ref={detailRef} tabIndex={-1} className={styles.detail} role="region" aria-label={copy.detail}>
   <div className={styles.heading}><h4>{copy.labels[selection.metric]} · {copy[selection.period]}</h4><button onClick={()=>setSelection(null)}>{copy.close}</button></div>
   <p>{selected.start} → {selected.end} · USD M</p>
   <p className={styles.formula}>{selected.terms.map((t,i)=>`${i?(t.coefficient<0?' − ':' + '):t.coefficient<0?'−':''}${t.fact.value<0?'('+format(t.fact.value)+')':format(t.fact.value)}`).join('')}{selected.terms.length>1?` = ${format(selected.value)}`:''}</p>
   <ol>{selected.terms.map((term,i)=><li key={`${term.fact.accession}:${term.fact.start}:${term.fact.metric}:${i}`}>
    <strong>{term.coefficient<0?'−':'+'} {copy.labels[term.fact.metric]}: {format(term.fact.value)}</strong><br/>
    {term.fact.start} → {term.fact.end}<br/>{copy.published}: {term.fact.availableAt.slice(0,10)}<br/>
    <a href={term.fact.url} target="_blank" rel="noreferrer">{copy.open} ↗</a>
   </li>)}</ol>
  </section>:null}
 </section>;
}

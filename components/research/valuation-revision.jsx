"use client";
import styles from './capital.module.css';
const labels={
 es:{growth:'Crecimiento',margin:'Margen final',taxRate:'Impuestos',discountRate:'Tasa de descuento',terminalGrowth:'Crecimiento terminal',salesToCapital:'Ventas / capital',maintenanceRate:'Mantenimiento neto',cashUsableRate:'Caja utilizable',otherClaims:'Otras obligaciones',revenue:'Ingresos',ebit:'Resultado operativo',cash:'Caja',debt:'Deuda',shares:'Acciones'},
 en:{growth:'Growth',margin:'Final margin',taxRate:'Tax rate',discountRate:'Discount rate',terminalGrowth:'Terminal growth',salesToCapital:'Sales / capital',maintenanceRate:'Net maintenance',cashUsableRate:'Usable cash',otherClaims:'Other claims',revenue:'Revenue',ebit:'Operating income',cash:'Cash',debt:'Debt',shares:'Shares'},
};
export function ValuationRevision({record,language='es'}){
 const b=record?.revisionBridge;if(!b)return null;
 const en=language==='en',locale=en?'en-US':'es-CL',names=labels[en?'en':'es'];
 const number=(n,scale=1)=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n/scale):'—';
 const signed=(n,scale=1)=>n===null||n===undefined?'—':`${n>0?'+':n<0?'−':''}${number(Math.abs(n),scale)}`;
 const title=en?'What changed since the previous calculation':'Qué cambió desde el cálculo anterior';
 if(b.status!=='available')return <section className={styles.results} data-valuation-revision><h4>{title}</h4><p>{b.status==='no_prior'?(en?'No earlier calculation was found in this revision or the inspected ancestry.':'No se encontró un cálculo anterior en esta revisión o en los antecedentes consultados.'):(en?'These saved calculations cannot be reconciled under the same model and input checks. They remain unchanged in your history.':'Estos cálculos guardados no se pueden reconciliar con el mismo modelo y sus controles de datos. Se conservan sin modificar en el historial.')}</p></section>;
 const before=record.revisionBaseline;
 const assumptionValue=(key,value)=>value===null?'—':key==='otherClaims'?`US$ ${number(value)}`:key==='salesToCapital'?`${number(value)}x`:`${number(value*100)}%`;
 return <section className={styles.results} data-valuation-revision aria-label={title}>
  <h4>{title}</h4><p className={styles.meta}>{b.before.savedAt} → {record.savedAt}</p>
  <div className={`${styles.table} ${styles.reinvestmentTable}`}><table><caption className={styles.meta}>{en?'Two saved calculations; not a forecast or return':'Dos cálculos guardados; no es pronóstico ni retorno'}</caption>
   <thead><tr><th>{en?'Reconciliation':'Reconciliación'}</th><th>{en?'Business · USD M':'Negocio · USD M'}</th><th>{en?'Per share · USD':'Por acción · USD'}</th></tr></thead>
   <tbody>{[['before',en?'Previous value':'Valor anterior'],['inputs',en?'Financial inputs':'Cifras documentales'],['assumptions',en?'Your assumptions':'Tus supuestos'],['after',en?'Current value':'Valor actual']].map(([key,label])=><tr key={key}><th scope="row">{label}</th><td>{['inputs','assumptions'].includes(key)?signed(b.operating[key],1e6):number(b.operating[key],1e6)}</td><td>{b.perShare?(['inputs','assumptions'].includes(key)?signed(b.perShare[key]):number(b.perShare[key])):'—'}</td></tr>)}</tbody>
  </table></div>
  {b.priceGap?<p>{en?'Change in the value–price gap, per share: ':'Cambio en la brecha valor–precio, por acción: '}{signed(b.priceGap.valueChange)} − ({signed(b.priceGap.priceChange)}) = <strong>{signed(b.priceGap.change)} USD</strong>. {en?'The captured price changes the gap, not the business value.':'La cotización capturada cambia la brecha, no el valor del negocio.'}</p>:<p>{en?'The per-share price comparison remains unresolved; the operating reconciliation is separate.':'La comparación con el precio por acción sigue pendiente; la reconciliación operativa es independiente.'}</p>}
  {b.position?<p>{en?'For the same ':'Para las mismas '}{number(b.position.quantity)} {en?'recorded shares: ':'acciones registradas: '}<strong>{signed(b.position.gapChangeUsd)} USD</strong> {en?'change in the model gap. Not realized P&L or total portfolio performance.':'de cambio en la brecha del modelo. No es ganancia realizada ni rendimiento de la cartera.'}</p>:null}
  <details className={styles.details}><summary>{en?'Inspect the changed assumptions and sources':'Revisar los supuestos y fuentes que cambiaron'}</summary>
   {b.changedAssumptions.length?<ul>{b.changedAssumptions.map(k=><li key={k}>{names[k]}: {assumptionValue(k,before?.assumptions[k])} → {assumptionValue(k,record.assumptions[k])}</li>)}</ul>:<p>{en?'No numerical economic assumptions changed.':'No cambiaron los supuestos económicos numéricos.'}</p>}
   {b.changedFacts.map(k=><p key={k}>{names[k]}: {[before?.financial.facts[k],record.financial.facts[k]].map((f,i)=>f?<span key={i}><a href={f.url} target="_blank" rel="noreferrer">{i?(en?'Current source':'Fuente actual'):(en?'Previous source':'Fuente anterior')} ↗</a>{' '}{f.end}{i?'':' → '}</span>:<span key={i}>—</span>)}</p>)}
   {!b.changedFacts.length?<p>{en?'The financial facts and their provenance did not change.':'Las cifras y su procedencia no cambiaron.'}</p>:null}
   <p>{en?'The decomposition averages changing the inputs first and changing the assumptions first, sharing their interaction equally. It explains the calculation retrospectively, not economic causality or what was known earlier. A changed source is not automatically new economic information.':'El desglose promedia cambiar primero los datos y cambiar primero los supuestos, repartiendo la interacción por igual. Explica el cálculo retrospectivamente, no causalidad económica ni lo que se sabía antes. Un cambio de fuente no implica automáticamente información económica nueva.'}</p>
   {b.warnings.includes('SHARE_BASIS_CHANGED')?<p>{en?'The share basis changed. Per-share comparisons require corporate-action reconciliation.':'Cambió la base de acciones. Comparar valores por acción requiere conciliar los eventos corporativos.'}</p>:null}
   <small className={styles.hash}>{en?'Previous record':'Registro anterior'}: {b.before.hash}</small>
  </details>
 </section>;
}

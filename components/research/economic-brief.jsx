"use client";
import {useState} from 'react';
import {economicBrief,growthSensitivity} from '@/lib/research/economic-brief.mjs';
import styles from './economic-brief.module.css';

export function EconomicBrief({dossier,reading,language='es',onThesis}){
 const en=language==='en',locale=en?'en-US':'es-CL',b=economicBrief({dossier,reading}),g=b.growth,c=b.cash,k=b.capital;
 const [retained,setRetained]=useState(0),probe=growthSensitivity(g,retained/100);
 if(b.status!=='available')return null;
 const pct=n=>new Intl.NumberFormat(locale,{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(n);
 const money=n=>new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(n/1e6);
 const signed=(n,format=money)=>`${n<0?'−':n>0?'+':''}${format(Math.abs(n))}`;
 const sourceLink=(source,label,fact)=> <a href={`${source.url}${fact?.factId?'#'+encodeURIComponent(fact.factId):''}`} target="_blank" rel="noreferrer">{label} ↗</a>;
 function handoff(nodeId,question,test){onThesis?.({nodeId,question,test,dossier})}
 const promptButton=(nodeId,question,test)=>onThesis?<button type="button" onClick={()=>handoff(nodeId,question,test)}>{en?'Test in my thesis':'Contrastar en mi tesis'} <span aria-hidden="true">→</span></button>:null;
 return <section className={styles.brief} data-economic-brief aria-label={en?'Economic brief':'Lectura económica'}>
  <header><h2>{en?'Economic brief':'Lectura económica'}</h2><p>{en?'What changed, what the arithmetic depends on, and what needs to be tested.':'Qué cambió, de qué depende la lectura y qué falta contrastar.'}</p></header>
  {g.status==='available'?<article>
   <span className={styles.index}>01 / {en?'BUSINESS':'NEGOCIO'}</span>
   <div><h3>{g.primary.label}: {en?'largest contribution to the change':'principal contribución a la variación'}</h3>
    <p className={styles.period}>{g.start} → {g.end} · {en?'vs.':'frente a'} {g.priorStart} → {g.priorEnd}</p>
    <p>{en?'Revenue changed by ':'Los ingresos variaron '}{signed(g.growth,pct)}. {g.primary.label} {en?'contributed ':'aportó '}{signed(g.primary.change)} {en?'USD million to that change':'millones de USD a esa variación'}{g.primary.shareOfNetChange!==null?` (${pct(g.primary.shareOfNetChange)} ${en?'of the net change':'del cambio neto'})`:''}.</p>
    {g.primary.shareOfNetChange>1?<p>{en?'The contribution exceeds the net change because other lines offset it.':'El aporte supera el cambio neto porque otras partidas lo compensan.'}</p>:null}
    <p>{en?'This identifies the reported contribution, not price, volume, retention or competitive advantage. Those explanations need separate evidence.':'Esto identifica el aporte reportado, no precio, volumen, retención ni ventaja competitiva. Esas explicaciones requieren evidencia aparte.'}</p>
    <details className={styles.probe}><summary>{en?'Test this growth':'Poner a prueba este crecimiento'}</summary>
     <p>{en?'Keep the other reported revenue lines unchanged and retain only this fraction of the change in ':'Mantén las demás partidas de ingresos sin cambios y conserva sólo esta fracción de la variación de '}{g.primary.label}.</p>
     <label>{en?'Fraction of the observed change retained':'Fracción de la variación observada que se conserva'}: {retained}%<input type="range" min="0" max="100" step="10" value={retained} onChange={e=>setRetained(Number(e.target.value))}/></label>
     <p className={styles.result} role="status">{signed(probe.growth,pct)} <small>{en?'consolidated growth in this scenario':'crecimiento consolidado en este escenario'}</small></p>
     <p>{en?'At 0%, this line returns to its prior comparable level. At 100%, the observed result is unchanged. This is the same historical period, not an estimate for next year or the share price.':'Al 0%, esta partida vuelve al nivel comparable anterior. Al 100%, se conserva el resultado observado. Es el mismo período histórico, no una estimación del próximo año ni del precio de la acción.'}</p>
     <details><summary>{en?'Calculation and sources':'Cálculo y fuentes'}</summary><p>({money(g.current)} − {money(g.primary.change)} × {1-retained/100} − {money(g.prior)}) / {money(g.prior)} = {pct(probe.growth)}</p>
      {sourceLink(g.source,en?'Current total':'Total actual',g.totals.current)} · {sourceLink(g.source,en?'Prior total':'Total anterior',g.totals.prior)}<br/>
      {sourceLink(g.source,`${g.primary.label} · ${en?'current':'actual'}`,g.primary.current)} · {sourceLink(g.source,`${g.primary.label} · ${en?'prior':'anterior'}`,g.primary.prior)}
     </details>
    </details>
    {promptButton('business',en?`What supports the persistence of the change in ${g.primary.label}, rather than a temporary cycle or mix effect?`:`¿Qué respalda la persistencia de la variación de ${g.primary.label}, frente a un efecto transitorio de ciclo o mezcla?`,en?`Compare ${g.primary.label} and the remaining revenue lines against ${g.start} to ${g.end}; distinguish price, volume and mix only where separately disclosed. Revisit the growth assumption if the contributor reverses. Source: ${g.source.url}`:`Comparar ${g.primary.label} y las demás partidas con ${g.start} a ${g.end}; distinguir precio, volumen y mezcla sólo cuando estén desglosados. Revisar el supuesto de crecimiento si se revierte el aporte. Fuente: ${g.source.url}`)}
   </div>
  </article>:<p>{en?'A reconciled business-level growth breakdown remains unavailable.':'Falta un desglose conciliado para explicar la contribución de cada negocio.'}</p>}
  {c.status==='available'?<article>
   <span className={styles.index}>02 / {en?'CASH':'CAJA'}</span>
   <div><h3>{en?'Separate cash generation from investment':'Separar generación de caja e inversión'}</h3>
    <p className={styles.period}>{c.start} → {c.end} · {c.basis==='cumulative'?(en?'Cumulative, not annualized':'Acumulado, sin anualizar'):(en?'Fiscal year':'Ejercicio anual')}</p>
    <p>{en?'Operating cash less cash PPE spending changed from ':'La caja operativa menos pagos por activos físicos pasó de '}{money(c.prior)} {en?'to':'a'} {money(c.current)} {en?'USD million':'millones de USD'}.</p>
    <dl className={styles.bridge}><div><dt>{en?'Operating cash contribution':'Aporte de caja operativa'}</dt><dd>{signed(c.operatingEffect)}</dd></div><div><dt>{en?'Investment contribution':'Efecto de la inversión'}</dt><dd>{signed(c.investmentEffect)}</dd></div><div><dt>{en?'Net change · USD M':'Variación neta · USD M'}</dt><dd>{signed(c.change)}</dd></div></dl>
    <p>{en?'Lower investment lifts this residual without proving that the business can generate more cash sustainably. Operating cash can also reflect timing of collections and payments.':'Una menor inversión eleva este saldo sin demostrar mayor generación sostenible. La caja operativa también puede reflejar el momento de cobros y pagos.'}</p>
    {!b.growthCashComparable?<p>{en?'Revenue and cash have not been matched to one reporting basis; no joint conclusion is inferred.':'Ingresos y caja no están conciliados sobre una misma base documental; no se infiere una conclusión conjunta.'}</p>:null}
    <details><summary>{en?'Cash calculation and sources':'Cálculo de caja y fuentes'}</summary>
     <p>({money(c.evidence.cfo.current.value)} − {money(c.evidence.capex.current.value)}) − ({money(c.evidence.cfo.prior.value)} − {money(c.evidence.capex.prior.value)}) = {signed(c.change)} USD M</p>
     {sourceLink(c.evidence.cfo.current,en?'Cash-flow statement':'Estado de flujos de efectivo')}
     <p>{en?'Cash after physical investment is not normalized unlevered free cash flow. Acquisition spending and the maintenance/growth split require separate treatment.':'La caja después de inversión física no es caja libre normalizada antes de financiación. Las adquisiciones y la separación entre mantenimiento y crecimiento requieren tratamiento aparte.'}</p>
    </details>
    {promptButton('cash',en?'Which part of the operating cash change can recur, and what investment is required to sustain the business?':'¿Qué parte de la variación de caja operativa puede repetirse y qué inversión exige sostener el negocio?',en?`Reconcile cash-flow changes, working capital, tax timing and maintenance versus expansion for ${c.start} to ${c.end}. Do not carry the residual directly into valuation. Source: ${c.evidence.cfo.current.url}`:`Conciliar cambios de caja, capital de trabajo, calendario de impuestos y mantenimiento frente a expansión en ${c.start} a ${c.end}. No trasladar el saldo directamente a la valoración. Fuente: ${c.evidence.cfo.current.url}`)}
   </div>
  </article>:<p>{en?'Comparable cash and physical investment are still missing.':'Faltan caja e inversión física comparables para reconstruir su variación.'}</p>}
  {k.status==='available'?<article>
   <span className={styles.index}>03 / CAPITAL</span>
   <div><h3>{en?'Trace the residual into the change in cash':'Del saldo intermedio a la variación de efectivo'}</h3>
    <p>{en?'After physical investment, buybacks and dividends, the selected residual is ':'Tras inversión física, recompras y dividendos, el saldo de esas partidas es '}{money(k.selectedResidual)} {en?'USD million':'millones de USD'}.</p>
    <dl className={styles.bridge}>{[
     [en?'Selected residual':'Saldo de partidas seleccionadas',k.selectedResidual],
     [en?'Other investing movements':'Resto de movimientos de inversión',k.otherInvesting],
     [en?'Other financing movements':'Resto de movimientos de financiación',k.otherFinancing],
     [en?'Unclassified difference':'Diferencia sin clasificar',k.unclassified],
     [en?'Reported change in cash · USD M':'Cambio de efectivo reportado · USD M',k.cashChange],
    ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value===null?'—':signed(value)}</dd></div>)}</dl>
    <p>{en?'The intermediate residual is not available cash. This bridge does not identify which inflow funded a particular buyback or payment.':'El saldo intermedio no es efectivo disponible. Este puente no identifica qué entrada financió una recompra o un pago concreto.'}</p>
    <details><summary>{en?'Allocation calculation and sources':'Cálculo de asignación y fuentes'}</summary>
     <p>{money(c.currentOperating)} − {money(c.currentInvestment)} − {money(k.buybacks)} − {money(k.dividends)} = {money(k.selectedResidual)} USD M</p>
     <p>{en?'Other investing = net investing cash flow + PPE payments. Other financing = net financing cash flow + buybacks + dividends. This removes already counted payments.':'Resto de inversión = flujo neto de inversión + pagos por activos físicos. Resto de financiación = flujo neto de financiación + recompras + dividendos. Así se retiran los pagos ya contados.'}</p>
     {sourceLink(k.evidence.cfo,en?'Original cash-flow statement':'Estado de flujos original')}
    </details>
   </div>
  </article>:null}
 </section>;
}

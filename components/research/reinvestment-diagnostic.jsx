"use client";
import {useMemo} from 'react';
import {reinvestmentDiagnostic} from '@/lib/research/reinvestment-diagnostic.mjs';
import styles from './capital.module.css';

export function ReinvestmentDiagnostic({financial,assumptions,quote,at,language,onApply,disabled}){
 const diagnostic=useMemo(()=>reinvestmentDiagnostic(financial,assumptions,quote,at),[financial,assumptions,quote,at]);
 const en=language==='en',locale=en?'en-US':'es-CL',title=en?'The investment behind the value':'La inversión detrás del valor';
 const fmt=n=>n===null?'—':new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(n/1e6);
 const percent=n=>new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1}).format(n);
 const money=n=>n===null?'—':`US$ ${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n)}`;
 const o=diagnostic.observed;
 return <section className={styles.results} aria-label={title}>
  <h4>{title}</h4>
  <p>{en?'If sales stopped growing, how much investment would still have to continue?':'Si las ventas dejaran de crecer, ¿cuánta inversión tendría que continuar?'}</p>
  {!o?<p>{en?'Comparable cash PPE spending and physical depreciation are not available in these saved inputs. Refresh the figures or consult the asset note; total amortization is not a substitute.':'Faltan pagos por activos físicos y depreciación física comparables en estas cifras guardadas. Actualiza las cifras o consulta la nota de activos; la amortización total no los sustituye.'}</p>:<>
   <p className={styles.meta}>{o.start} → {o.end} · {en?'USD millions':'Millones de USD'}</p>
   <dl><div><dt>{en?'Cash PPE spending':'Pagos por activos físicos'}</dt><dd>{fmt(o.capex.value)}</dd></div>
    <div><dt>{en?'Physical depreciation':'Depreciación física'}</dt><dd>{fmt(o.depreciation.value)}</dd></div>
    <div><dt>{en?'Difference':'Diferencia'}</dt><dd>{fmt(o.difference)}<small>{percent(o.revenueRatio)} {en?'of revenue':'de los ingresos'}</small></dd></div></dl>
   <p>{en?'It does not identify maintenance or expansion. Cash spending and accounting depreciation have different timing and scope; investment without cash payment, working capital and intangible assets are outside this comparison.':'No identifica mantenimiento ni expansión. Los pagos y la depreciación contable tienen distintos calendarios y alcances; quedan fuera la inversión sin desembolso, el capital de trabajo y los intangibles.'}</p>
   {diagnostic.status==='available'?<>
    <h5>{en?'Same business, two no-growth assumptions':'Mismo negocio, dos supuestos sin crecimiento'}</h5>
    <p>{en?'Both cases hold sales flat forever and preserve your margin path, tax rate, discount rate and equity bridge. Only the additional net investment burden changes. This is not a comparison with your current growth scenario.':'Ambos casos mantienen ventas constantes a perpetuidad y conservan tu trayectoria de margen, impuestos, tasa y puente al accionista. Sólo cambia la carga neta adicional de inversión. No es una comparación con tu escenario actual de crecimiento.'}</p>
    <div className={`${styles.table} ${styles.reinvestmentTable}`}><table><thead><tr><th>{en?'Comparison':'Comparación'}</th><th>{en?'No additional net burden':'Sin carga neta adicional'}</th><th>{en?'Repeat the observed difference':'Repetir la diferencia observada'}</th></tr></thead><tbody>
     <tr><th>{en?'Net burden (USD M/year)':'Carga neta (USD M/año)'}</th><td>{fmt(0)}</td><td>{fmt(o.difference)}</td></tr>
     <tr><th>{en?'Operating value (USD M)':'Valor operativo (USD M)'}</th><td>{fmt(diagnostic.control.operatingValue)}</td><td>{fmt(diagnostic.repeated.operatingValue)}</td></tr>
     <tr><th>{en?'Per share':'Por acción'}</th><td>{money(diagnostic.control.perShare)}</td><td>{money(diagnostic.repeated.perShare)}</td></tr>
    </tbody></table></div>
    <p>{en?'Change in operating value: ':'Cambio en el valor operativo: '}{fmt(diagnostic.delta.operatingValue)} {en?'USD million.':'millones de USD.'} {diagnostic.delta.perShare!==null?`${money(diagnostic.delta.perShare)} ${en?'per share.':'por acción.'}`:(en?'Per-share values await the existing equity reconciliation.':'El valor por acción espera la conciliación del capital existente.')}</p>
    <p>{en?'Test the explanation, not a target price: inspect asset lives, capacity additions and replacement requirements. The second case assumes the entire difference persists without growth; it is neither a forecast nor a loss bound.':'Contrasta la explicación, no un precio objetivo: revisa vidas útiles, capacidad añadida y necesidades de reposición. El segundo caso supone que toda la diferencia persiste sin crecimiento; no es un pronóstico ni una cota de pérdida.'}</p>
    <button type="button" disabled={disabled} onClick={()=>onApply(diagnostic.proposal)}>{en?'Test the second explanation':'Probar la segunda explicación'}</button>
    <p className={styles.meta}>{en?'Sets revenue growth and terminal growth to zero, and net maintenance to ':'Lleva crecimiento de ingresos y crecimiento terminal a cero, y mantenimiento neto a '}{percent(o.revenueRatio)}. {en?'Edits your draft only; does not save, approve the equity bridge or trade.':'Sólo modifica el borrador; no guarda, aprueba el puente al accionista ni opera.'}</p>
   </>:<p>{diagnostic.status==='nonpositive_difference'?(en?'The difference is zero or negative. We do not turn it into a perpetual release of cash.':'La diferencia es cero o negativa. No se transforma en una liberación perpetua de caja.'):diagnostic.status==='outside_model_domain'?(en?'The burden exceeds this model’s 30% revenue limit. It is not clipped to force a valuation.':'La carga supera el límite de 30% de ingresos de este modelo. No se recorta para forzar una valoración.'):(en?'The operating base cannot support this valuation test.':'La base operativa no permite esta prueba de valoración.')}</p>}
   <details className={styles.details}><summary>{en?'Calculation and source documents':'Cálculo y documentos fuente'}</summary>
    <p>{fmt(o.capex.value)} − {fmt(o.depreciation.value)} = {fmt(o.difference)}; {fmt(o.difference)} ÷ {fmt(o.revenue.value)} = {percent(o.revenueRatio)}.</p>
    {[o.capex,o.depreciation,o.revenue].map(f=><div key={f.concepts[0]}><a href={f.url} target="_blank" rel="noreferrer">{f.concepts.join(' + ')} ↗</a><p className={styles.meta}>{f.start} → {f.end} · {en?'Available':'Disponible'} {f.availableAt}</p><small className={styles.hash}>SHA-256 {f.filingHash}</small></div>)}
   </details>
  </>}
 </section>;
}

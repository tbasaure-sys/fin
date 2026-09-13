"use client";
import styles from './cash-bridge.module.css';

export const CASH_METRIC_LABELS={
 es:{da:'Depreciación, agotamiento y amortización',receivablesChange:'Variación de cuentas por cobrar',inventoryChange:'Variación de inventarios',payablesChange:'Variación de cuentas por pagar'},
 en:{da:'Depreciation, depletion and amortization',receivablesChange:'Reported receivables change',inventoryChange:'Reported inventory change',payablesChange:'Reported payables change'},
};
const COPY={
 es:{title:'Cómo cambió la caja',scope:'Aportes al cambio, en millones de USD. No son saldos de caja.',
  labels:{netIncome:'Resultado neto',da:'Depreciación y amortización',sbc:'Compensación en acciones',receivablesChange:'Cuentas por cobrar',inventoryChange:'Inventarios',payablesChange:'Cuentas por pagar',capex:'Efecto de la inversión física',cfo:'Cambio de caja operativa'},
  residual:'Resto no desglosado',residualHelp:'Es la diferencia entre el cambio total y los aportes mostrados. Puede incluir ajustes, otras partidas operativas y diferencias de perímetro. No identifica una causa ni demuestra que la conciliación sea completa.',
  calculation:'Ver cálculo y límites',missing:'Sin partida comparable:',reported:'Partidas publicadas; pulsa para ver su fuente.',
  reverse:'Un mayor aumento de este activo resta caja; una reducción aporta caja.',
  payable:'Un mayor aumento de esta obligación aporta caja; pagarla consume caja.',
  noncash:'Es un ajuste contable, no una entrada de dinero ni evidencia de caja sostenible.',
  capex:'Un aumento de pagos por inversión física resta caja. No separa mantenimiento de crecimiento.',
  total:'Cambio de caja después de inversión',noCapex:'Sin inversión comparable no se calcula el cambio de caja después de inversión.',
  formula:'Cambio de caja operativa − suma de aportes mostrados'},
 en:{title:'How cash changed',scope:'Contributions to the change, in USD millions. These are not cash balances.',
  labels:{netIncome:'Net income',da:'Depreciation and amortization',sbc:'Share-based compensation',receivablesChange:'Receivables',inventoryChange:'Inventories',payablesChange:'Payables',capex:'Cash investment effect',cfo:'Operating cash change'},
  residual:'Unclassified difference',residualHelp:'The difference between the total change and the components shown. It may include adjustments, other operating items and scope differences. It neither identifies a cause nor proves a complete reconciliation.',
  calculation:'Inspect calculation and limits',missing:'No comparable component:',reported:'Reported components; select one to inspect its source.',
  reverse:'A larger increase in this asset subtracts cash; a decrease adds cash.',
  payable:'A larger increase in this liability adds cash; paying it consumes cash.',
  noncash:'An accounting adjustment, not a cash receipt or evidence of sustainable cash generation.',
  capex:'An increase in cash PPE purchases subtracts cash. Maintenance and growth are not separated.',
  total:'Change in cash after investment',noCapex:'Without comparable investment figures, change in cash after investment is unresolved.',
  formula:'Operating cash change − sum of displayed contributions'},
};

export function CashBridge({bridge,language='es',format,onSelect}){
 if(bridge?.status!=='available')return null;
 const c=COPY[language]||COPY.es;
 const amount=value=>`${value<0?'−':value>0?'+':''}${format(Math.abs(value))}`;
 const known=bridge.components.reduce((sum,row)=>sum+row.effect,0);
 function row(item){
  const description=['receivablesChange','inventoryChange'].includes(item.id)?c.reverse:item.id==='payablesChange'?c.payable:
   ['da','sbc'].includes(item.id)?c.noncash:item.id==='capex'?c.capex:c.reported;
  return <li key={item.id} data-bridge-row={item.id}>
   <details><summary><span>{c.labels[item.id]}</span><strong>{amount(item.effect)}</strong></summary>
    <p>{description}</p><div className={styles.sources}>{item.evidence.map(ref=><button key={ref.end} onClick={()=>onSelect(ref)}
      aria-label={`${c.labels[item.id]} · ${ref.end}`}>{ref.end} ↗</button>)}</div>
   </details>
  </li>;
 }
 return <section className={styles.bridge} data-cash-bridge aria-label={c.title}>
  <div className={styles.heading}><h3>{c.title}</h3><span>{bridge.from} → {bridge.to}</span></div>
  <p>{c.scope}</p>
  <ul className={styles.rows}>
   {bridge.components.map(row)}
   <li className={styles.unclassified} data-bridge-row="unexplained">
    <div className={styles.line}><span>{c.residual}</span><strong>{amount(bridge.unexplained.value)}</strong></div>
    <details><summary>{c.calculation}</summary><p>{c.residualHelp}</p>
     <p>{c.formula}: {format(bridge.operatingCashChange)} − ({format(known)}) = {format(bridge.unexplained.value)}</p>
     {bridge.missingComponents.length?<p>{c.missing} {bridge.missingComponents.map(r=>c.labels[r.id]).join(', ')}.</p>:null}
    </details>
   </li>
   {row({id:'cfo',effect:bridge.operatingCashChange,evidence:bridge.operatingCashEvidence})}
   {bridge.capex?row(bridge.capex):null}
   {bridge.cashAfterCapexChange!==null?<li className={styles.total} data-bridge-row="cashAfterCapex"><span>{c.total}</span><strong>{amount(bridge.cashAfterCapexChange)}</strong></li>:null}
  </ul>
  {!bridge.capex?<p>{c.noCapex}</p>:null}
  <p className={styles.limit}>{language==='en'?'Accounting contributions, not business causes. Non-cash adjustments are not free money.':'Aportes contables, no causas del negocio. Los ajustes sin efectivo no son dinero gratis.'}</p>
 </section>;
}

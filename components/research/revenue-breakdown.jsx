"use client";
import {useState} from 'react';
import styles from './revenue-breakdown.module.css';

const AXES={ProductOrServiceAxis:['Productos y servicios','Products & services'],StatementBusinessSegmentsAxis:['Segmentos','Segments'],StatementGeographicalAxis:['Geografía','Geography']};
export function RevenueBreakdown({dossier,language='es'}){
 const [axis,setAxis]=useState(null);
 const en=language==='en',data=dossier.revenueBreakdown;
 if(!data)return null;
 const source=dossier.sources.find(s=>s.id===data.sourceId);
 if(!source)return null;
 const parts=data.version==='revenue-breakdown-v1'&&data.status==='available'?data.partitions:[];
 const part=parts.find(p=>p.axis===axis)||parts[0];
 const n=(value,digits=0)=>Number.isFinite(value)?new Intl.NumberFormat(en?'en-US':'es-CL',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value):'—';
 const signed=(value,digits=0)=>Number.isFinite(value)?`${value<0?'−':value>0?'+':''}${n(Math.abs(value),digits)}`:'—';
 const money=value=>n(value/1e6);
 const label=p=>AXES[p.axis.split(':').at(-1)]?.[en?1:0]||p.axis;
 const link=(fact,text)=><a href={`${source.url}#${encodeURIComponent(fact.factId)}`} target="_blank" rel="noreferrer">{text} ↗</a>;
 return <section className={styles.panel} data-revenue-breakdown aria-label={en?'Revenue drivers':'Desglose de ingresos'}>
  <h2>{en?'Where growth comes from':'De dónde viene el crecimiento'}</h2>
  {!part?<p>{en?'A complete revenue breakdown could not be reconciled from the latest document.':'No pudimos conciliar un desglose completo de ingresos en el documento más reciente.'} <a href={source.url} target="_blank" rel="noreferrer">{en?'Open document':'Abrir documento'} ↗</a></p>:<>
   <p className={styles.period}>{part.currentTotal.start} → {part.currentTotal.end} · {en?'Compared with':'Comparado con'} {part.priorTotal.start} → {part.priorTotal.end}</p>
   <div className={styles.tabs} role="group" aria-label={en?'Revenue views':'Vistas de ingresos'}>{parts.map(p=><button key={p.axis} aria-pressed={p.axis===part.axis} onClick={()=>setAxis(p.axis)}>{label(p)}</button>)}</div>
   <div className={styles.total}><span>{en?'Consolidated revenue growth':'Crecimiento de ingresos consolidados'}</span><strong>{signed(part.totalGrowth===null?null:part.totalGrowth*100,2)}{part.totalGrowth===null?'':'%'}</strong></div>
   <p className={styles.guide}>{en?'Each row shows its contribution in percentage points (pp), not its own growth rate. Open it to inspect the figures.':'Cada fila muestra su aporte en puntos porcentuales (pp), no su tasa de crecimiento propia. Ábrela para ver las cifras.'}</p>
   <ul className={styles.rows} key={part.axis}>{part.rows.map(row=><li key={row.member}><details>
    <summary><span>{row.label}</span><strong>{signed(row.growthContribution===null?null:row.growthContribution*100,2)}{row.growthContribution===null?'':' pp'}</strong></summary>
    <div className={styles.detail}>
     <p>{en?'Millions of USD':'Millones de USD'} · {money(row.prior.value)} → {money(row.current.value)} · Δ {signed(row.change/1e6)}</p>
     <p>{en?'Contribution = change / previous consolidated revenue × 100':'Aporte = variación / ingresos consolidados anteriores × 100'}<br/>{signed(row.change/1e6)} / {money(part.priorTotal.value)} × 100 = {signed(row.growthContribution===null?null:row.growthContribution*100,2)}{row.growthContribution===null?'':' pp'}</p>
     <div className={styles.links}>{link(row.prior,en?'Prior figure in document':'Cifra anterior en el documento')}{link(row.current,en?'Current figure in document':'Cifra actual en el documento')}</div>
     {row.labelBasis==='taxonomy_identifier'?<p>{en?'Label derived from the reporting identifier':'Nombre derivado del identificador contable'}: <code>{row.member}</code></p>:null}
    </div>
   </details></li>)}</ul>
   <details className={styles.method}><summary>{en?'Reconciliation and scope':'Conciliación y alcance'}</summary>
    <p>{part.reconciliation.priorGap===0&&part.reconciliation.currentGap===0?(en?'Rows reconcile to consolidated revenue in both periods.':'Las filas cuadran con los ingresos consolidados en ambos períodos.'):(en?'Residual differences within source rounding tolerance, in USD:':'Diferencias residuales dentro de la tolerancia de redondeo del documento, en USD:')+` ${n(part.reconciliation.priorGap)} → ${n(part.reconciliation.currentGap)}`}</p>
    <p>{en?'Views describe the same revenue and must not be added together. Revenue mix alone does not establish retention, recurring revenue, margins or competitive advantage.':'Las vistas describen los mismos ingresos: no se suman entre sí. La mezcla de ingresos no demuestra retención, recurrencia, márgenes ni ventaja competitiva.'}</p>
    <div className={styles.links}>{link(part.priorTotal,en?'Prior consolidated total':'Total consolidado anterior')}{link(part.currentTotal,en?'Current consolidated total':'Total consolidado actual')}</div>
    <p>{source.form} · {en?'Available':'Disponible'} {source.acceptedAt?.slice(0,10)}</p>
   </details>
  </>}
 </section>;
}

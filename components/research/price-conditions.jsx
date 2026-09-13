"use client";
import styles from './price-conditions.module.css';

export function PriceConditions({conditions,impact,language,onProbe,disabled}){
 if(!conditions)return null;
 const en=language==='en',locale=en?'en-US':'es-CL';
 const percent=n=>new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1}).format(n);
 const money=n=>`US$ ${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n)}`;
 const title=en?'What would have to change to support the price':'Qué tendría que cambiar para sostener el precio';
 return <section className={styles.conditions} aria-label={title}>
  <h4>{title}</h4>
  <p>{en?'Each condition changes one assumption, holding all others fixed. The boundary makes modeled value equal the captured price; it is not an observed market expectation.':'Cada condición cambia un solo supuesto y mantiene los demás. El umbral iguala el valor calculado a la cotización capturada; no es una expectativa observada del mercado.'}</p>
  {conditions.items.map(item=>{
   const margin=item.parameter==='margin',exposure=impact?.conditionDeltas?.find(x=>x.parameter===item.parameter);
   const label=margin?(en?'Year-five operating margin':'Margen operativo al año cinco'):(en?'Net maintenance / revenue':'Mantenimiento neto / ingresos');
   return <div key={item.parameter} className={styles.condition}>
    <h5>{label}</h5>
    <dl><div><dt>{en?'Your assumption':'Tu supuesto'}</dt><dd>{percent(item.assumed)}</dd></div><div><dt>{en?'Break-even with price':'Equilibrio con el precio'}</dt><dd>{item.breakEven!==null?percent(item.breakEven):'—'}</dd></div></dl>
    {item.status==='within_domain'?<p>{margin?(en?'Below this margin, modeled value is below the price.':'Por debajo de este margen, el valor del modelo es inferior al precio.'):(en?'Above this maintenance burden, modeled value is below the price.':'Por encima de este mantenimiento, el valor del modelo es inferior al precio.')}</p>:<p>{en?'No unique break-even inside the declared range: ':'No hay un equilibrio único dentro del rango declarado: '}{percent(item.domain[0])} – {percent(item.domain[1])}.</p>}
    <p>{margin?(en?'Check segment margins, business mix and costs that may recur. A consolidated margin does not prove every segment is resilient.':'Contrasta márgenes por segmento, mezcla de negocios y costos que pueden repetirse. El margen agregado no prueba la resistencia de cada segmento.'):(en?'Separate maintenance from expansion and depreciation. Cash PPE spending alone does not identify net maintenance.':'Separa mantenimiento, expansión y depreciación. Los pagos por activos físicos no identifican por sí solos el mantenimiento neto.')}</p>
    {item.adverseStep?<><p className={styles.impact}>{en?'Changing this assumption by ':'Cambiar este supuesto en '}{new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(item.adverseStep.parameterDelta*100)} pp: {money(item.adverseStep.perShareDelta)} {en?'per share':'por acción'}{exposure?` · ${money(exposure.deltaUsd)} ${en?'in this recorded position':'en esta posición registrada'}`:''}.</p>
     <button type="button" disabled={disabled} onClick={()=>onProbe(item.parameter,item.assumed+item.adverseStep.parameterDelta)}>{en?'Simulate ':'Simular '}{new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(Math.abs(item.adverseStep.parameterDelta)*100)}{margin?(en?' pp less margin':' pp menos de margen'):(en?' pp more maintenance':' pp más de mantenimiento')}</button>
    </>:null}
   </div>;
  })}
  <p>{en?'Simulation edits your draft, not the saved revision. Neither joint stress nor a loss limit; correlated changes can have a different effect.':'La simulación modifica el borrador, no la revisión guardada. No es estrés conjunto ni límite de pérdida: cambios correlacionados pueden tener otro efecto.'}</p>
 </section>;
}

// Agent-adjudicated development controls, not independent human labels or a
// representative estimate of report quality. Fix these before querying a model.
export const controls={
 MSFT:[
  ['cash-faithful','Cash from operations increased','Microsoft atribuye el aumento de caja operativa a mayores cobros de clientes y menores pagos de impuestos, parcialmente compensados por mayores pagos a proveedores.',true,['increase in cash received from customers','decrease in cash used to pay income taxes','increase in cash paid to suppliers']],
  ['cash-overreach','Cash from operations increased','El crecimiento de caja operativa demuestra que las suscripciones generan caja recurrente y que la empresa no necesitará financiación externa.',false,[]],
  ['cloud-faithful','Our Microsoft Cloud revenue','Los ingresos de Microsoft Cloud ya están incluidos en varias líneas de productos y servicios reportadas.',true,['These amounts are included in Server products and cloud services']],
  ['cloud-double-count','Our Microsoft Cloud revenue','Microsoft Cloud es un segmento adicional cuyos ingresos deben sumarse al total de productos y servicios para obtener los ingresos consolidados.',false,[]],
  ['capacity-faithful','Overestimation of demand','Microsoft advierte que sobreestimar demanda o desalinear inversión en capacidad puede causar infraestructura ociosa y deterioro de activos.',true,['Overestimation of demand or misalignment of capacity investments','underutilization of infrastructure','impairment of assets']],
  ['capacity-overreach','Overestimation of demand','Microsoft ya sufrió deterioros de activos por exceso de capacidad y esto demuestra que el mercado infravalora su negocio.',false,[]],
 ],
 AAPL:[
  ['subscription-faithful','subscription-based services','Apple ofrece contenido digital mediante suscripciones, incluyendo Apple Music y Apple TV.',true,['subscription-based services','Apple Music','Apple TV']],
  ['subscription-overreach','subscription-based services','Todos los servicios de Apple, incluidos pagos y almacenamiento en nube, generan ingresos recurrentes garantizados por la retención de clientes.',false,[]],
  ['buybacks-faithful','The Company’s share repurchase programs do not obligate','Apple declara que sus programas de recompra no la obligan a adquirir una cantidad mínima de acciones.',true,['share repurchase programs do not obligate the Company to acquire a minimum amount of shares']],
  ['buybacks-overreach','The Company’s share repurchase programs do not obligate','Apple financió las recompras principalmente vendiendo valores negociables y utilizando efectivo disponible.',false,[]],
  ['supply-faithful','is experiencing a period of supply constraints','Apple declara que está experimentando restricciones de suministro y aumentos de costos de componentes, y espera que estas tendencias se intensifiquen.',true,['is experiencing a period of supply constraints and increasing costs','expects these trends to intensify']],
  ['supply-overreach','is experiencing a period of supply constraints','Apple declara que las subidas de precios compensarán completamente los mayores costos sin reducir demanda ni márgenes.',false,[]],
 ],
};
export function bindControls(dossier){
 const rows=controls[dossier.ticker];if(!rows)throw Error('CONTROL_ISSUER_MISSING');
 const chunks=dossier.sections.flatMap(s=>s.extracts);
 return {dossier,cases:rows.map(([id,needle,text,expected,requiredSupport])=>{
  const matches=chunks.filter(c=>c.text.includes(needle));
  if(matches.length!==1)throw Error(`CONTROL_SOURCE_MISSING_OR_AMBIGUOUS:${id}`);
  return {id,chunkId:matches[0].id,text,expected,requiredSupport};
 })};
}

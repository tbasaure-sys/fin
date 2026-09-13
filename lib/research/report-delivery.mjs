// Structural delivery coverage, never a score of truth, usefulness, investment quality or alpha.
export function reportDelivery(analysis) {
 const sections=['business','cash','thesis'].map(id=>{
  const section=analysis?.sections?.find(s=>s.id===id);
  const findings=section?.findings?.length||0;
  const questions=section?.unknowns?.length||0,checks=section?.checks?.length||0;
  return {id,findings,questions,checks,status:!findings?'insufficient':findings>=2&&questions>0&&checks>0?'developed':'partial'};
 });
 const findings=sections.reduce((sum,s)=>sum+s.findings,0);
 return {version:'report-delivery-v1',status:!findings?'insufficient':sections.every(s=>s.status==='developed')?'documentary_brief':'partial',
  findings,sections,investmentAnalysisComplete:false,qualityCertified:false};
}

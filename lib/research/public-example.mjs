// Curated historical example, not live coverage or a valuation recommendation.
export const publicExample = Object.freeze({
  version:'msft-cash-example-v1',ticker:'MSFT',periodEnd:'2025-06-30',reviewedAt:'2026-09-13',
  source:'https://www.microsoft.com/investor/reports/ar25/index.html',
  locator:'Cash Flows Statements / Net cash from operations; Additions to property and equipment',
  unit:'USD millions',years:[2024,2025],cfo:[118548,136162],capex:[44477,64551],
});
export function exampleCashBridge(example=publicExample){
 const residual=example.cfo.map((value,i)=>value-example.capex[i]);
 return {residual,cfoChange:example.cfo[1]/example.cfo[0]-1,capexChange:example.capex[1]/example.capex[0]-1,residualChange:residual[1]/residual[0]-1};
}

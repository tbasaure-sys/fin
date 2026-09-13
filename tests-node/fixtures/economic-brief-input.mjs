// Small, hand-checkable accounting fixture. Values in USD, not real company data.
export function briefInput({scale=1}={}){
 const source={id:'D1',cik:'1',form:'10-Q',accession:'test-filing',sha256:'a'.repeat(64),acceptedAt:'2026-08-01T00:00:00Z',periodEnd:'2026-06-30',url:'https://www.sec.gov/Archives/test.htm'};
 const dates=[{start:'2025-01-01',end:'2025-06-30'},{start:'2026-01-01',end:'2026-06-30'}];
 const fact=(value,i,id)=>({value:value*scale,...dates[i],factId:id,contextId:'context-'+i});
 const values={revenue:[100,120],ebit:[10,24],cfo:[30,40],capex:[10,15],buybacks:[9,16],dividends:[3,5],cashChange:[2,1],cfi:[-12,-17],cff:[-16,-22]};
 const metrics=Object.fromEntries(Object.entries(values).map(([metric,pair])=>[metric,Object.fromEntries(pair.map((value,i)=>{
  const raw={value:value*scale,unit:'USD',...dates[i],availableAt:source.acceptedAt,accession:source.accession,concepts:[metric],sourceHash:'b'.repeat(64),filingHash:source.sha256,url:source.url};
  return [i?'current':'prior',{...raw,status:'reported',terms:[{coefficient:1,fact:raw}]}];
 }))]));
 return {dossier:{ticker:'TEST',name:'Accounting fixture',cik:'1',asOf:'2026-08-02T00:00:00Z',packetHash:'c'.repeat(64),delivery:'live',coverage:{documents:1,selectedChunks:3,totalChunks:3},
 sections:['business','cash','thesis'].map(id=>({id,extracts:[{id:`D1:${id}`,text:'Documentary fixture for cash and revenue analysis.'}]})),
 sources:[source],revenueBreakdown:{version:'revenue-breakdown-v1',status:'available',sourceId:'D1',partitions:[{
  axis:'srt:ProductOrServiceAxis',sourceId:'D1',unit:'USD',currentTotal:fact(120,1,'total-now'),priorTotal:fact(100,0,'total-prior'),
  reconciliation:{priorGap:0,currentGap:0,roundingTolerance:{prior:0,current:0}},rows:[
   {member:'test:Hardware',label:'Hardware',current:fact(80,1,'hardware-now'),prior:fact(50,0,'hardware-prior')},
   {member:'test:Service',label:'Services',current:fact(40,1,'service-now'),prior:fact(50,0,'service-prior')},
  ]
 }]}},reading:{version:'financial-reading-v1',ticker:'TEST',asOf:'2026-08-02T00:00:00Z',status:'available',periods:[{end:'2025-12-31',values:{}}],comparisons:{},signals:[],cashBridge:null,evidence:{},interim:{status:'available',start:'2026-01-01',end:'2026-06-30',metrics}}};
}

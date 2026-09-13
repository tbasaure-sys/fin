// A connected accounting brief. Every counterfactual is an identity holding the
// other reported terms fixed, not a forecast, causal estimate or valuation.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const days=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000;
const absent=reason=>({status:'unresolved',reason});
const axisOrder=['ProductOrServiceAxis','StatementBusinessSegmentsAxis','StatementGeographicalAxis'];
const samePeriod=(a,b)=>a?.start===b?.start&&a?.end===b?.end;
const sameBasis=(a,b)=>samePeriod(a,b)&&a?.accession===b?.accession&&a?.unit===b?.unit;
function sourceValid(source,dossier){
 return source&&/^10-[KQ](?:\/A)?$/.test(source.form)&&/^[a-f0-9]{64}$/.test(source.sha256||'')
  &&(source.cik===undefined||Number(source.cik)===Number(dossier.cik))
  &&Number.isFinite(Date.parse(source.acceptedAt))&&Date.parse(source.acceptedAt)<=Date.parse(dossier.asOf)
  &&Date.parse(source.periodEnd)<=Date.parse(source.acceptedAt)&&/^https:\/\/www\.sec\.gov\//.test(source.url||'');
}
function comparable(a,b){
 return a&&b&&days(b.end,a.end)>=330&&days(b.end,a.end)<=380
  &&days(a.end,a.start)>=60&&days(b.end,b.start)>=60
  &&days(a.end,a.start)<=380&&days(b.end,b.start)<=380
  &&Math.abs(days(a.end,a.start)-days(b.end,b.start))<=8;
}
function growthBridge(dossier){
 const data=dossier?.revenueBreakdown,source=dossier?.sources?.find(s=>s.id===data?.sourceId);
 if(data?.version!=='revenue-breakdown-v1'||data.status!=='available'||!sourceValid(source,dossier))return absent('NO_RECONCILED_REVENUE');
 const parts=[...(data.partitions||[])].filter(p=>axisOrder.includes(p.axis?.split(':').at(-1)))
  .sort((a,b)=>axisOrder.indexOf(a.axis.split(':').at(-1))-axisOrder.indexOf(b.axis.split(':').at(-1)));
 const p=parts[0],a=p?.priorTotal,b=p?.currentTotal;
 if(!p||p.unit!=='USD'||p.sourceId!==source.id||!finite(a?.value)||a.value<=0||!finite(b?.value)||b.value<0
  ||b.end!==source.periodEnd||!comparable(a,b)||!Array.isArray(p.rows)||p.rows.length<2||p.rows.length>30
  ||new Set(p.rows.map(r=>r.member)).size!==p.rows.length)return absent('INCOMPATIBLE_REVENUE_PARTITION');
 const rows=[];
 for(const row of p.rows){
  if(!samePeriod(row.prior,a)||!samePeriod(row.current,b)||!finite(row.prior?.value)||!finite(row.current?.value)
    ||row.prior.value<0||row.current.value<0||typeof row.label!=='string'||!row.label.trim()
    ||!row.prior.factId||!row.current.factId)return absent('INVALID_REVENUE_ROW');
  const change=row.current.value-row.prior.value;
  rows.push({member:row.member,label:row.label,prior:row.prior,current:row.current,change,contribution:change/a.value});
 }
 const tolerance=p.reconciliation?.roundingTolerance;
 if(!finite(tolerance?.prior)||!finite(tolerance?.current)||tolerance.prior<0||tolerance.current<0
  ||tolerance.prior>a.value*0.001||tolerance.current>b.value*0.001
  ||Math.abs(rows.reduce((sum,r)=>sum+r.prior.value,0)-a.value)>tolerance.prior
  ||Math.abs(rows.reduce((sum,r)=>sum+r.current.value,0)-b.value)>tolerance.current)return absent('UNRECONCILED_REVENUE');
 const change=b.value-a.value,direction=change<0?-1:1;
 const primary=[...rows].sort((x,y)=>direction*(y.change-x.change)||x.member.localeCompare(y.member))[0];
 return {status:'available',axis:p.axis,source,prior:a.value,current:b.value,change,growth:change/a.value,
  start:b.start,end:b.end,priorStart:a.start,priorEnd:a.end,totals:{prior:a,current:b},rows,
  primary:{...primary,shareOfNetChange:change!==0?primary.change/change:null},economicCauseVerified:false};
}
export function growthSensitivity(growth,retainedChange=0){
 if(growth?.status!=='available'||!finite(retainedChange)||retainedChange<0||retainedChange>1)return null;
 const changeVsObserved=-(1-retainedChange)*growth.primary.change,revenue=growth.current+changeVsObserved;
 return {retainedChange,revenue,growth:(revenue-growth.prior)/growth.prior,changeVsObserved,
  period:{start:growth.start,end:growth.end},forecast:false,assumption:'other_reported_revenue_unchanged'};
}
export function economicBrief({dossier,reading}){
 const growth=growthBridge(dossier),matched=reading?.version==='financial-reading-v1'&&reading.ticker===dossier?.ticker&&reading.asOf===dossier?.asOf;
 const interim=reading?.interim,basis=interim&&interim.status!=='no_new_interim'?'cumulative':'annual';
 const periods=reading?.periods||[],last=periods.at(-1),previous=periods.at(-2);
 function fact(metric,period){
  if(!matched)return null;
  let cell,raw;
  if(basis==='cumulative'){
   cell=interim?.metrics?.[metric]?.[period];
   if(cell?.terms?.length!==1||cell.terms[0].coefficient!==1)return null;
   raw=cell.terms[0].fact;
   if(period==='current'&&!samePeriod(raw,interim))return null;
  }else{
   cell=(period==='current'?last:previous)?.values?.[metric];
   if(cell?.evidenceKeys?.length!==1)return null;raw=reading.evidence?.[cell.evidenceKeys[0]];
   if(raw?.end!==(period==='current'?last:previous)?.end)return null;
  }
  const duration=days(raw?.end,raw?.start);
  if(!finite(duration)||(basis==='annual'?(duration<330||duration>380):(duration<60||duration>300)))return null;
  const source=dossier.sources.find(s=>s.accession===raw?.accession&&s.sha256===raw?.filingHash&&s.url===raw?.url);
  if(!sourceValid(source,dossier)||!finite(cell?.value)||cell.value!==raw?.value||cell.unit!=='USD'||raw.unit!=='USD'
   ||Date.parse(raw.availableAt)!==Date.parse(source.acceptedAt)||Date.parse(raw.end)>Date.parse(raw.availableAt)
   ||!Array.isArray(raw.concepts)||!raw.concepts.length||!/^[a-f0-9]{64}$/.test(raw.sourceHash||''))return null;
  if(['capex','buybacks','dividends','revenue'].includes(metric)&&raw.value<0)return null;
  return raw;
 }
 const cfo={prior:fact('cfo','prior'),current:fact('cfo','current')},capex={prior:fact('capex','prior'),current:fact('capex','current')};
 const validPair=pair=>comparable(pair.prior,pair.current)&&pair.prior.accession===pair.current.accession&&pair.prior.concepts.join()===pair.current.concepts.join();
 let cash=absent('INCOMPATIBLE_CASH_AND_INVESTMENT'),capital=absent('INCOMPLETE_CASH_ALLOCATION');
 if(validPair(cfo)&&validPair(capex)&&sameBasis(cfo.prior,capex.prior)&&sameBasis(cfo.current,capex.current)){
  const current=cfo.current.value-capex.current.value,prior=cfo.prior.value-capex.prior.value;
  cash={status:'available',basis,start:cfo.current.start,end:cfo.current.end,priorStart:cfo.prior.start,priorEnd:cfo.prior.end,
   current,prior,change:current-prior,operatingEffect:cfo.current.value-cfo.prior.value,investmentEffect:capex.prior.value-capex.current.value,
   currentOperating:cfo.current.value,currentInvestment:capex.current.value,evidence:{cfo,capex},normalized:false};
  const buybacks=fact('buybacks','current'),dividends=fact('dividends','current');
  if(sameBasis(buybacks,cfo.current)&&sameBasis(dividends,cfo.current)){
   const selectedResidual=current-buybacks.value-dividends.value;
   const extras=Object.fromEntries(['cfi','cff','cashChange'].map(id=>{const f=fact(id,'current');return [id,sameBasis(f,cfo.current)?f:null]}));
   capital={status:'available',basis,start:cash.start,end:cash.end,buybacks:buybacks.value,dividends:dividends.value,selectedResidual,
    otherInvesting:extras.cfi?extras.cfi.value+capex.current.value:null,
    otherFinancing:extras.cff?extras.cff.value+buybacks.value+dividends.value:null,
    unclassified:extras.cashChange&&extras.cfi&&extras.cff?extras.cashChange.value-cfo.current.value-extras.cfi.value-extras.cff.value:null,
    cashChange:extras.cashChange?.value??null,evidence:{cfo:cfo.current,capex:capex.current,buybacks,dividends,...extras},fundingAttribution:null};
  }
 }
 const revenue={prior:fact('revenue','prior'),current:fact('revenue','current')};
 const growthCashComparable=growth.status==='available'&&cash.status==='available'&&validPair(revenue)
  &&sameBasis(revenue.current,cfo.current)&&sameBasis(revenue.prior,cfo.prior)
  &&growth.start===cash.start&&growth.end===cash.end&&growth.priorStart===cash.priorStart&&growth.priorEnd===cash.priorEnd
  &&growth.source.accession===revenue.current.accession&&growth.current===revenue.current.value&&growth.prior===revenue.prior.value;
 return {version:'economic-brief-v1',ticker:dossier?.ticker,asOf:dossier?.asOf,
  status:[growth,cash,capital].some(x=>x.status==='available')?'available':'unresolved',growth,cash,capital,growthCashComparable,
  valuation:null,mispricing:null,predictiveClaim:false};
}

// Pure, versioned economics. No market request, optimization, AI or trading side effects.
export const VALUATION_VERSION='bls-thesis-fcff-v1.3';
const DAY=86400000;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const age=(date,at)=>(Date.parse(at)-Date.parse(date))/DAY;
const fresh=(date,at,days)=>Number.isFinite(age(date,at))&&age(date,at)>=0&&age(date,at)<=days;
const bounded=(n,low,high)=>finite(n)&&n>=low&&n<=high;

export function defaultAssumptions(financial){
 const {revenue,ebit}=financial.facts||{};
 return {growth:0,margin:revenue?.value>0&&finite(ebit?.value)?Math.max(.01,Math.min(.8,ebit.value/revenue.value)):.15,
  taxRate:.25,discountRate:.1,terminalGrowth:0,salesToCapital:2,maintenanceRate:0,
  cashUsableRate:1,otherClaims:null,bridgeReviewed:false,rationale:''};
}
export function validateAssumptions(a){
 const ranges={growth:[-.2,.3],margin:[.01,.8],taxRate:[0,.6],discountRate:[.04,.3],terminalGrowth:[0,.04],salesToCapital:[.2,20],maintenanceRate:[0,.3],cashUsableRate:[0,1]};
 if(!a||Object.keys(a).sort().join()!==[...Object.keys(ranges),'otherClaims','bridgeReviewed','rationale'].sort().join()
  ||Object.entries(ranges).some(([k,[l,h]])=>!bounded(a[k],l,h))||a.terminalGrowth>=a.discountRate-.005
  ||(a.otherClaims!==null&&!bounded(a.otherClaims,0,1e15))||typeof a.bridgeReviewed!=='boolean'
  ||typeof a.rationale!=='string'||a.rationale.length>2000||(a.bridgeReviewed&&!a.rationale.trim()))throw Error('INVALID_ASSUMPTIONS');
 return structuredClone(a);
}
function validFact(f,unit,cutoff){
 return f&&finite(f.value)&&f.unit===unit&&typeof f.accession==='string'&&f.accession.length>0
  &&/^[a-f0-9]{64}$/.test(f.sourceHash||'')&&/^https:\/\//.test(f.url||'')
  &&fresh(f.availableAt,cutoff,20000)&&Number.isFinite(Date.parse(f.end))&&Date.parse(f.end)<=Date.parse(f.availableAt);
}
function project(f,a,bridge){
 let revenue=f.revenue.value;const startMargin=f.ebit.value/revenue,years=[];
 for(let year=1;year<=5;year++){
  const priorRevenue=revenue;revenue*=1+a.growth;
  const margin=startMargin+(a.margin-startMargin)*year/5,ebit=revenue*margin,nopat=ebit*(1-a.taxRate);
  const growthInvestment=Math.max(0,revenue-priorRevenue)/a.salesToCapital;
  const maintenance=revenue*a.maintenanceRate,reinvestment=growthInvestment+maintenance,fcff=nopat-reinvestment;
  years.push({year,revenue,margin,ebit,nopat,growthInvestment,maintenance,reinvestment,fcff,presentValue:fcff/(1+a.discountRate)**year});
 }
 const terminalRevenue=revenue*(1+a.terminalGrowth),terminalNopat=terminalRevenue*a.margin*(1-a.taxRate);
 const terminalReinvestment=(terminalRevenue-revenue)/a.salesToCapital+terminalRevenue*a.maintenanceRate;
 const terminalFcff=terminalNopat-terminalReinvestment,terminalValue=terminalFcff/(a.discountRate-a.terminalGrowth);
 const terminalPresentValue=terminalValue/(1+a.discountRate)**5;
 const operatingValue=years.reduce((s,y)=>s+y.presentValue,0)+terminalPresentValue;
 const equityValue=bridge?operatingValue+f.cash.value*a.cashUsableRate-f.debt.value-a.otherClaims:null;
 // Keep negative residual equity visible in the bridge; limited-liability common equity is floored at zero.
 const perShare=equityValue===null?null:Math.max(0,equityValue)/f.shares.value;
 return {years,terminal:{revenue:terminalRevenue,nopat:terminalNopat,reinvestment:terminalReinvestment,fcff:terminalFcff,presentValue:terminalPresentValue},
  operatingValue,equityValue,perShare,terminalShare:operatingValue>0?terminalPresentValue/operatingValue:null,
  bridge:bridge?{cash:f.cash.value*a.cashUsableRate,debt:f.debt.value,otherClaims:a.otherClaims,shares:f.shares.value}:null};
}
export function valueThesis(financial,assumptions,quote,at){
 const a=validateAssumptions(assumptions),f=financial.facts||{},blockers=[];
 const result={version:VALUATION_VERSION,status:'blocked',license:'conditional_research',performance:null,predictiveClaim:false,
  ticker:financial.ticker,base:null,scenarios:[],sensitivity:[],comparison:null,priceConditions:null,blockers,warnings:[...(financial.warnings||[])]};
 const cutoff=financial.asOf;
 if(!fresh(cutoff,at,20000)||!validFact(f.revenue,'USD',cutoff)||!validFact(f.ebit,'USD',cutoff)
  ||f.revenue.start!==f.ebit.start||f.revenue.end!==f.ebit.end||f.revenue.accession!==f.ebit.accession
  ||!bounded((Date.parse(f.revenue.end)-Date.parse(f.revenue.start))/DAY,330,380)
  ||financial.currency!=='USD'||!(f.revenue.value>0)||!(f.ebit.value>0))blockers.push('OPERATING_FACTS_UNRESOLVED');
 if(financial.identity?.supportedBusiness!==true)blockers.push('BUSINESS_MODEL_UNSUPPORTED');
 if(blockers.length)return result;
 if(!fresh(f.revenue.end,at,550))blockers.push('FINANCIALS_STALE');
 if(!['cash','debt','shares'].every(k=>validFact(f[k],k==='shares'?'shares':'USD',cutoff)&&f[k].value>=0&&fresh(f[k].end,at,550))
  ||!(f.shares?.value>0)||f.cash?.end!==f.debt?.end||f.cash?.accession!==f.debt?.accession)blockers.push('CAPITAL_FACTS_UNRESOLVED');
 if(financial.identity?.singleClass!==true)blockers.push('SECURITY_UNRESOLVED');
 if(!a.bridgeReviewed||a.otherClaims===null)blockers.push('BRIDGE_UNREVIEWED');
 const quoteOk=quote&&quote.ticker===financial.ticker&&quote.currency==='USD'&&quote.instrumentType==='EQUITY'
  &&bounded(quote.price,.00001,1e8)&&fresh(quote.asOf,at,4);
 const sharesOk=quoteOk&&bounded(quote.shares,1,1e15)&&f.shares?.value>0&&Math.abs(quote.shares/f.shares.value-1)<=.25;
 // A known unit discontinuity invalidates the per-share denominator itself,
 // not only the comparison. Operating value remains independent of market price.
 if(quoteOk&&bounded(quote.shares,1,1e15)&&f.shares?.value>0&&!sharesOk)blockers.push('CURRENT_SHARES_UNRECONCILED');
 const bridge=blockers.length===0;
 result.base=project(f,a,bridge);result.status=bridge?'conditional':'operating_only';
 const policies=[['stress',{growth:Math.max(-.2,a.growth-.05),margin:Math.max(.01,a.margin-.03),discountRate:Math.min(.3,a.discountRate+.02)}],
  ['base',{}],['expansion',{growth:Math.min(.3,a.growth+.05),margin:Math.min(.8,a.margin+.02)}]];
 result.scenarios=policies.map(([id,patch])=>({id,assumptions:{...a,...patch},...project(f,{...a,...patch},bridge)}));
 for(const discountRate of [Math.max(a.terminalGrowth+.01,a.discountRate-.02),a.discountRate,Math.min(.32,a.discountRate+.02)]){
  for(const margin of [Math.max(.01,a.margin-.03),a.margin,Math.min(.8,a.margin+.03)]){
   const v=project(f,{...a,discountRate,margin},bridge);result.sensitivity.push({discountRate,margin,operatingValue:v.operatingValue,perShare:v.perShare});
  }
 }
 if(result.base.terminal.fcff<=0)result.warnings.push('TERMINAL_CASH_NONPOSITIVE');
 if(result.base.terminalShare>.75)result.warnings.push('TERMINAL_DOMINATED');
 result.warnings.push('ASSUMPTIONS_NOT_FORECASTS','ANNUAL_NOT_TTM','SHARES_ARE_A_DATED_PROXY');
 if(!quoteOk)blockers.push('QUOTE_UNAVAILABLE');else if(!sharesOk&&!blockers.includes('CURRENT_SHARES_UNRECONCILED'))blockers.push('CURRENT_SHARES_UNRECONCILED');
 if(bridge&&quoteOk&&sharesOk){
  // Only these two parameters are affine in raw equity under this exact model.
  // Interpolate BEFORE the limited-liability floor, which is not affine. Positive
  // quote prices guarantee that an admitted root is above that floor.
  const items=[['margin',.01,.8,'decrease'],['maintenanceRate',0,.3,'increase']].map(([parameter,low,high,adverseDirection])=>{
   const raw=x=>project(f,{...a,[parameter]:x},true).equityValue/f.shares.value;
   const left=raw(low),right=raw(high),slope=(right-left)/(high-low);
   const candidate=finite(slope)&&Math.abs(slope)>1e-12?low+(quote.price-left)/slope:null;
   const inside=candidate!==null&&candidate>=low-1e-12&&candidate<=high+1e-12;
   const breakEven=inside?Math.max(low,Math.min(high,candidate)):null;
   const reconciled=breakEven!==null&&Math.abs(raw(breakEven)-quote.price)<=1e-8*Math.max(1,quote.price);
   const step=adverseDirection==='decrease'?-Math.min(.01,a[parameter]-low):Math.min(.01,high-a[parameter]);
   return {parameter,domain:[low,high],assumed:a[parameter],adverseDirection,status:reconciled?'within_domain':candidate===null?'insensitive':'outside_domain',breakEven:reconciled?breakEven:null,
    adverseStep:Math.abs(step)>1e-12?{parameterDelta:step,perShareDelta:project(f,{...a,[parameter]:a[parameter]+step},true).perShare-result.base.perShare}:null};
  });
  result.priceConditions={version:'affine-price-conditions-v1',claim:'conditional_model_boundary_not_market_forecast',price:quote.price,priceAsOf:quote.asOf,items};
  const stress=result.scenarios[0].perShare,up=result.scenarios[2].perShare;
  result.comparison={price:quote.price,asOf:quote.asOf,gap:result.base.perShare/quote.price-1,
   asymmetry:stress<quote.price&&up>quote.price?(up-quote.price)/(quote.price-stress):null,
   impliedGrowth:null,impliedGrowthStatus:'outside_search_or_non_unique'};
  // Search only a declared bounded domain; count crossings rather than assuming a unique inverse.
  const gaps=[];for(let i=0;i<=100;i++){const growth=-.2+i*.005;gaps.push({growth,gap:project(f,{...a,growth},true).perShare-quote.price})}
  const crossings=gaps.slice(1).flatMap((p,i)=>p.gap*gaps[i].gap<0?[[gaps[i].growth,p.growth]]:[]);
  const exact=gaps.filter(p=>Math.abs(p.gap)<1e-9);
  if(exact.length===1&&!crossings.length){result.comparison.impliedGrowth=exact[0].growth;result.comparison.impliedGrowthStatus='conditional_unique'}
  else if(crossings.length===1&&!exact.length){let [lo,hi]=crossings[0];let lowGap=project(f,{...a,growth:lo},true).perShare-quote.price;
   for(let i=0;i<50;i++){const mid=(lo+hi)/2,gap=project(f,{...a,growth:mid},true).perShare-quote.price;if(gap*lowGap<=0)hi=mid;else{lo=mid;lowGap=gap}}
   result.comparison.impliedGrowth=(lo+hi)/2;result.comparison.impliedGrowthStatus='conditional_unique';
  }
 }
 return result;
}
export function portfolioImpact(portfolio,valuation,quote,at){
 const out={status:portfolio?.status==='available'?'empty':'unavailable',quantity:null,recordedWeight:null,baseDeltaUsd:null,scenarioDeltas:[],conditionDeltas:[],coverage:{priced:0,total:0},warnings:[]};
 if(portfolio?.status!=='available')return out;
 const rows=portfolio.holdings||[];if(!rows.length)return out;
 const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
 const valid=r=>r.currency==='USD'&&fresh(r.updated_at,at,14)&&numeric(r.quantity)!==null&&numeric(r.quantity)>=0&&numeric(r.market_value_usd)!==null&&numeric(r.market_value_usd)>=0;
 const positions=rows.filter(r=>r.ticker===valuation.ticker);out.status=positions.length?'linked':'not_held';
 out.coverage={priced:rows.filter(valid).length,total:rows.length};
 if(out.coverage.priced!==rows.length)out.warnings.push('PORTFOLIO_INCOMPLETE_OR_STALE');
 if(!positions.length)return out;
 if(!positions.every(r=>valid(r)&&['stock','equity','stocks'].includes(String(r.asset_type).toLowerCase()))){out.warnings.push('POSITION_UNRESOLVED');return out}
 out.quantity=positions.reduce((s,r)=>s+Number(r.quantity),0);
 out.recordedAt=positions.map(r=>r.updated_at).sort()[0];
 const total=rows.reduce((s,r)=>s+(numeric(r.market_value_usd)||0),0),positionValue=positions.reduce((s,r)=>s+Number(r.market_value_usd),0);
 if(out.coverage.priced===rows.length&&total>0)out.recordedWeight=positionValue/total;
 if(!valuation.comparison){out.warnings.push('VALUATION_COMPARISON_UNRESOLVED');return out}
 out.baseDeltaUsd=out.quantity*(valuation.base.perShare-quote.price);
 out.scenarioDeltas=valuation.scenarios.map(s=>({id:s.id,deltaUsd:out.quantity*(s.perShare-quote.price)}));
 out.conditionDeltas=(valuation.priceConditions?.items||[]).filter(x=>x.adverseStep).map(x=>({parameter:x.parameter,parameterDelta:x.adverseStep.parameterDelta,deltaUsd:out.quantity*x.adverseStep.perShareDelta}));
 out.warnings.push('SINGLE_POSITION_STRESS_NOT_PORTFOLIO_FORECAST');return out;
}

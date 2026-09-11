import 'server-only';
import {hash} from '../research/filing-engine.mjs';
import {getNeonSql} from './data/neon.js';

// Source data stays separate from assumptions. Only facts in the pinned dossier's
// actual accessions are admitted; retrieval today does not create a PIT backtest.
export function normalizeThesisFinancials(raw,submissions,dossier,sourceHash,retrievedAt){
 if(Number(raw.cik)!==Number(dossier.cik)||Number(submissions.cik)!==Number(dossier.cik))throw Error('IDENTITY_MISMATCH');
 const sources=new Map(dossier.sources.filter(s=>Date.parse(s.acceptedAt)<=Date.parse(dossier.asOf)).map(s=>[s.accession,s]));
 const gaap=raw.facts?.['us-gaap']||{};
 function pick(concepts,{unit='USD',annual=false,namespace=gaap}={}){
  const all=concepts.flatMap((concept,priority)=>(namespace[concept]?.units?.[unit]||[]).filter(r=>{
   const duration=(Date.parse(r.end)-Date.parse(r.start))/86400000;
   return sources.has(r.accn)&&typeof r.val==='number'&&Number.isFinite(r.val)&&Date.parse(r.end)<=Date.parse(sources.get(r.accn).acceptedAt)
    &&(!annual||(/^10-K(?:\/A)?$/.test(r.form)&&duration>=330&&duration<=380));
  }).map(r=>({...r,concept,priority})));
  all.sort((a,b)=>b.end.localeCompare(a.end)||sources.get(b.accn).acceptedAt.localeCompare(sources.get(a.accn).acceptedAt)||a.priority-b.priority);
  const r=all[0];if(!r)return null;
  const same=all.filter(x=>x.end===r.end&&x.start===r.start&&x.accn===r.accn&&x.concept===r.concept);
  if(new Set(same.map(x=>x.val)).size!==1)return null;
  const s=sources.get(r.accn);
  return {value:r.val,unit,start:r.start||null,end:r.end,availableAt:s.acceptedAt,accession:r.accn,concepts:[r.concept],url:s.url,sourceHash,filingHash:s.sha256};
 }
 const revenue=pick(['RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','Revenues','SalesRevenueNet'],{annual:true});
 const ebit=pick(['OperatingIncomeLoss'],{annual:true});
 const cash=pick(['CashAndCashEquivalentsAtCarryingValue']);
 const current=pick(['DebtCurrent']),long=pick(['LongTermDebtNoncurrent']);
 const short=pick(['ShortTermBorrowings']);
 const parts=current?[current,long]:[pick(['LongTermDebtCurrent']),long,...(short?[short]:[])];
 const debt=parts.every(Boolean)&&parts.every(p=>p.end===parts[0].end&&p.accession===parts[0].accession&&p.value>=0)
  ?{...parts[0],value:parts.reduce((sum,p)=>sum+p.value,0),concepts:parts.flatMap(p=>p.concepts),scope:'identified_components_not_total',missingComponents:!current&&!short?['short_term_borrowings']:[]}:null;
 const shares=pick(['WeightedAverageNumberOfDilutedSharesOutstanding'],{annual:true,unit:'shares'});
 const currentShares=pick(['EntityCommonStockSharesOutstanding'],{unit:'shares',namespace:raw.facts?.dei||{}});
 const sic=Number(submissions.sic),forms=dossier.sources.map(s=>s.form);
 const singleClass=Array.isArray(submissions.tickers)&&submissions.tickers.length===1&&submissions.tickers[0]===dossier.ticker&&forms.some(f=>/^10-K/.test(f));
 return {ticker:dossier.ticker,cik:dossier.cik,asOf:dossier.asOf,retrievedAt,currency:'USD',
  identity:{singleClass,supportedBusiness:Number.isInteger(sic)&&sic>0&&!(sic>=6000&&sic<=6999)&&forms.some(f=>/^10-K/.test(f)),sic:submissions.sic,tickers:submissions.tickers||[]},
  facts:{revenue,ebit,cash,debt,shares,currentShares},warnings:['DEBT_COMPONENTS_REQUIRE_LEASE_AND_CLAIMS_REVIEW','LIVE_COMPANY_METADATA_NOT_HISTORICAL'],sourceHash};
}
export function parseThesisQuote(raw,ticker){
 const m=raw?.chart?.result?.[0]?.meta;
 if(!m||m.symbol!==ticker||typeof m.regularMarketPrice!=='number'||!Number.isFinite(m.regularMarketPrice)||m.regularMarketPrice<=0)throw Error('QUOTE_IDENTITY');
 return {ticker,price:m.regularMarketPrice,currency:m.currency||null,
  asOf:Number.isFinite(m.regularMarketTime)?new Date(m.regularMarketTime*1000).toISOString():null,
  shares:Number.isFinite(m.sharesOutstanding)?m.sharesOutstanding:Number.isFinite(m.marketCap)?m.marketCap/m.regularMarketPrice:null,
  instrumentType:m.instrumentType||null,source:'market_chart',url:`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`,sourceHash:hash(raw)};
}
export function createFinancialLoader({fetcher=fetch,clock=()=>new Date()}={}){
 const cache=new Map(),pending=new Map();
 async function get(url,limit=25000000){
  const response=await fetcher(url,{headers:{'User-Agent':'BLS-Prime-Research/1.0 tbasaure@uc.cl'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('FINANCIAL_SOURCE_UNAVAILABLE');
  const chunks=[];let size=0;
  for await(const part of response.body){size+=part.length;if(size>limit)throw Error('FINANCIAL_SOURCE_TOO_LARGE');chunks.push(part)}
  return Buffer.concat(chunks);
 }
 async function load(dossier){
  const cik=Number(dossier.cik);if(!Number.isSafeInteger(cik)||cik<1)throw Error('IDENTITY_MISMATCH');
  const padded=String(cik).padStart(10,'0'),retrievedAt=clock().toISOString();
  const bytes=await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`);
  await new Promise(r=>setTimeout(r,400));
  const metaBytes=await get(`https://data.sec.gov/submissions/CIK${padded}.json`,5000000);
  const financial=normalizeThesisFinancials(JSON.parse(bytes.toString()),JSON.parse(metaBytes.toString()),dossier,hash(bytes),retrievedAt);
  financial.metadataHash=hash(metaBytes);let quote=null;
  try{quote=parseThesisQuote(JSON.parse((await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(dossier.ticker)}?range=5d&interval=1d`,1000000)).toString()),dossier.ticker)}catch{ /* No quote is preferable to an undated substitute. */ }
  // A provider quote's shares are preferred. Filing shares remain a dated cross-check,
  // not a fabricated current share count or silent split adjustment.
  if(quote&&!quote.shares){
   const apiKey=process.env.FMP_API_KEY||process.env.FINANCIAL_MODELING_PREP_API_KEY;
   if(apiKey)try{
    const url=new URL('https://financialmodelingprep.com/stable/quote');url.searchParams.set('symbol',dossier.ticker);url.searchParams.set('apikey',apiKey);
    const rows=JSON.parse((await get(url,1000000)).toString()),q=rows?.[0];
    if(q?.symbol===dossier.ticker&&Number.isFinite(q.marketCap)&&q.marketCap>0&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(q.timestamp)
     &&Math.abs(clock().getTime()/1000-q.timestamp)<4*86400&&q.timestamp<=clock().getTime()/1000){
     quote.shares=q.marketCap/q.price;quote.sharesSource='market_cap_divided_by_price';quote.sharesAsOf=new Date(q.timestamp*1000).toISOString();
     quote.sharesSourceHash=hash(rows);
    }
   }catch{ /* Keep current-share reconciliation unresolved. Never log a keyed URL. */ }
  }
  return {financial,quote};
 }
 return async dossier=>{
  const key=hash(dossier),cached=cache.get(key);
  if(cached&&clock().getTime()-cached.at<300000)return structuredClone(cached.data);
  if(pending.has(key))return structuredClone(await pending.get(key));
  if(pending.size>=2)throw Error('FINANCIAL_SOURCE_BUSY');
  const promise=load(dossier);pending.set(key,promise);
  try{const data=await promise;if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(key,{at:clock().getTime(),data});return structuredClone(data)}finally{pending.delete(key)}
 };
}
export async function readOwnedPortfolio(owner,workspace,{getSql=getNeonSql}={}){
 if(!owner||!workspace)throw Error('AUTH_REQUIRED');
 const rows=await getSql().query(`SELECT p.ticker,p.asset_type,p.quantity,p.currency,p.current_price_usd,p.market_value_usd,p.updated_at
  FROM bls_portfolio_positions p JOIN bls_workspaces w ON w.id=p.workspace_id
  WHERE p.workspace_id = $1 AND w.owner_user_id = $2 ORDER BY p.ticker`,[workspace,owner]);
 return {status:'available',holdings:rows};
}

import 'server-only';
import {cleanTicker} from '../research/dossier.js';
import {normalizeCompanyFinancials} from '../research/company-financials.mjs';
export function createCompanyFinancialService({fetcher=fetch,clock=()=>new Date()}={}) {
 const cache=new Map(),pending=new Map();let directory=null,directoryAt=0,directoryPending=null;
 async function json(url,signal,limit=30000000){
  let r;
  for(let attempt=0;attempt<2;attempt++){
   try{r=await fetcher(url,{headers:{'User-Agent':'BLS-Prime-Research/1.0 tbasaure@uc.cl'},signal,redirect:'error',cache:'no-store'});}
   catch(error){if(attempt||signal.aborted)throw error;await new Promise(resolve=>setTimeout(resolve,800));continue;}
   if(attempt||![429,500,502,503,504].includes(r.status))break;
   const retry=Number(r.headers.get('retry-after')||1);if(!Number.isFinite(retry)||retry>5)break;
   await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,Math.max(800,retry*1000)));
  }
  if(!r.ok)throw Error('FINANCIAL_SOURCE_UNAVAILABLE');
  const parts=[];let bytes=0;for await(const part of r.body){bytes+=part.length;if(bytes>limit)throw Error('FINANCIAL_SOURCE_TOO_LARGE');parts.push(part)}
  return JSON.parse(Buffer.concat(parts).toString());
 }
 async function load(ticker){
  const signal=AbortSignal.timeout(45000);
  if(!directory||clock().getTime()-directoryAt>86400000){
   if(!directoryPending)directoryPending=json('https://www.sec.gov/files/company_tickers.json',signal,5000000).then(data=>{directory=data;directoryAt=clock().getTime();return data}).finally(()=>{directoryPending=null});
   await directoryPending;
  }
  const issuer=Object.values(directory).find(r=>r.ticker.replaceAll('-','.')===ticker.replaceAll('-','.'));
  if(!issuer)throw Error('NO_ISSUER');
  const cik=Number(issuer.cik_str);if(!Number.isSafeInteger(cik)||cik<1)throw Error('INVALID_CIK');
  const raw=await json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10,'0')}.json`,signal);
  if(Number(raw.cik)!==cik)throw Error('IDENTITY_MISMATCH');
  return normalizeCompanyFinancials(raw,ticker,clock().toISOString());
 }
 return async raw=>{
  const ticker=cleanTicker(raw);if(!ticker)throw Error('INVALID_TICKER');
  const hit=cache.get(ticker);if(hit&&clock().getTime()-hit.at<3600000)return hit.value;
  if(pending.has(ticker))return pending.get(ticker);
  if(pending.size>=3)throw Error('BUSY');
  const promise=load(ticker);pending.set(ticker,promise);
  try{const value=await promise;if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(ticker,{at:clock().getTime(),value});return value}finally{pending.delete(ticker)}
 };
}
export const loadCompanyFinancials=createCompanyFinancialService();

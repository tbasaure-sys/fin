import 'server-only';
// Resolve public issuer names once per instance, without loading financial statements.
export function createJevCompanyDirectory({fetcher=fetch,clock=()=>Date.now()}={}) {
 let names=new Map(),until=0,pending=null;
 return async()=>{
  if(clock()<until)return names;
  if(pending)return pending;
  pending=(async()=>{
   try{
    const response=await fetcher('https://www.sec.gov/files/company_tickers.json',{headers:{'User-Agent':'BLS-Prime-Research/1.0 tbasaure@uc.cl'},signal:AbortSignal.timeout(7000),redirect:'error',cache:'no-store'});
    if(!response.ok){await response.body?.cancel();throw Error()}
    const parts=[];let size=0;for await(const part of response.body){size+=part.length;if(size>5000000)throw Error();parts.push(part)}
    const raw=JSON.parse(Buffer.concat(parts).toString('utf8'));
    const next=new Map(Object.values(raw).filter(r=>typeof r.ticker==='string'&&typeof r.title==='string').map(r=>[r.ticker.replaceAll('-','.'),r.title.slice(0,200)]));
    if(!next.size)throw Error();names=next;until=clock()+86400000;
   }catch{until=clock()+60000}
   return names;
  })();
  try{return await pending}finally{pending=null}
 };
}
export const jevCompanyDirectory=createJevCompanyDirectory();

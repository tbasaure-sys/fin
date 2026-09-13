// Poll only a server-confirmed in-flight report, never retry a failed generation blindly.
const pendingWait=(ms,signal)=>new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const cancel=()=>{clearTimeout(timer);reject(signal.reason)};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve()},ms);
  signal?.addEventListener('abort',cancel,{once:true});
});
export async function requestAnalysis(payload,{signal,fetcher=fetch,wait=pendingWait}={}){
  let persisted=false;
  try{
  for(let poll=0;poll<22;poll++){
    signal?.throwIfAborted();
    const response=await fetcher('/api/public/research/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
    const body=await response.json();
    if(response.status===401)throw Error('AUTH_REQUIRED');
    if(response.status===202&&body.pending===true){
      persisted=body.resumable===true||persisted;
      const seconds=Number(response.headers.get('retry-after'))||body.retryAfterSeconds;
      await wait(Number.isFinite(seconds)&&seconds>0?Math.min(60000,Math.max(1000,seconds*1000)):3000,signal);continue;
    }
    if(!response.ok)throw Object.assign(Error(body.error||'PROVIDER_UNAVAILABLE'),{
      reference:typeof body.reference==='string'&&/^[a-f0-9-]{36}$/.test(body.reference)?body.reference:null,
      retryAfterSeconds:Number(response.headers.get('retry-after'))||null,
    });
    if(body.analysis?.status!=='draft'||!Array.isArray(body.analysis.sections))throw Error('INVALID_ANALYSIS');
    return body;
  }
  throw Error('REPORT_PENDING');
  }catch(error){
    if(persisted&&signal?.aborted)throw Error('REPORT_PENDING');
    throw error;
  }
}

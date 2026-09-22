// Poll only a server-confirmed in-flight report, never retry a failed generation blindly.
export async function requestAnalysis(payload,{signal,fetcher=fetch,endpoint='/api/public/research/analyze',wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  for(let poll=0;poll<22;poll++){
    signal?.throwIfAborted();
    const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
    const body=await response.json();
    if(response.status===401)throw Error('AUTH_REQUIRED');
    if(response.status===202&&body.pending===true){
      await wait(3000);continue;
    }
    if(!response.ok)throw Object.assign(Error(body.error||'PROVIDER_UNAVAILABLE'),{
      reference:typeof body.reference==='string'&&/^[a-f0-9-]{36}$/.test(body.reference)?body.reference:null,
      retryAfterSeconds:Number(response.headers.get('retry-after'))||null,
    });
    if(body.analysis?.status!=='draft'||!Array.isArray(body.analysis.sections))throw Error('INVALID_ANALYSIS');
    return body;
  }
  throw Error('REPORT_PENDING');
}

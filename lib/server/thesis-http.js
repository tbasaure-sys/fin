import 'server-only';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export function createThesisHttp({authenticate,service}) {
  return async request=>{
    const session=await authenticate(request);
    if(session instanceof Response)return session;
    try{
      if(request.method==='GET'){
        const ticker=new URL(request.url).searchParams.get('ticker')?.trim().toUpperCase();
        if(!ticker||!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker))return json({error:'INVALID_TICKER'},400);
        return json({revisions:await service.list(session.user.id,ticker),historyLimit:100});
      }
      const url=new URL(request.url),host=request.headers.get('host');
      const publicOrigin=host?`${url.protocol}//${host}`:url.origin;
      if(request.headers.get('origin')!==publicOrigin)return json({error:'ORIGIN_REJECTED'},403);
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'INVALID_THESIS'},400);
      let body;
      try{
        const reader=request.body?.getReader();if(!reader)throw Error();
        let size=0;const parts=[];
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>140000){await reader.cancel();return json({error:'REQUEST_TOO_LARGE'},413)}parts.push(Buffer.from(value))}
        body=JSON.parse(Buffer.concat(parts).toString());
      }catch{return json({error:'INVALID_THESIS'},400)}
      return json({revision:await service.save(session.user.id,body)});
    }catch(error){
      const conflict=['REVISION_CONFLICT','DOSSIER_EXPIRED'];
      const invalid=['INVALID_THESIS','INVALID_EVIDENCE','FUTURE_SOURCE','IDENTITY_MISMATCH','PARENT_NOT_FOUND'];
      if(conflict.includes(error.message))return json({error:error.message},409);
      if(invalid.includes(error.message))return json({error:error.message},400);
      // Never log private thesis prose or credentials on a storage failure.
      console.error('[thesis] storage operation failed');
      return json({error:'THESIS_STORAGE_UNAVAILABLE'},503);
    }
  };
}

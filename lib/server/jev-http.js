import 'server-only';
import { newsPairs, reviewPriority } from '../research/jev.mjs';
import { hash } from '../research/filing-engine.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const symbol=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(s);
export function createJevHttp({authenticate,service,market,store,verify,readPortfolio,consume=async()=>({allowed:true})}) {
  return async function handler(request) {
    const session=await authenticate(request);
    if(session instanceof Response){session.headers.set('Cache-Control','private, no-store');return session}
    if(request.method==='GET')return json({status:service.configured()?'ready':'not_configured'});
    const url=new URL(request.url),host=request.headers.get('host');
    if(request.headers.get('origin')!==(host?`${url.protocol}//${host}`:url.origin))return json({error:'ORIGIN_REJECTED'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'INVALID_REQUEST'},400);
    try {
      const reader=request.body?.getReader();if(!reader)return json({error:'INVALID_REQUEST'},400);
      let size=0;const parts=[];
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>200000){await reader.cancel();return json({error:'REQUEST_TOO_LARGE'},413)}parts.push(Buffer.from(value))}
      let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{return json({error:'INVALID_REQUEST'},400)}
      if(!['news','documents','thesis'].includes(body?.kind))return json({error:'INVALID_REQUEST'},400);
      const quota=await consume({request,scope:'research-jev',limit:12,windowMs:300000});
      if(!quota.allowed)return json({error:'BUSY'},429);
      if(!service.configured())return json({status:'not_configured',items:[]});
      let items=[],total=0,context={};
      if(body.kind==='news') {
        let feed;
        if(body.scope==='portfolio') {
          if(!session.user?.id||!session.workspace?.id)return json({error:'AUTH_REQUIRED'},401);
          const owned=await readPortfolio(session.user.id,session.workspace.id);
          if(owned.status!=='available'||!Array.isArray(owned.holdings))throw Error('PORTFOLIO_UNAVAILABLE');
          feed=await market.portfolio(owned.holdings);
        }else if(body.scope==='watchlist') {
          if(!Array.isArray(body.tickers)||body.tickers.length>40||!body.tickers.every(symbol))return json({error:'INVALID_REQUEST'},400);
          feed=await market.watchlist(body.tickers);
        }else if(body.scope==='stock'&&symbol(body.ticker))feed=await market.news(body.ticker);
        else if(body.scope==='market')feed=await market.news(null);
        else return json({error:'INVALID_REQUEST'},400);
        ({items,total}=newsPairs(feed,body.scope));
        context={scope:body.scope,feedStatus:feed.status,coverage:feed.coverage||null,universe:feed.universe||null};
      }else if(body.kind==='documents') {
        if(typeof body.question!=='string'||!body.question.trim()||body.question.length>600)return json({error:'INVALID_REQUEST'},400);
        if(!verify(body.dossier,body.ticket))return json({error:'DOSSIER_EXPIRED'},409);
        const dossier=body.dossier;
        const chunks=[...new Map(dossier.sections.flatMap(s=>s.extracts).map(e=>[e.id,e])).values()];
        total=chunks.length;
        items=chunks.slice(0,24).map(e=>({id:e.id,ticker:dossier.ticker,question:body.question.trim(),text:e.text.slice(0,2500),truncated:e.text.length>2500,url:dossier.sources.find(s=>s.id===e.id.split(':')[0])?.url||null}));
        context={question:body.question.trim(),documentAsOf:dossier.asOf};
      }else {
        if(typeof body.revisionHash!=='string'||! /^[a-f0-9]{64}$/.test(body.revisionHash))return json({error:'INVALID_REQUEST'},400);
        const record=await store.findHash(session.user.id,body.revisionHash);
        if(!record)return json({error:'REVISION_NOT_FOUND'},404);
        const {hash:checksum,...content}=record;
        if(hash(content)!==checksum||hash(record.dossier)!==record.evidenceHash)throw Error('CORRUPT_REVISION');
        const chunks=new Map(record.dossier.sections.flatMap(s=>s.extracts).map(e=>[e.id,e]));
        items=record.thesis.nodes.filter(n=>n.statement.trim()).map(n=>({id:n.id,ticker:record.dossier.ticker,statement:n.statement,question:n.question,test:n.test,ifYes:n.ifYes,ifNo:n.ifNo,evidence:n.evidence.slice(0,8).map(e=>({id:e.chunkId,text:(chunks.get(e.chunkId)?.text||'').slice(0,2000)})),evidenceTotal:n.evidence.length}));
        total=items.length;context={revisionHash:record.hash,documentAsOf:record.dossier.asOf};
      }
      // Never send portfolio amounts, weights, user IDs or source URLs to TypeSafe.
      const stateItems=items.map(({weight,url,publisher,...rest})=>({...rest,id:undefined}));
      stateItems.forEach((item,i)=>{item.id=String(i)});
      const result=await service.evaluate(body.kind,stateItems);
      return json({...result,kind:body.kind,context,total,selected:items.length,assessed:result.items.filter(r=>r.status==='available').length,items:result.items.map((r,i)=>({...items[i],...r,id:items[i].id,priority:body.kind==='news'?reviewPriority(items[i],r.answers):null}))});
    }catch{return json({error:'ASSESSMENT_UNAVAILABLE'},503)}
  };
}

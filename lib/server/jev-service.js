import 'server-only';
import { createHash } from 'node:crypto';
import { JEV_RUBRIC, questionsFor, validateJevAnswer } from '../research/jev.mjs';

export function createJevService({fetcher=fetch,env=process.env,clock=()=>Date.now()}={}) {
  const cache=new Map(),pending=new Map();let active=0;
  const configured=()=>Boolean(env.TYPESAFE_API_KEY?.trim());
  async function batch(kind,items,cacheable) {
    const model=env.TYPESAFE_MODEL||'jev-1.13.0';
    const key=createHash('sha256').update(JSON.stringify([JEV_RUBRIC,model,kind,items])).digest('hex');
    const hit=cacheable&&cache.get(key);if(hit&&hit.until>clock())return hit.result;
    if(cacheable&&pending.has(key))return pending.get(key);
    if(active>=12)return {status:'busy'};
    const run=(async()=>{
      active++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
      try {
        const questions={};items.forEach((_,i)=>Object.entries(questionsFor(kind,i)).forEach(([name,q])=>{questions[`i${i}_${name}`]=q}));
        const response=await fetcher('https://api.typesafe.ai/v1/systemone',{method:'POST',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${env.TYPESAFE_API_KEY.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({model,state:{items},questions})});
        if(!response.ok){await response.body?.cancel();return {status:response.status===401||response.status===403?'authentication_failed':response.status===429?'rate_limited':'unavailable'}}
        const reader=response.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000){await reader.cancel();throw Error()}parts.push(Buffer.from(value))}
        const raw=JSON.parse(Buffer.concat(parts).toString('utf8'));
        if(typeof raw.model!=='string'||!/^jev-[a-zA-Z0-9.-]{1,50}$/.test(raw.model))throw Error();
        const results=items.map((_,i)=>Object.fromEntries(Object.entries(questionsFor(kind,i)).map(([name,q])=>[name,validateJevAnswer(raw.answers?.[`i${i}_${name}`],q)])));
        const result={status:'available',model:raw.model,results};
        if(cacheable){if(cache.size>=400)cache.delete(cache.keys().next().value);cache.set(key,{until:clock()+3600000,result})}
        return result;
      }catch{return {status:'unavailable'}}finally{clearTimeout(timer);active--}
    })();
    if(cacheable)pending.set(key,run);
    try{return await run}finally{if(cacheable)pending.delete(key)}
  }
  async function evaluate(kind,items) {
    if(!configured())return {status:'not_configured',rubric:JEV_RUBRIC,items:[]};
    if(!items.length)return {status:'empty',rubric:JEV_RUBRIC,items:[]};
    if(!['news','documents','thesis','investment_thesis'].includes(kind)||items.length>60)throw Error('INVALID_REQUEST');
    // Thesis items can include eight excerpts plus five user-written fields.
    // Smaller batches keep fully populated revisions inside the context window.
    const batchSize=['thesis','investment_thesis'].includes(kind)?2:10;
    const groups=[];for(let i=0;i<items.length;i+=batchSize)groups.push(items.slice(i,i+batchSize));
    const results=new Array(groups.length);let index=0;
    await Promise.all(Array.from({length:Math.min(3,groups.length)},async()=>{while(index<groups.length){const i=index++;results[i]=await batch(kind,groups[i],kind==='news')}}));
    const output=groups.flatMap((group,i)=>group.map((item,j)=>({id:item.id,status:results[i].status,model:results[i].model,answers:results[i].results?.[j]||null})));
    const available=output.filter(r=>r.status==='available').length;
    return {status:available===output.length?'available':available?'partial':output[0].status,rubric:JEV_RUBRIC,asOf:new Date(clock()).toISOString(),items:output};
  }
  return {configured,evaluate};
}
export const jevService=createJevService();

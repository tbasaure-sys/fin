import 'server-only';
import {verifyDossier,analysisSecret} from './filing-analysis.js';
import {hash} from '../research/filing-engine.mjs';
import {financialReading} from '../research/financial-reading.mjs';
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',...headers}});
export function createFinancialReadingHandler({authenticate,load,consume,secret=analysisSecret}){
 return async request=>{
  const session=await authenticate(request);if(session instanceof Response)return session;
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'ORIGIN_REJECTED'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'INVALID_REQUEST'},400);
  let body;
  try{
   const reader=request.body?.getReader();if(!reader)throw Error();const chunks=[];let bytes=0;
   while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;
    if(bytes>90000){await reader.cancel();return json({error:'REQUEST_TOO_LARGE'},413)}chunks.push(Buffer.from(value));}
   body=JSON.parse(Buffer.concat(chunks).toString());
  }catch{return json({error:'INVALID_REQUEST'},400)}
  if(!body||Array.isArray(body)||Object.keys(body).sort().join()!=='dossier,ticket'||!body.dossier||typeof body.dossier!=='object'
   ||Array.isArray(body.dossier)||typeof body.ticket!=='string')return json({error:'INVALID_REQUEST'},400);
  if(!secret())return json({error:'FINANCIAL_SOURCE_UNAVAILABLE'},503);
  if(!verifyDossier(body.dossier,body.ticket,secret()))return json({error:'DOSSIER_EXPIRED'},409);
  try{
   const admission=await consume({request,scope:'document-financial-reading-v1',limit:6,windowMs:60000});
   if(!admission.allowed)return json({error:'BUSY'},429,{'Retry-After':String(admission.retryAfterSeconds||60)});
   const {financial}=await load(body.dossier);
   return json({reading:financialReading(financial),dossierHash:hash(body.dossier),packetHash:body.dossier.packetHash});
  }catch{return json({error:'FINANCIAL_SOURCE_UNAVAILABLE'},503)}
 };
}

// Opt-in experiment, one isolated claim and at most one network call per run.
// Never publishes reports, changes production models or sends labels to inference.
import {readFile,writeFile,mkdir,rename,open,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {hash} from '../lib/research/filing-engine.mjs';
import {prepareClaimReview,resolveClaimReview} from '../lib/research/claim-local-review.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const files=['scripts/claim-review-trial.mjs','lib/research/claim-local-review.mjs','lib/research/reference-review.mjs','lib/research/filing-engine.mjs','package.json','package-lock.json'];
const identity=async()=>({node:process.version,files:Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(join(ROOT,f)))])))});
const envelope=r=>({...r,checksum:hash(r)});
const write=(path,r)=>writeFile(path,JSON.stringify(envelope(r),null,2),{flag:'wx'});
async function checked(path){const {checksum,...r}=JSON.parse(await readFile(path,'utf8'));if(hash(r)!==checksum)throw Error('TRIAL_ARTIFACT_CHANGED');return r}
async function save(directory,state){const temp=join(directory,`state-${randomUUID()}.tmp`);await write(temp,state);await rename(temp,join(directory,'state.json'))}
export async function prepareTrial({directory,dossier,cases,notBefore}){
 if(!Array.isArray(cases)||!cases.length||cases.length>20||!Number.isFinite(notBefore)||notBefore<0
  ||new Set(cases.map(c=>c.id)).size!==cases.length||cases.some(c=>!c.id||![true,false,null].includes(c.expected)))throw Error('INVALID_TRIAL');
 const jobs=cases.map(c=>{
  const packet=prepareClaimReview([{id:'claim',text:c.text,chunkIds:c.chunkIds}],dossier);
  const requiredSupport=c.requiredSupport??[];
  const sourceTexts=Object.values(packet.bindings.c0.links).map(s=>s.text);
  if(!Array.isArray(requiredSupport)||c.expected===true&&!requiredSupport.length
   ||requiredSupport.some(s=>typeof s!=='string'||!s.trim()||!sourceTexts.some(t=>t.includes(s))))throw Error('INVALID_SUPPORT_EXPECTATIONS');
  const request={model:'openai/gpt-oss-120b',messages:packet.messages,temperature:.2,reasoning_effort:'low',max_completion_tokens:1200,
   response_format:{type:'json_schema',json_schema:{name:'claim_scope_review',strict:true,schema:packet.schema}}};
  return {caseId:c.id,expected:c.expected,requiredSupport,packet,request,requestHash:hash(request)};
 });
 const manifest={version:'claim-review-trial-v1',purpose:'Agent-adjudicated development controls; no automatic production promotion or quality certification',
  identity:await identity(),dossierHash:hash(dossier),sourceManifests:dossier.sources??[],sourcePackets:dossier.packets??[],
  createdAt:new Date().toISOString(),notBefore,maxCalls:jobs.length+2,jobs,qualityCertified:false};
 await mkdir(directory);await write(join(directory,'manifest.json'),manifest);
 await save(directory,{manifestHash:hash(manifest),status:'prepared',notBefore,next:0,calls:0,inFlight:null,results:[],qualityCertified:false});
 return manifest;
}
function summarize(results,total){
 const scored=results.filter(r=>r.expected!==null),unresolvedResponses=results.filter(r=>r.error).length;
 const falseApprovals=scored.filter(r=>r.expected===false&&r.review?.accepted===true).length;
 const missedSupported=scored.filter(r=>r.expected===true&&r.review?.accepted!==true).length;
 const modelFalseApprovals=scored.filter(r=>r.expected===false&&r.review?.modelEntailed===true).length;
 const supportFailures=scored.filter(r=>r.expected===true&&r.review?.accepted===true&&!r.supportCoverage).length;
 return {cases:results.length,total,scored:scored.length,falseApprovals,modelFalseApprovals,missedSupported,supportFailures,unresolvedResponses,
  passed:results.length===total&&scored.length>0&&falseApprovals+modelFalseApprovals+missedSupported+supportFailures+unresolvedResponses===0,qualityCertified:false};
}
function acceptResponse(state,record,manifest){
 state.inFlight=null;
 if(record.http===429){
  const seconds=Number(record.retryAfter);
  if(Number.isFinite(seconds)&&seconds>0){state.status='cooldown';state.notBefore=record.receivedAt+seconds*1000}
  else state.status='provider_failed';
  return;
 }
 if(record.http!==200){state.status='provider_failed';return}
 const job=manifest.jobs[state.next];let review=null,error=null;
 try{if(record.finishReason!=='stop')throw Error('INCOMPLETE_RESPONSE');review=resolveClaimReview(JSON.parse(record.content),job.packet)[0]}
 catch{error='INVALID_REVIEW_RESPONSE'}
 const supportCoverage=job.expected!==true?null:job.requiredSupport.every(s=>(review?.support||[]).some(r=>r.quote.includes(s)));
 state.results.push({caseId:job.caseId,expected:job.expected,requestHash:job.requestHash,review,supportCoverage,error,usage:record.usage});
 state.next++;state.status=state.next===manifest.jobs.length?'finished':'ready_for_next';state.summary=summarize(state.results,manifest.jobs.length);
}
export async function runTrial({directory,live=false,apiKey=process.env.GROQ_API_KEY,fetcher=fetch,now=Date.now}){
 const manifest=await checked(join(directory,'manifest.json'));
 if(hash(manifest.identity)!==hash(await identity()))throw Error('TRIAL_CODE_CHANGED');
 let state=await checked(join(directory,'state.json'));
 if(state.manifestHash!==hash(manifest))throw Error('TRIAL_MANIFEST_CHANGED');
 if(['finished','provider_failed','budget_exhausted'].includes(state.status)||!live)return state;
 if(now()<state.notBefore)return {...state,status:'waiting'};
 if(!apiKey?.trim())throw Error('PROVIDER_UNAVAILABLE');
 const lock=await open(join(directory,'writer.lock'),'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));
 try{
  // Re-read under the writer lock; another completed invocation may have advanced.
  state=await checked(join(directory,'state.json'));
  if(state.manifestHash!==hash(manifest))throw Error('TRIAL_MANIFEST_CHANGED');
  if(['finished','provider_failed','budget_exhausted'].includes(state.status))return state;
  if(now()<state.notBefore)return {...state,status:'waiting'};
  if(state.inFlight){
   let response;try{response=await checked(join(directory,`response-${state.inFlight}.json`))}catch(e){if(e.code==='ENOENT')throw Error('UNRESOLVED_PROVIDER_CALL');throw e}
   acceptResponse(state,response,manifest);await save(directory,state);return state;
  }
  if(state.calls>=manifest.maxCalls){state.status='budget_exhausted';await save(directory,state);return state}
  const job=manifest.jobs[state.next];if(hash(job.request)!==job.requestHash)throw Error('TRIAL_REQUEST_CHANGED');
  const id=++state.calls;state.inFlight=id;state.status='running';
  await write(join(directory,`request-${id}.json`),{caseId:job.caseId,request:job.request,requestHash:job.requestHash});await save(directory,state);
  let record;
  try{
   const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
    body:JSON.stringify(job.request),signal:AbortSignal.timeout(45000)});
   const raw=await response.json().catch(()=>null);
   record={http:response.status,receivedAt:now(),retryAfter:response.headers.get('retry-after'),content:raw?.choices?.[0]?.message?.content??null,
    finishReason:raw?.choices?.[0]?.finish_reason??null,usage:raw?.usage??null};
  }catch{record={http:null,receivedAt:now(),error:'TRANSPORT_FAILURE'}}
  await write(join(directory,`response-${id}.json`),record);acceptResponse(state,record,manifest);await save(directory,state);return state;
 }finally{await lock.close();await unlink(join(directory,'writer.lock'))}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3),directory=arg('directory');
 if(!directory)throw Error('Use --directory=PATH with --prepare --cases=JSON --not-before=ISO, or --live.');
 if(process.argv.includes('--prepare')){
  const input=JSON.parse(await readFile(arg('cases'),'utf8'));
  const m=await prepareTrial({directory,dossier:input.dossier,cases:input.cases,notBefore:Date.parse(arg('not-before'))});
  console.log(JSON.stringify({status:'prepared',claims:m.jobs.length,maxCalls:m.maxCalls,notBefore:m.notBefore,networkCalls:0}));
 }else{
  const r=await runTrial({directory,live:process.argv.includes('--live')});
  console.log(JSON.stringify({status:r.status,next:r.next,calls:r.calls,notBefore:r.notBefore,summary:r.summary,qualityCertified:false}));
 }
}

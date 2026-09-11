import test from 'node:test';
import assert from 'node:assert/strict';
import {createThesisHttp} from '../lib/server/thesis-http.js';
const url='https://example.com/api/research/theses';
test('authentication precedes private reads or writes, including forged cookies',async()=>{
 let calls=0;
 const api=createThesisHttp({authenticate:async()=>Response.json({error:'auth'},{status:401}),service:{list:()=>{calls++},save:()=>{calls++}}});
 for(const method of ['GET','POST'])assert.equal((await api(new Request(url,{method,headers:{cookie:'forged'}}))).status,401);
 assert.equal(calls,0);
});
test('the authenticated owner cannot be replaced by a submitted owner and cross-origin writes fail',async()=>{
 const owners=[];
 const api=createThesisHttp({authenticate:async()=>({user:{id:'alice'}}),service:{save:async(owner)=>{owners.push(owner);return {revision:1}},list:async(owner)=>{owners.push(owner);return []}}});
 const post=origin=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({owner:'bob'})});
 assert.equal((await api(post('https://evil.com'))).status,403);
 assert.equal((await api(post('https://example.com'))).status,200);
 const response=await api(new Request(url+'?ticker=MSFT&owner=bob'));assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.deepEqual(owners,['alice','alice']);
});
test('malformed, oversized, and stale writes return typed failures without leaking backend details',async()=>{
 const api=createThesisHttp({authenticate:async()=>({user:{id:'alice'}}),service:{save:async()=>{throw Error('REVISION_CONFLICT')}}});
 const request=body=>new Request(url,{method:'POST',headers:{origin:'https://example.com','content-type':'application/json'},body});
 assert.equal((await api(request('{'))).status,400);
 assert.equal((await api(request('x'.repeat(140001)))).status,413);
 const conflict=await api(request('{}'));assert.equal(conflict.status,409);assert.equal((await conflict.json()).error,'REVISION_CONFLICT');
});
test('same-origin writes use the browser Host when Next normalizes the internal request URL',async()=>{
 const api=createThesisHttp({authenticate:async()=>({user:{id:'alice'}}),service:{save:async()=>({revision:1})}});
 const request=new Request('http://localhost:3007/api/research/theses',{method:'POST',headers:{origin:'http://127.0.0.1:3007',host:'127.0.0.1:3007','content-type':'application/json'},body:'{}'});
 assert.equal((await api(request)).status,200);
});

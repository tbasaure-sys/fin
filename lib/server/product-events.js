import 'server-only';
import {createHmac} from 'node:crypto';
import {getNeonSql} from './data/neon.js';
import {validProductEvent} from '../product-events.mjs';
let setup;const admissions=new Map();
export async function recordProductEvent(request){
 const url=new URL(request.url),origin=request.headers.get('origin'),host=request.headers.get('host');
 if(origin!==(host?`${url.protocol}//${host}`:url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return new Response(null,{status:403});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response(null,{status:400});
 let body;
 try{const reader=request.body?.getReader();if(!reader)throw Error();let bytes=0;const parts=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>512){await reader.cancel();return new Response(null,{status:413})}parts.push(Buffer.from(value))}body=JSON.parse(Buffer.concat(parts).toString())}catch{return new Response(null,{status:400})}
 if(!validProductEvent(body))return new Response(null,{status:400});
 const secret=process.env.BLS_PRIME_AUTH_SECRET||process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET;
 if(!secret||!process.env.DATABASE_URL)return new Response(null,{status:503});
 const hash=value=>createHmac('sha256',secret).update(`product-events-v1:${value}`).digest('hex');
 const ipKey=hash(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'unknown');
 const now=Date.now();for(const [key,value] of admissions)if(value.until<now)admissions.delete(key);
 const admission=admissions.get(ipKey)||{count:0,until:now+60000};
 if(admission.count>=30||(!admissions.has(ipKey)&&admissions.size>=1000))return new Response(null,{status:429});
 admission.count++;admissions.set(ipKey,admission);
 try{
  const sql=getNeonSql();
  if(!setup)setup=sql.query(`CREATE TABLE IF NOT EXISTS bls_product_events_v1 (day DATE NOT NULL, visitor TEXT NOT NULL, event TEXT NOT NULL, first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(day,visitor,event))`).catch(e=>{setup=null;throw e});
  await setup;
  await sql.query(`DELETE FROM bls_product_events_v1 WHERE day < (NOW() AT TIME ZONE 'UTC')::date - 30`);
  await sql.query(`INSERT INTO bls_product_events_v1(day,visitor,event) SELECT (NOW() AT TIME ZONE 'UTC')::date,$1,$2 WHERE (SELECT count(*) FROM bls_product_events_v1 WHERE day=(NOW() AT TIME ZONE 'UTC')::date)<10000 ON CONFLICT DO NOTHING`,[hash(body.visitor),body.event]);
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 }catch{return new Response(null,{status:503})}
}

// Explicit database integration check. Removes ONLY the random test visitor.
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {recordProductEvent} from '../lib/server/product-events.js';
if(!process.argv.includes('--allow-test-write'))throw Error('Pass --allow-test-write to create and remove a random verification event');
const visitor=randomUUID(),secret=process.env.BLS_PRIME_AUTH_SECRET||process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET;
if(!secret||!process.env.DATABASE_URL)throw Error('Database and signing configuration required');
const id=createHmac('sha256',secret).update(`product-events-v1:${visitor}`).digest('hex'),sql=neon(process.env.DATABASE_URL);
const request=(body,origin='https://www.blsprime.com')=>new Request('https://www.blsprime.com/api/product-events',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
try{
 const body={event:'visit',visitor,consent:true};
 assert.equal((await recordProductEvent(request({...body,ticker:'MSFT'}))).status,400);
 assert.equal((await recordProductEvent(request(body,'https://other.invalid'))).status,403);
 assert.equal((await recordProductEvent(request({...body,consent:false}))).status,400);
 assert.equal((await recordProductEvent(request(body))).status,204);
 assert.equal((await recordProductEvent(request(body))).status,204);
 const rows=await sql.query('SELECT count(*)::int AS n FROM bls_product_events_v1 WHERE visitor=$1',[id]);assert.equal(rows[0].n,1);
 console.log('PASS: consent, payload allowlist, origin, database persistence and deduplication');
}finally{
 if((await sql.query("SELECT to_regclass('public.bls_product_events_v1') AS name"))[0]?.name){await sql.query('DELETE FROM bls_product_events_v1 WHERE visitor=$1',[id]);console.log('Removed the random verification event; no user events targeted')}
}

// Run with DATABASE_URL supplied securely; output contains aggregates only.
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
const sql=neon(process.env.DATABASE_URL);
const exists=await sql.query("SELECT to_regclass('public.bls_product_events_v1') AS name");
if(!exists[0]?.name){console.log(JSON.stringify({status:'not_instrumented_yet',counts:[]}));process.exit(0)}
const counts=await sql.query(`SELECT event,COUNT(*)::int AS browser_days,COUNT(DISTINCT visitor)::int AS consenting_browsers FROM bls_product_events_v1 WHERE day >= (NOW() AT TIME ZONE 'UTC')::date - 30 GROUP BY event ORDER BY event`);
const returns=await sql.query(`SELECT count(*)::int AS returning_research_browsers FROM (SELECT visitor FROM bls_product_events_v1 WHERE day >= (NOW() AT TIME ZONE 'UTC')::date - 30 AND event IN ('research_loaded','report_generated','thesis_saved','valuation_saved') GROUP BY visitor HAVING COUNT(DISTINCT day)>=2) r`);
console.log(JSON.stringify({windowDays:30,coverage:'opt-in browsers, not verified people; bots and missed events possible; stage counts are not an ordered conversion funnel',counts,...returns[0]},null,2));

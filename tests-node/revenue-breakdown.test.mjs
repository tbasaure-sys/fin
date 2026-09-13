import test from 'node:test';
import assert from 'node:assert/strict';
const concept='us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax';
import {revenueFixture} from './fixtures/revenue-html.mjs';
const source={id:'D1',cik:1,periodEnd:'2026-09-30',acceptedAt:'2026-11-01T00:00:00Z'};
async function build(html=revenueFixture(),s=source){
 const mod=await import('../lib/research/revenue-breakdown.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {}});
 assert.equal(typeof mod.revenueBreakdown,'function','revenue decomposition must be executable');
 return mod.revenueBreakdown(html,s);
}
test('physical-table revenue partition reconciles both periods and exposes contribution to consolidated growth',async()=>{
 const r=await build();assert.equal(r.status,'available');
 const p=r.partitions[0];assert.equal(p.currentTotal.value,120e6);assert.equal(p.priorTotal.value,100e6);
 assert.deepEqual(p.rows.map(r=>[r.label,r.prior.value,r.current.value,r.change]),[['Devices',60e6,70e6,10e6],['Services',40e6,50e6,10e6]]);
 assert.equal(p.rows[1].growthContribution,.1);assert.equal(p.rows[1].currentShare,50/120);
 assert.equal(p.rows[1].current.factId,'Servicesf1');assert.equal(p.sourceId,'D1');
 assert.equal(r.economicCauseVerified,false);
});
test('an overlapping subtotal cannot be removed to manufacture a partition',async()=>{
 const r=await build(revenueFixture({parts:[['Devices',60,70],['Services',40,50],['AllProducts',100,120]]}));
 assert.equal(r.status,'unresolved');assert.equal(r.partitions.length,0);
 assert.ok(r.exclusions.some(x=>x.reason==='DOES_NOT_RECONCILE'));
});
test('unknown, conflicting and unsupported numeric facts are not silently omitted from the sum',async()=>{
 const base=revenueFixture();
 for(const html of [base.replace('>50</ix:nonFraction>','>bad</ix:nonFraction>'),base.replace('id="Servicesf1"','xsi:nil="true" id="Servicesf1"'),base.replace('>50</ix:nonFraction>','>50</ix:nonFraction><ix:nonFraction id="conflict" contextRef="Services1" name="'+concept+'" unitRef="usd" scale="6" decimals="-6">51</ix:nonFraction>')]){
  assert.equal((await build(html)).partitions.length,0);
 }
});
test('wrong issuer, currency, period and custom revenue namespaces cannot masquerade as consolidated USD revenue',async()=>{
 for(const html of [revenueFixture({currency:'EUR'}),revenueFixture().replaceAll('>1</xbrli:identifier>','>2</xbrli:identifier>'),revenueFixture().replaceAll('http://fasb.org/us-gaap/2026','http://fake.test/us-gaap/2026')])
  assert.equal((await build(html)).status,'unresolved');
 assert.equal((await build(revenueFixture(),{...source,periodEnd:'2026-12-31'})).status,'unresolved');
});
test('negative contributions and a flat total do not turn into a probability or undefined share of growth',async()=>{
 const r=await build(revenueFixture({parts:[['Devices',60,50],['Services',40,50]],total:[100,100]}));
 assert.equal(r.partitions[0].rows[0].growthContribution,-.1);
 assert.equal(r.partitions[0].rows[1].growthContribution,.1);
 assert.equal(r.partitions[0].totalGrowth,0);
});
test('scaling is read from the numeric fact, not inferred from a table heading',async()=>{
 const r=await build(revenueFixture().replaceAll('scale="6"','scale="3"').replaceAll('decimals="-6"','decimals="-3"'));
 assert.equal(r.partitions[0].currentTotal.value,120000);
});
test('distinct dimensions stay separate and nested tables cannot imply a disjoint partition',async()=>{
 const r=await build(revenueFixture().replace('<table><tr><td>Devices','<table><tr><td><table><tr><td>Devices').replace('</body>','</td></tr></table></body>'));
 assert.equal(r.partitions.length,0);
});
test('repeated metric row labels are not mistaken for different business names',async()=>{
 const r=await build(revenueFixture().replace('<td>Devices</td>','<td>Revenue</td>').replace('<td>Services</td>','<td>Revenue</td>'));
 assert.deepEqual(r.partitions[0].rows.map(r=>r.label),['Devices','Services']);
 assert.ok(r.partitions[0].rows.every(r=>r.labelBasis==='taxonomy_identifier'));
});
test('rounding tolerance belongs to each period and cannot borrow the other years uncertainty',async()=>{
 assert.equal((await build(revenueFixture({total:[100,122]}))).partitions.length,0);
 const r=await build(revenueFixture({total:[100,121]}));
 assert.equal(r.partitions[0].reconciliation.currentGap,1e6);
});
test('a conflicting repeated segment fact outside the chosen table blocks its partition',async()=>{
 const extra=`<p><ix:nonFraction id="outside" contextRef="Services1" name="${concept}" unitRef="usd" scale="6" decimals="-6">52</ix:nonFraction></p>`;
 assert.equal((await build(revenueFixture({extra}))).partitions.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHistorySeries,buildHistoryPerformanceMetrics,attachHistoryExternalFlows} from '../lib/server/private-portfolio.js';
import {buildPortfolioTrend,buildPerformanceAnalyticsFromSeries} from '../lib/server/normalizers.js';
import {buildPerformanceReport} from '../lib/server/holdings-performance.js';
const row=(date,value,extra={})=>({date,total_value_usd:value,external_flow_usd:0,...extra});
const pair=(value,extra={})=>[row('2026-01-01',100),row('2026-01-02',value,extra)];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('losses and gains are never clipped, including a complete loss',()=>{
 for(const value of [0,1,500]){const series=buildHistorySeries(pair(value));near(series[1].period_return,value/100-1);near(buildHistoryPerformanceMetrics(pair(value)).totalTwr,value/100-1);assert.equal(series.length,2)}
});
test('start and end deposits use the amount actually invested',()=>{
 near(buildHistorySeries(pair(220,{external_flow_usd:100,external_flow_timing:'start'}))[1].period_return,.1);
 near(buildHistorySeries(pair(210,{external_flow_usd:100,external_flow_timing:'end'}))[1].period_return,.1);
 near(buildHistorySeries(pair(0,{external_flow_usd:-100,external_flow_timing:'end'}))[1].period_return,0);
});
test('unknown timing or flow coverage blocks cumulative performance',()=>{
 for(const extra of [{external_flow_usd:100},{external_flow_usd:null},{flow_coverage:'unknown'},{trade_count:2}])assert.equal(buildHistoryPerformanceMetrics(pair(220,extra)).totalTwr,null);
});
test('interior flows retain time and declare Modified Dietz, including offsetting flows',()=>{
 const rows=attachHistoryExternalFlows(pair(120),[{date:'2026-01-01T12:00:00Z',flow_usd:100},{date:'2026-01-02T00:00:00Z',flow_usd:-100}]);
 assert.equal(rows[1].external_flows.length,2);
 near(buildHistorySeries(rows)[1].period_return,20/150);
 assert.equal(buildHistoryPerformanceMetrics(rows).performanceMethod,'modified_dietz_approximation');
});
test('missing observations cannot disappear or silently reset the return chain',()=>{
 const rows=[...pair(null),row('2026-01-03',120)];const s=buildHistorySeries(rows);
 assert.equal(s.length,3);assert.equal(s[2].portfolio_growth,null);assert.equal(buildHistoryPerformanceMetrics(rows).totalTwr,null);
});
test('cash flow inclusion uses captured time, not a rounded earlier bucket',()=>{
 const rows=[{captured_at:'2026-01-01T00:10:00Z',capture_bucket:'2026-01-01T00:00:00Z',total_value_usd:100},{captured_at:'2026-01-01T00:25:00Z',capture_bucket:'2026-01-01T00:15:00Z',total_value_usd:200}];
 const joined=attachHistoryExternalFlows(rows,[{date:'2026-01-01T00:20:00Z',flow_usd:100}]);
 assert.equal(joined[1].external_flow_usd,100);near(buildHistorySeries(joined)[1].period_return,0);
});
test('mismatched flow totals and duplicate dates do not produce performance',()=>{
 assert.equal(buildHistoryPerformanceMetrics(pair(220,{external_flow_usd:100,external_flows:[]})).totalTwr,null);
 assert.equal(buildHistoryPerformanceMetrics([row('2026-01-01',100),row('2026-01-01',200)]).totalTwr,null);
});
test('terminal losses survive the normalizer, drawdown and presentation report',()=>{
 const rows=pair(0),metrics=buildHistoryPerformanceMetrics(rows),trend=buildPortfolioTrend(buildHistorySeries(rows));
 assert.equal(trend[1].portfolio,0);const analytics=buildPerformanceAnalyticsFromSeries(trend);assert.equal(analytics.totalReturn,-1);assert.equal(analytics.maxDrawdown,-1);
 const report=buildPerformanceReport({holdings:[],snapshotHistoryRows:rows,twrMetrics:metrics});assert.equal(report.twr.totalTwr,-1);
});
test('presentation does not resurrect returns from a partial history',()=>{
 const rows=[...pair(110),row('2026-01-03',null)];const analytics=buildPerformanceAnalyticsFromSeries(buildPortfolioTrend(buildHistorySeries(rows)));assert.equal(analytics.totalReturn,null);
});

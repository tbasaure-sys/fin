// Recorded performance v2. Unknown observations break the chain; zero is data.
const number = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const time = row => Date.parse(row.captured_at || row.capture_bucket || row.date || '');
export function recordedPerformanceSeries(input) {
  const rows = [...(Array.isArray(input) ? input : [])].sort((a,b) => time(a)-time(b));
  let previous = null, index = null, started = false, broken = false;
  let initialValue = null, benchmarkStart = null;
  return rows.map(row => {
    const value = number(row.total_value_usd), net = number(row.external_flow_usd);
    const benchmark = number(row.benchmark_price_usd);
    if (benchmarkStart === null && benchmark > 0) benchmarkStart = benchmark;
    let period = null, status = 'awaiting_capital', method = 'unresolved';
    if (!Number.isFinite(time(row)) || value === null || value < 0) {
      status = 'missing_or_invalid_valuation'; if (started) broken = true;
    } else if (!started && value > 0) {
      started = true; initialValue = value; index = 1; status = 'baseline';
    } else if (started && !broken) {
      const start = time(previous), end = time(row);
      let flows = row.external_flows;
      if (!Array.isArray(flows) && net !== null) {
        if (net === 0 && !(row.trade_count > 0)) flows = [];
        else if (['start','end'].includes(row.external_flow_timing)) flows = [{ amount: net, at: new Date(row.external_flow_timing === 'start' ? start : end).toISOString() }];
      }
      const validFlows = Array.isArray(flows) && flows.every(f => number(f.amount) !== null && Number.isFinite(Date.parse(f.at)) && Date.parse(f.at) >= start && Date.parse(f.at) <= end);
      const sum = validFlows ? flows.reduce((s,f) => s + Number(f.amount),0) : null;
      if (!(end > start) || !validFlows || row.flow_coverage === 'unknown' || (net !== null && Math.abs(sum-net) > 0.000001)) {
        status = 'flow_timing_or_coverage_unresolved'; broken = true;
      } else {
        const weighted = flows.reduce((s,f) => s + Number(f.amount)*(end-Date.parse(f.at))/(end-start),0);
        const denominator = number(previous.total_value_usd) + weighted;
        if (denominator > 0) {
          period = (value-number(previous.total_value_usd)-sum)/denominator;
          // Interior flows only identify a Modified Dietz approximation, not exact TWR.
          method = flows.some(f => Date.parse(f.at)>start && Date.parse(f.at)<end) ? 'modified_dietz_approximation' : 'twr_observed_boundaries';
          if (!Number.isFinite(period) || period < -1) { status = 'inconsistent_capital'; period = null; broken = true; }
          else { index *= 1+period; status = 'calculated'; }
        } else if (denominator === 0 && value === 0 && flows.length === 0) {
          period = 0; status = 'calculated'; method = 'twr_observed_boundaries';
        } else { status = 'capital_restart_or_unresolved'; broken = true; }
      }
    } else if (broken) status = 'incomplete_history';
    const result = {
      date: row.captured_at || row.capture_bucket || row.date,
      portfolio_growth: started && !broken ? index : null,
      value_growth: initialValue > 0 && value !== null && value >= 0 ? value/initialValue : null,
      spy_growth: benchmarkStart > 0 && benchmark !== null ? benchmark/benchmarkStart : null,
      external_flow_usd: net, period_return: period, performance_method: method, performance_status: status,
    };
    previous = row;
    return result;
  });
}

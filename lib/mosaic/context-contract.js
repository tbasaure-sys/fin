function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, low = -100, high = 100) {
  return Math.min(Math.max(finite(value), low), high);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function ageDays(value, now) {
  const timestamp = Date.parse(value || "");
  const reference = Date.parse(now || "");
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) return null;
  return Math.max(0, (reference - timestamp) / 86_400_000);
}

function freshness(value, now) {
  const days = ageDays(value, now);
  if (days === null) return { status: "unknown", ageDays: null, usable: false };
  if (days <= 3) return { status: "current", ageDays: days, usable: true };
  if (days <= 30) return { status: "lagged", ageDays: days, usable: true };
  return { status: "stale", ageDays: days, usable: false };
}

function marketAxes(row = {}) {
  const contribution = row.driver_contributions || {};
  const supply = clamp(
    finite(contribution.inventory_drawdown)
      + finite(contribution.delivery_stress)
      + finite(contribution.capacity_tightness)
      + finite(contribution.trade_stress)
      + finite(contribution.inventory_buildup),
  );
  const demand = clamp(
    finite(contribution.demand_acceleration)
      + finite(contribution.order_growth)
      + finite(contribution.demand_slowdown),
  );
  const price = clamp(finite(contribution.price_acceleration) + finite(contribution.margin_compression));
  return { supply, demand, price };
}

function liquidityAxis(macro = {}) {
  const liquidity = macro.liquidity || {};
  const components = liquidity.components || {};
  const canonical = components.us_net_liquidity || components.us_net_liquidity_ex_rrp || {};
  const impulse = finite(canonical.impulse, finite(liquidity.impulse, 0));
  if (Math.abs(impulse) <= 1) return clamp(impulse * 100);
  return clamp(impulse / Math.max(1, Math.abs(impulse)) * Math.min(100, Math.log10(Math.abs(impulse) + 1) * 28));
}

export function buildMosaicContext({ mosaic = {}, macro = {}, now = new Date().toISOString() } = {}) {
  const generatedAt = mosaic.generated_at || mosaic.generatedAt || mosaic.run_date || null;
  const overallFreshness = freshness(generatedAt, now);
  const providers = list(mosaic.source_summary?.providers || mosaic.providers);
  const providerLatest = providers.map((item) => item.latest_date || item.latest).filter(Boolean).sort().at(-1) || generatedAt;
  const marketFreshness = freshness(providerLatest, now);
  const usable = overallFreshness.usable && marketFreshness.status !== "stale";
  const markets = usable
    ? list(mosaic.markets).map((row) => {
        const axes = marketAxes(row);
        const sourceIds = list(row.source_series);
        const quality = clamp(finite(row.data_quality, row.quality), 0, 100);
        const coverage = row.source_coverage || {};
        return {
          id: String(row.market_id || row.id || row.item || "market"),
          name: String(row.item || row.name || row.market || "Mercado"),
          region: String(row.region || "Global"),
          sector: String(row.sector || "multi-sector"),
          axes,
          score: clamp(row.score),
          quality,
          confidence: clamp((quality * 0.72 + Math.min(100, sourceIds.length * 12) * 0.28) / 100, 0, 1),
          sourceIds,
          coverage: {
            connectedSeries: finite(coverage.connected_series, sourceIds.length),
            connectedLayers: list(coverage.connected_layers),
            missingLayer: String(coverage.missing_layer || ""),
          },
          freshness: marketFreshness,
        };
      })
    : [];
  const supply = markets.length ? markets.reduce((sum, item) => sum + item.axes.supply, 0) / markets.length : 0;
  const demand = markets.length ? markets.reduce((sum, item) => sum + item.axes.demand, 0) / markets.length : 0;
  const liquidity = liquidityAxis(macro);
  const confidence = markets.length
    ? markets.reduce((sum, item) => sum + item.confidence, 0) / markets.length
    : 0;
  const sourceIds = [...new Set(markets.flatMap((item) => item.sourceIds))];

  return {
    version: "mosaic_context_v2",
    asOf: generatedAt,
    status: overallFreshness.status,
    confidence,
    axes: { supply: clamp(supply), demand: clamp(demand), liquidity },
    markets: markets.sort((left, right) => Math.abs(right.score) - Math.abs(left.score)),
    providers,
    freshness: overallFreshness,
    evidence: [
      sourceIds.length ? { id: "mosaic-market-sources", label: "Fuentes de oferta y demanda", sourceIds } : null,
      macro.run_date || macro.generated_on
        ? { id: "mosaic-liquidity", label: "Impulso de liquidez", sourceIds: ["macro-liquidity"] }
        : null,
    ].filter(Boolean),
    raw: mosaic,
  };
}


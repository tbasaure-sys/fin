const CURRENT_MAX_AGE_DAYS = 3;
const USABLE_MAX_AGE_DAYS = 30;

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

function unique(value) {
  return [...new Set(list(value).map((item) => String(item || "").trim()).filter(Boolean))];
}

function dateOnly(value) {
  const text = String(value || "").trim();
  return Number.isFinite(Date.parse(text)) ? text.slice(0, 10) : null;
}

function ageDays(value, now) {
  const timestamp = Date.parse(value || "");
  const reference = Date.parse(now || "");
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) return null;
  return (reference - timestamp) / 86_400_000;
}

function freshness(value, now) {
  const days = ageDays(value, now);
  if (days === null) return { status: "unknown", ageDays: null, usable: false };
  if (days < 0) return { status: "future", ageDays: days, usable: false };
  if (days <= CURRENT_MAX_AGE_DAYS) return { status: "current", ageDays: days, usable: true };
  if (days <= USABLE_MAX_AGE_DAYS) return { status: "lagged", ageDays: days, usable: true };
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

function evidenceRows(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([sourceId, row]) => (
    typeof row === "string"
      ? { source_id: sourceId, as_of: row }
      : { ...(row || {}), source_id: row?.source_id || row?.sourceId || row?.id || sourceId }
  ));
}

function normalizeEvidence(row = {}, fallbackSourceId = null) {
  const sourceId = String(row.source_id || row.sourceId || row.series_id || row.id || fallbackSourceId || "").trim();
  const asOf = dateOnly(row.as_of || row.asOf || row.latest_date || row.latest || row.date);
  if (!sourceId) return null;
  return {
    sourceId,
    provider: String(row.provider || row.provider_name || row.name || "").trim() || null,
    asOf,
  };
}

function evidenceIndex(rows) {
  return new Map(rows.map((row) => normalizeEvidence(row)).filter(Boolean).map((row) => [row.sourceId, row]));
}

function providerEvidence(providers) {
  const bySource = new Map();
  for (const provider of providers) {
    const sourceIds = unique([
      ...list(provider?.source_ids),
      ...list(provider?.sourceIds),
      ...list(provider?.series_ids),
      ...list(provider?.source_series),
    ]);
    const asOf = dateOnly(provider?.latest_date || provider?.latest || provider?.as_of || provider?.asOf);
    for (const sourceId of sourceIds) {
      bySource.set(sourceId, {
        sourceId,
        provider: String(provider?.name || "").trim() || null,
        asOf,
      });
    }
  }
  return bySource;
}

function combinedFreshness(evidence, now) {
  if (!evidence.length || evidence.some((row) => !row.asOf)) {
    return { status: "unknown", ageDays: null, usable: false };
  }
  const rows = evidence.map((row) => freshness(row.asOf, now));
  const age = Math.max(...rows.map((row) => row.ageDays));
  if (rows.some((row) => row.status === "future")) {
    return { status: "future", ageDays: Math.min(...rows.map((row) => row.ageDays)), usable: false };
  }
  if (rows.some((row) => row.status === "stale")) return { status: "stale", ageDays: age, usable: false };
  if (rows.some((row) => row.status === "lagged")) return { status: "lagged", ageDays: age, usable: true };
  return { status: "current", ageDays: age, usable: true };
}

function oldestDate(rows) {
  return rows.map((row) => dateOnly(row?.asOf)).filter(Boolean).sort().at(0) || null;
}

function marketEvidence({ row, providers, topLevelIndex, providerIndex, now }) {
  const localRows = evidenceRows(row?.source_evidence || row?.sourceEvidence || row?.evidence);
  const localIndex = evidenceIndex(localRows);
  const localSourceIds = localRows.map((item) => normalizeEvidence(item)?.sourceId).filter(Boolean);
  const sourceIds = unique([...list(row?.source_series), ...list(row?.sourceIds), ...localSourceIds]);
  const rowAsOf = dateOnly(row?.source_as_of || row?.sourceAsOf || row?.as_of || row?.asOf);
  const singleProvider = providers.length === 1 ? providers[0] : null;
  const evidence = sourceIds.map((sourceId) => {
    const direct = localIndex.get(sourceId) || topLevelIndex.get(sourceId) || providerIndex.get(sourceId);
    if (direct) return direct;
    if (rowAsOf) {
      return { sourceId, provider: String(row?.provider || "").trim() || null, asOf: rowAsOf };
    }
    if (singleProvider) {
      return {
        sourceId,
        provider: String(singleProvider.name || "").trim() || null,
        asOf: dateOnly(singleProvider.latest_date || singleProvider.latest || singleProvider.as_of || singleProvider.asOf),
      };
    }
    return { sourceId, provider: null, asOf: null };
  });
  return {
    sourceIds,
    evidence,
    asOf: oldestDate(evidence),
    freshness: combinedFreshness(evidence, now),
  };
}

function liquidityAxis(liquidity = {}) {
  const components = liquidity.components || {};
  const canonical = components.us_net_liquidity || components.us_net_liquidity_ex_rrp || {};
  const impulse = finite(canonical.impulse, finite(liquidity.impulse, 0));
  if (Math.abs(impulse) <= 1) return clamp(impulse * 100);
  return clamp(
    impulse / Math.max(1, Math.abs(impulse)) * Math.min(100, Math.log10(Math.abs(impulse) + 1) * 28),
  );
}

function normalizeLiquidityContext(macro, now) {
  const liquidity = macro?.liquidity || {};
  const sourceIds = unique(liquidity.sourceIds || liquidity.source_ids);
  const asOf = dateOnly(liquidity.asOf || liquidity.as_of || liquidity.latest_date || liquidity.date);
  const measured = freshness(asOf, now);
  const hasSuppliedFreshness = liquidity?.freshness && typeof liquidity.freshness === "object";
  const suppliedUsable = !hasSuppliedFreshness || liquidity.freshness.usable === true;
  const suppliedStatus = hasSuppliedFreshness ? String(liquidity.freshness.status || "") : "";
  const suppliedBlocks = ["future", "stale", "unknown"].includes(suppliedStatus) || !suppliedUsable;
  const usable = liquidity.usable === true
    && sourceIds.length > 0
    && Boolean(asOf)
    && measured.usable === true
    && !suppliedBlocks;
  const status = !asOf || !sourceIds.length
    ? "unknown"
    : !measured.usable
      ? measured.status
      : suppliedBlocks
        ? suppliedStatus || "unknown"
        : measured.status;
  return {
    factorId: "global_liquidity",
    axis: usable ? liquidityAxis(liquidity) : 0,
    asOf,
    sourceIds,
    freshness: { ...measured, status, usable },
    usable,
    confidence: usable ? clamp(finite(liquidity.confidence, 0.75), 0, 1) : 0,
  };
}

function contextStatus(markets) {
  if (!markets.length) return "unknown";
  const usable = markets.filter((market) => market.freshness.usable);
  if (!usable.length) {
    if (markets.some((market) => market.freshness.status === "future")) return "future";
    return markets.some((market) => market.freshness.status === "stale") ? "stale" : "unknown";
  }
  if (usable.length !== markets.length) return "mixed";
  if (usable.some((market) => market.freshness.status === "lagged")) return "lagged";
  return "current";
}

export function buildMosaicContext({ mosaic = {}, macro = {}, now = new Date().toISOString() } = {}) {
  const providers = list(mosaic.source_summary?.providers || mosaic.providers);
  const topLevelEvidence = evidenceRows(
    mosaic.source_evidence
      || mosaic.sourceEvidence
      || mosaic.series_evidence
      || mosaic.seriesEvidence
      || mosaic.source_observations
      || mosaic.series_observations,
  );
  const topLevelIndex = evidenceIndex(topLevelEvidence);
  const providerIndex = providerEvidence(providers);
  const markets = list(mosaic.markets).map((row) => {
    const axes = marketAxes(row);
    const evidence = marketEvidence({ row, providers, topLevelIndex, providerIndex, now });
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
      confidence: clamp((quality * 0.72 + Math.min(100, evidence.sourceIds.length * 12) * 0.28) / 100, 0, 1),
      sourceIds: evidence.sourceIds,
      evidence: evidence.evidence,
      asOf: evidence.asOf,
      coverage: {
        connectedSeries: finite(coverage.connected_series, evidence.sourceIds.length),
        connectedLayers: list(coverage.connected_layers),
        missingLayer: String(coverage.missing_layer || ""),
      },
      freshness: evidence.freshness,
    };
  });
  const usableMarkets = markets.filter((market) => market.freshness.usable);
  const averageAxis = (axis) => (
    usableMarkets.length
      ? usableMarkets.reduce((sum, market) => sum + finite(market.axes?.[axis]), 0) / usableMarkets.length
      : 0
  );
  const liquidity = normalizeLiquidityContext(macro, now);
  const status = contextStatus(markets);
  const confidence = usableMarkets.length
    ? usableMarkets.reduce((sum, market) => sum + market.confidence, 0) / usableMarkets.length
    : 0;
  const marketAgeDays = markets.map((market) => market.freshness.ageDays).filter(Number.isFinite);

  return {
    version: "mosaic_context_v2",
    asOf: oldestDate(usableMarkets),
    generatedAt: mosaic.generated_at || mosaic.generatedAt || mosaic.run_date || null,
    status,
    confidence,
    axes: {
      supply: clamp(averageAxis("supply")),
      demand: clamp(averageAxis("demand")),
      liquidity: liquidity.axis,
    },
    liquidity,
    markets: markets.sort((left, right) => Math.abs(right.score) - Math.abs(left.score)),
    providers,
    freshness: {
      status,
      ageDays: marketAgeDays.length ? Math.max(...marketAgeDays) : null,
      usable: usableMarkets.length > 0,
    },
    evidence: [
      ...markets.map((market) => ({
        id: `market:${market.id}`,
        marketId: market.id,
        label: market.name,
        sourceIds: market.sourceIds,
        asOf: market.asOf,
        status: market.freshness.status,
        usable: market.freshness.usable,
      })),
      liquidity.sourceIds.length ? {
        id: "liquidity:global",
        factorId: "global_liquidity",
        label: "Impulso de liquidez",
        sourceIds: liquidity.sourceIds,
        asOf: liquidity.asOf,
        status: liquidity.freshness.status,
        usable: liquidity.usable,
      } : null,
    ].filter(Boolean),
    raw: mosaic,
  };
}

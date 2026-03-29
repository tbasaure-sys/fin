function parseSnapshotTime(value) {
  const millis = Date.parse(String(value || "").trim());
  return Number.isFinite(millis) ? millis : null;
}

export function buildUnavailableSnapshot(error) {
  const message = String(error?.message || error || "unknown error");
  const staleDetails = message
    .replace(/^Live (backend )?snapshot is stale(?::|\s+and\s+was\s+ignored)?\s*/i, "")
    .replace(/^\(/, "")
    .replace(/\)\.?$/, "")
    .trim();
  const warningLabel = /snapshot is stale/i.test(message)
    ? staleDetails
      ? `Live backend snapshot was ignored because it is stale (${staleDetails}).`
      : "Live backend snapshot was ignored because it is stale."
    : `Live backend unavailable: ${message}`;

  return {
    generated_at: null,
    as_of_date: null,
    overview: {},
    portfolio: {
      holdings: [],
      quotes: [],
      quotes_stale_days: null,
      quotes_as_of: null,
    },
    screener: {
      rows: [],
    },
    sectors: {
      preferred: [],
      records: [],
    },
    international: {
      preferred: [],
      records: [],
    },
    risk: {},
    status: {
      warnings: [warningLabel],
      panels: [],
      contract_status: "fallback_legacy",
    },
  };
}

export function getSnapshotAgeHours(snapshot) {
  const generatedAt = parseSnapshotTime(snapshot?.generated_at);
  if (generatedAt === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - generatedAt) / (1000 * 60 * 60));
}

export function isSnapshotUsable(snapshot, operationalConfig) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const generatedAt = parseSnapshotTime(snapshot.generated_at);
  if (generatedAt === null) return false;

  const ageHours = getSnapshotAgeHours(snapshot);
  if (ageHours > operationalConfig.snapshot.maxAgeHours) return false;

  const portfolio = snapshot.portfolio || {};
  const quotesAsOf = parseSnapshotTime(portfolio.quotes_as_of || snapshot.as_of_date);
  const staleDays = Number(portfolio.quotes_stale_days);
  const hasPortfolioContext =
    Array.isArray(portfolio.holdings) && portfolio.holdings.length > 0 ||
    Array.isArray(portfolio.top_holdings) && portfolio.top_holdings.length > 0 ||
    Array.isArray(portfolio.current_mix_vs_spy) && portfolio.current_mix_vs_spy.length > 0;

  if (Number.isFinite(staleDays) && staleDays > operationalConfig.snapshot.maxQuoteStaleDaysWithoutPortfolio && !hasPortfolioContext) return false;
  if (quotesAsOf === null && !hasPortfolioContext && ageHours > operationalConfig.snapshot.maxAgeHoursWithoutQuotes) return false;

  return true;
}

export function selectBackendSnapshot({
  liveSnapshot = null,
  liveError = null,
  persistedSnapshot = null,
  allowPersistedFallback = false,
  operationalConfig,
} = {}) {
  if (isSnapshotUsable(liveSnapshot, operationalConfig)) {
    return liveSnapshot;
  }

  if (allowPersistedFallback && isSnapshotUsable(persistedSnapshot, operationalConfig)) {
    return persistedSnapshot;
  }

  if (liveSnapshot) {
    return buildUnavailableSnapshot(
      new Error(`Live backend snapshot is stale and was ignored (generated_at ${liveSnapshot?.generated_at || "unknown"}).`),
    );
  }

  return buildUnavailableSnapshot(liveError || new Error("No usable backend snapshot was available."));
}

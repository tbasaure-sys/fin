const STATUS_SCORE = {
  available: 100,
  partial: 75,
  estimated: 72,
  fallback: 64,
  stale: 50,
  missing: 32,
  fetch_failed: 24,
  not_supported: 70,
};

const BLOCK_WEIGHTS = {
  sec: 24,
  quote: 18,
  riskFree: 14,
  drivers: 24,
  catalysts: 12,
  router: 10,
  valuation: 10,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function statusScore(status) {
  return STATUS_SCORE[status] ?? 35;
}

function levelFromScore(score) {
  if (score >= 82) return "good";
  if (score >= 64) return "usable";
  if (score >= 42) return "limited";
  return "poor";
}

function item(status, value, options = {}) {
  return {
    status,
    value: value === undefined ? null : value,
    source: options.source || null,
    timestamp: options.timestamp || null,
    fallbackFrom: options.fallbackFrom || null,
    missingReason: options.missingReason || null,
    warnings: options.warnings || [],
    metadata: options.metadata || {},
  };
}

function block(status, items, options = {}) {
  return {
    status,
    items,
    source: options.source || null,
    timestamp: options.timestamp || null,
    warnings: options.warnings || [],
    metadata: options.metadata || {},
  };
}

function blockScore(blockValue) {
  const itemValues = Object.values(blockValue?.items || {});
  if (!itemValues.length) return statusScore(blockValue?.status);
  const itemAverage = itemValues.reduce((sum, entry) => sum + statusScore(entry.status), 0) / itemValues.length;
  return Math.round(itemAverage * 0.72 + statusScore(blockValue.status) * 0.28);
}

function buildDataQuality(blocks) {
  const blockScores = {};
  let weighted = 0;
  let totalWeight = 0;
  const limitations = [];
  const warnings = [];

  Object.entries(blocks).forEach(([key, value]) => {
    const score = blockScore(value);
    blockScores[key] = score;
    const weight = BLOCK_WEIGHTS[key] || 8;
    weighted += score * weight;
    totalWeight += weight;

    if (["missing", "fetch_failed", "fallback", "stale", "partial", "estimated"].includes(value.status)) {
      limitations.push(`${key}: ${value.status}`);
    }
    value.warnings?.forEach((warning) => warnings.push(`${key}: ${warning}`));
    Object.entries(value.items || {}).forEach(([itemKey, entry]) => {
      if (["missing", "fetch_failed", "fallback", "stale"].includes(entry.status)) {
        limitations.push(`${key}.${itemKey}: ${entry.missingReason || entry.status}`);
      }
      entry.warnings?.forEach((warning) => warnings.push(`${key}.${itemKey}: ${warning}`));
    });
  });

  const overallScore = Math.round(weighted / Math.max(1, totalWeight));
  return {
    overallScore,
    level: levelFromScore(overallScore),
    blockScores,
    limitations: [...new Set(limitations)].slice(0, 12),
    warnings: [...new Set(warnings)].slice(0, 12),
  };
}

function buildSecBlock(snapshot = {}) {
  const coverage = snapshot.coverage || {};
  const company = snapshot.company || {};
  const facts = snapshot.facts || {};
  const hasCompanyFacts = Boolean(coverage.secCompanyFacts || coverage.secCompanyfacts);
  const hasSubmissions = Boolean(coverage.secSubmissions);
  const hasCoreFacts = ["revenue", "operatingIncome", "cfo", "capex", "shares"].some((key) => facts[key]);
  const status = hasCompanyFacts && hasCoreFacts ? "available" : hasCompanyFacts ? "partial" : "missing";

  return block(status, {
    companyFacts: item(hasCompanyFacts ? "available" : "missing", hasCompanyFacts, {
      source: "SEC companyfacts",
      missingReason: hasCompanyFacts ? null : "sec_companyfacts_missing",
    }),
    submissions: item(hasSubmissions ? "available" : "fallback", hasSubmissions, {
      source: "SEC submissions",
      missingReason: hasSubmissions ? null : "sec_submissions_missing",
    }),
    fiscalYear: item(company.fiscalYear ? "available" : "missing", company.fiscalYear || null, {
      source: company.form || "SEC filing",
      timestamp: company.filed || company.filedAt || null,
      missingReason: company.fiscalYear ? null : "fiscal_year_missing",
    }),
  }, {
    source: "SEC EDGAR",
    timestamp: company.filed || company.filedAt || null,
    metadata: {
      form: company.form || null,
      cik: company.cik || null,
      sic: company.sic || null,
      sicDescription: company.sicDescription || null,
    },
  });
}

function buildQuoteBlock(snapshot = {}) {
  const quote = snapshot.quote || {};
  const price = isFiniteNumber(quote.price) ? quote.price : null;
  const source = quote.source || snapshot.coverage?.quoteSource || null;
  const status = price ? (source && /fallback/i.test(source) ? "fallback" : "available") : "missing";
  return block(status, {
    price: item(price ? status : "missing", price, {
      source,
      missingReason: price ? null : "market_price_missing",
    }),
    marketCap: item(isFiniteNumber(quote.marketCap) ? status : "missing", isFiniteNumber(quote.marketCap) ? quote.marketCap : null, {
      source,
      missingReason: isFiniteNumber(quote.marketCap) ? null : "market_cap_missing",
    }),
  }, { source });
}

function buildRiskFreeBlock(snapshot = {}) {
  const riskFree = snapshot.riskFree || {};
  const assumptionsRiskFree = snapshot.assumptions?.riskFree || {};
  const value = isFiniteNumber(riskFree.value) ? riskFree.value : assumptionsRiskFree.value;
  const source = riskFree.source || assumptionsRiskFree.source || null;
  const status = isFiniteNumber(value) ? (/fallback/i.test(String(source)) ? "fallback" : "available") : "missing";
  return block(status, {
    rate: item(status, isFiniteNumber(value) ? value : null, {
      source,
      timestamp: riskFree.date || assumptionsRiskFree.date || null,
      missingReason: isFiniteNumber(value) ? null : "risk_free_rate_missing",
    }),
  }, { source, timestamp: riskFree.date || assumptionsRiskFree.date || null });
}

function buildDriversBlock(drivers = {}, missingDrivers = []) {
  const required = ["price", "baseFcf", "revenueCagr", "margin", "roic", "reinvestment", "thesisQuality", "demandSupply", "bottleneckPower"];
  const missing = new Set(missingDrivers || []);
  const items = Object.fromEntries(required.map((key) => {
    const value = drivers[key];
    const present = isFiniteNumber(value);
    return [key, item(present ? "available" : "missing", present ? value : null, {
      source: "Valuation OS derived drivers",
      missingReason: present ? null : `${key}_missing`,
    })];
  }));
  const presentCount = required.filter((key) => !missing.has(key) && isFiniteNumber(drivers[key])).length;
  const status = presentCount === required.length ? "available" : presentCount >= Math.ceil(required.length * 0.65) ? "partial" : "missing";
  return block(status, items, {
    source: "Valuation OS driver derivation",
    metadata: {
      presentCount,
      requiredCount: required.length,
    },
  });
}

function buildRouterBlock(router = {}) {
  const hasRouter = router && typeof router === "object" && router.version;
  const status = !hasRouter ? "missing" : router.abstain ? "partial" : router.confidence < 0.45 ? "estimated" : "available";
  return block(status, {
    dominantRegime: item(hasRouter ? status : "missing", router.dominantRegime || null, {
      source: router.version || null,
      missingReason: hasRouter ? null : "router_missing",
    }),
    dominantModel: item(hasRouter ? status : "missing", router.dominantModel || null, {
      source: router.version || null,
      missingReason: hasRouter ? null : "router_missing",
    }),
    confidence: item(hasRouter ? status : "missing", isFiniteNumber(router.confidence) ? router.confidence : null, {
      source: router.version || null,
    }),
  }, {
    source: router.version || null,
    warnings: router.abstain ? ["router_abstained"] : [],
  });
}

function buildValuationBlock(valuation = {}) {
  const value = isFiniteNumber(valuation.valuation) ? valuation.valuation : null;
  const upside = isFiniteNumber(valuation.upside) ? valuation.upside : null;
  const expectedIrr = isFiniteNumber(valuation.expectedIrr) ? valuation.expectedIrr : null;
  const status = value !== null && upside !== null ? "available" : value !== null ? "partial" : "missing";
  return block(status, {
    fairValue: item(value !== null ? "available" : "missing", value, {
      source: "Valuation OS blended model",
      missingReason: value !== null ? null : "valuation_missing",
    }),
    upside: item(upside !== null ? "available" : "missing", upside, {
      source: "Valuation OS blended model",
      missingReason: upside !== null ? null : "upside_missing",
    }),
    expectedIrr: item(expectedIrr !== null ? "available" : "missing", expectedIrr, {
      source: "Valuation OS blended model",
      missingReason: expectedIrr !== null ? null : "expected_irr_missing",
    }),
  }, { source: "Valuation OS blended model" });
}

function buildCatalystBlock(catalystPack = {}) {
  const hasPack = catalystPack && typeof catalystPack === "object" && catalystPack.version;
  const catalysts = Array.isArray(catalystPack.catalysts) ? catalystPack.catalysts : [];
  const status = !hasPack ? "missing" : catalystPack.status || (catalysts.length ? "partial" : "estimated");
  const top = Array.isArray(catalystPack.dominantCatalysts) ? catalystPack.dominantCatalysts : catalysts.slice(0, 3);
  return block(status, {
    aggregateScore: item(hasPack ? status : "missing", isFiniteNumber(catalystPack.aggregateScore) ? catalystPack.aggregateScore : null, {
      source: catalystPack.source || null,
      missingReason: hasPack ? null : "catalyst_pack_missing",
    }),
    dominantCatalysts: item(hasPack ? status : "missing", top, {
      source: catalystPack.source || null,
      missingReason: hasPack ? null : "catalyst_pack_missing",
    }),
  }, {
    source: catalystPack.source || null,
    warnings: catalystPack.warnings || [],
  });
}

function buildProviderDiagnostics(blocks) {
  return Object.entries(blocks).map(([key, value]) => ({
    block: key,
    status: value.status,
    score: blockScore(value),
    source: value.source || null,
    timestamp: value.timestamp || null,
    warnings: value.warnings || [],
    fallbackItems: Object.entries(value.items || {})
      .filter(([, entry]) => ["fallback", "missing", "stale", "fetch_failed", "partial"].includes(entry.status))
      .map(([itemKey, entry]) => ({
        item: itemKey,
        status: entry.status,
        source: entry.source || null,
        fallbackFrom: entry.fallbackFrom || null,
        missingReason: entry.missingReason || null,
      })),
  }));
}

export function buildValuationContextPack(input = {}) {
  const ticker = String(input.ticker || input.drivers?.ticker || input.snapshot?.company?.ticker || "UNKNOWN").toUpperCase();
  const snapshot = input.snapshot || {};
  const drivers = input.drivers || {};
  const router = input.router || {};
  const catalystPack = input.catalystPack || snapshot.catalystPack || {};
  const blocks = {
    sec: buildSecBlock(snapshot),
    quote: buildQuoteBlock(snapshot),
    riskFree: buildRiskFreeBlock(snapshot),
    drivers: buildDriversBlock(drivers, input.missingDrivers || []),
    catalysts: buildCatalystBlock(catalystPack),
    router: buildRouterBlock(router),
    valuation: buildValuationBlock(input),
  };
  const dataQuality = buildDataQuality(blocks);
  return {
    version: "valuation_context_pack_v1",
    subject: {
      ticker,
      name: snapshot.company?.entityName || snapshot.company?.name || drivers.name || null,
      industry: snapshot.company?.industry || drivers.sector || null,
    },
    createdAt: new Date().toISOString(),
    blocks,
    dataQuality,
    providerDiagnostics: buildProviderDiagnostics(blocks),
    metadata: {
      mode: input.mode || null,
      missingDrivers: input.missingDrivers || [],
    },
  };
}

const REGION_ANCHORS = {
  "North America": { x: 22, y: 36 },
  "Latin America": { x: 31, y: 68 },
  Europe: { x: 50, y: 32 },
  Africa: { x: 52, y: 57 },
  "Middle East": { x: 59, y: 48 },
  Asia: { x: 74, y: 40 },
  Oceania: { x: 83, y: 70 },
  Global: { x: 50, y: 48 },
};

function text(value) {
  return String(value || "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalRegion(value) {
  const region = text(value).toLowerCase();
  if (/united states|u\.s\.|canada|north america|mexico/.test(region)) return "North America";
  if (/latin|south america|brazil|chile|argentina|colombia/.test(region)) return "Latin America";
  if (/europe|euro|germany|france|italy|spain|united kingdom|uk/.test(region)) return "Europe";
  if (/africa/.test(region)) return "Africa";
  if (/middle east|gulf|saudi|uae|israel/.test(region)) return "Middle East";
  if (/australia|oceania|new zealand/.test(region)) return "Oceania";
  if (/asia|china|japan|india|korea|taiwan|emerging/.test(region)) return "Asia";
  return "Global";
}

function offsetFor(id) {
  const hash = [...text(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return { x: (hash % 9) - 4, y: (Math.floor(hash / 9) % 7) - 3 };
}

function trend(delta) {
  const value = number(delta);
  if (value >= 2) return "rising";
  if (value <= -2) return "falling";
  return "stable";
}

export function buildWorldMonitorModel(markets = [], filters = {}) {
  const normalized = (Array.isArray(markets) ? markets : []).filter(Boolean).map((market) => {
    const regionGroup = canonicalRegion(market.region);
    const anchor = REGION_ANCHORS[regionGroup] || REGION_ANCHORS.Global;
    const offset = offsetFor(market.id || market.name);
    return {
      ...market,
      regionGroup,
      sectorGroup: text(market.sector) || "Other",
      x: Math.max(5, Math.min(95, anchor.x + offset.x)),
      y: Math.max(8, Math.min(86, anchor.y + offset.y)),
      trend: trend(market.delta),
    };
  });
  const regions = [...new Set(normalized.map((market) => market.regionGroup))].sort();
  const sectors = [...new Set(normalized.map((market) => market.sectorGroup))].sort();
  const regionFilter = text(filters.region || "all");
  const sectorFilter = text(filters.sector || "all");
  const signalFilter = text(filters.signal || "all");
  const visible = normalized.filter((market) => {
    if (regionFilter !== "all" && market.regionGroup !== regionFilter) return false;
    if (sectorFilter !== "all" && market.sectorGroup !== sectorFilter) return false;
    if (signalFilter === "pressure" && number(market.score) < 25) return false;
    if (signalFilter === "weak" && number(market.score) > -25) return false;
    if (signalFilter === "moving" && market.trend === "stable") return false;
    return true;
  });
  return { markets: visible, regions, sectors, total: normalized.length };
}

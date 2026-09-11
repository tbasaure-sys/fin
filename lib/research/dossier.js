import { hash, retrieve, topics } from "./filing-engine.mjs";

export function cleanTicker(raw) {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(value) ? value : null;
}

// Evidence selection is not model interpretation and must never imply valuation.
export function compileDossier(packet) {
  if (!cleanTicker(packet.ticker) || !Number.isFinite(Date.parse(packet.asOf)))
    throw Error("INVALID_PACKET");
  const sourceIds = new Set();
  for (const source of packet.sources) {
    const url = new URL(source.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.sec.gov" ||
      !url.pathname.startsWith("/Archives/edgar/data/") ||
      url.username ||
      url.password ||
      !/^[a-f0-9]{64}$/.test(source.sha256)
    )
      throw Error("INVALID_SOURCE");
    if (
      !Number.isFinite(Date.parse(source.acceptedAt)) ||
      Date.parse(source.acceptedAt) > Date.parse(packet.asOf)
    )
      throw Error("FUTURE_SOURCE");
    if (sourceIds.has(source.id)) throw Error("DUPLICATE_SOURCE");
    sourceIds.add(source.id);
  }
  for (const chunk of packet.chunks)
    if (!sourceIds.has(chunk.id.split(":")[0])) throw Error("ORPHAN_CHUNK");
  const sections = topics.map((topic) => {
    const ranked = retrieve(packet.chunks, topic);
    const latest = [...packet.sources].sort((a,b)=>Date.parse(b.acceptedAt)-Date.parse(a.acceptedAt))[0];
    const current = latest && retrieve(packet.chunks.filter(c=>c.id.startsWith(`${latest.id}:`)),topic)[0];
    const candidates = current && !ranked.some(c=>c.id===current.id) ? [current,...ranked] : ranked;
    const extracts=[];let chars=0;
    for(const candidate of candidates){if(chars+candidate.text.length>6000)continue;extracts.push(candidate);chars+=candidate.text.length;if(extracts.length===3)break;}
    return {
      id: topic.id,
      extracts,
      status: extracts.length ? "extracts_available" : "no_extracts",
    };
  });
  return {
    version: "bls-filing-dossier-v1",
    ticker: packet.ticker,
    name: packet.name,
    cik: packet.cik ?? null,
    asOf: packet.asOf,
    packetHash: hash(packet),
    sources: packet.sources,
    sections,
    coverage: {
      documents: packet.sources.length,
      totalChunks: packet.chunks.length,
      selectedChunks: new Set(
        sections.flatMap((s) => s.extracts.map((c) => c.id)),
      ).size,
    },
    analysis: {
      status: "pending_provider",
      valuation: null,
      mispricing: null,
      interpretationVerified: false,
    },
    claim: "C0_REPORTED_ONLY",
    performance: null,
    predictiveClaim: false,
  };
}

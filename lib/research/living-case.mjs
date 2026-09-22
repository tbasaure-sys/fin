import { createHash } from "node:crypto";

export const eventKey = (workspaceId, ticker, baselineKey, accession, claimId) =>
  createHash("sha256").update(JSON.stringify([workspaceId, ticker, baselineKey, accession, claimId])).digest("hex");

const stop = new Set("the and are with that from this have will does into when what would should after before between there their for can como para una uno los las del que con por sobre esta este sus mas fue son sea pero cada donde si una cual respecto aumento disminucion revenue company growth risk source premise condicion".split(" "));
const words = (value) => new Set(String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]{4,}/g)?.filter((word) => !stop.has(word)) || []);

export function newSources(baseline, dossier) {
  const old = new Set((baseline.sources || []).map((source) => `${source.accession}:${source.sha256}`));
  return (dossier.sources || []).filter((source) => !old.has(`${source.accession}:${source.sha256}`)
    && Date.parse(source.acceptedAt) > Date.parse(baseline.asOf));
}

export function candidateClaims(baseline, dossier, source, max = 4) {
  const extracts = [...new Map((dossier.sections || []).flatMap((section) => section.extracts || [])
    .filter((extract) => extract.id.startsWith(`${source.id}:`)).map((extract) => [extract.id, extract])).values()];
  const claims = (baseline.sections || []).flatMap((section) => (section.findings || []).map((finding, index) => ({
    id: `${section.id}:${index}`, section: section.id, premise: finding.premise, statement: finding.text,
    kind: finding.kind,
  })));
  return claims.flatMap((claim) => {
    const terms = words(claim.premise);
    const ranked = extracts.map((extract) => ({ extract, score: [...terms].filter((term) => words(extract.text).has(term)).length }))
      .sort((a, b) => b.score - a.score);
    if (!ranked[0]?.score || ranked[0].score < 2) return [];
    return [{ ...claim, score: ranked[0].score, excerpt: ranked[0].extract }];
  }).sort((a, b) => b.score - a.score).slice(0, max);
}

export function evidenceStatus(answer) {
  const relation = answer?.answers?.relation;
  if (!relation || relation.uncertain || answer.status !== "available") return "needs_review";
  if (relation.choice === "contradicts") return "possible_contradiction";
  if (relation.choice === "supports") return "possible_support";
  return "needs_review";
}

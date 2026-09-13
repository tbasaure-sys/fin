// Source-reference review protocol used by the report generator and calibration.
// References prove provenance, not semantic truth or investment merit.
const invalid = () => { throw new Error('INVALID_REFERENCE_REVIEW'); };

function spans(text, prefix) {
  const result = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 600, text.length);
    const newline = text.indexOf('\n', start);
    if (newline >= start && newline < end) end = newline + 1;
    else if (end < text.length) {
      const space = text.lastIndexOf(' ', end - 1);
      if (space > start) end = space + 1;
    }
    // Preserve offsets and every non-whitespace character, including punctuation.
    const piece = text.slice(start, end);
    const leading = piece.length - piece.trimStart().length;
    const trimmed = piece.trim();
    if (trimmed) result.push({id: `${prefix}:${result.length}`, start: start + leading,
      end: start + leading + trimmed.length, text: trimmed});
    start = end;
  }
  return result;
}

export function reviewReferences(claims, dossier) {
  if (!Array.isArray(claims) || !claims.length || claims.length > 30) invalid();
  const chunks = new Map();
  for (const section of dossier.sections ?? []) for (const chunk of section.extracts ?? []) {
    if (typeof chunk.id !== 'string' || typeof chunk.text !== 'string') invalid();
    if (chunks.has(chunk.id) && chunks.get(chunk.id) !== chunk.text) throw new Error('CONFLICTED_CHUNK');
    chunks.set(chunk.id, chunk.text);
  }
  const ids = new Set(), used = new Set();
  const normalized = claims.map(claim => {
    if (typeof claim.id !== 'string' || !claim.id || ids.has(claim.id) ||
      typeof claim.text !== 'string' || !claim.text.trim() || !Array.isArray(claim.chunkIds) ||
      !claim.chunkIds.length || claim.chunkIds.length > 4 ||
      new Set(claim.chunkIds).size !== claim.chunkIds.length) invalid();
    ids.add(claim.id);
    for (const id of claim.chunkIds) {
      if (!chunks.get(id)?.trim()) invalid();
      used.add(id);
    }
    return {id: claim.id, text: claim.text, chunkIds: [...claim.chunkIds]};
  });
  const sources = [...used].map((chunkId, i) => ({chunkId,
    spans: spans(chunks.get(chunkId), `source${i}`)}));
  return {version: 'reference-review-v1', claims: normalized, sources};
}

export function resolveReferenceReview(raw, packet) {
  if (!Array.isArray(raw?.reviews) || raw.reviews.length !== packet.claims.length) invalid();
  const rows = new Map(), references = new Map();
  for (const source of packet.sources) for (const span of source.spans) {
    references.set(span.id, {chunkId: source.chunkId, quote: span.text, start: span.start, end: span.end});
  }
  for (const row of raw.reviews) {
    if (!packet.claims.some(c => c.id === row.id) || rows.has(row.id) ||
      !['supported', 'unsupported', 'uncertain'].includes(row.verdict) ||
      typeof row.unsupportedClause !== 'string' || !Array.isArray(row.supportIds) ||
      row.supportIds.length > 12 || row.supportIds.some(id => typeof id !== 'string')) invalid();
    rows.set(row.id, row);
  }
  return packet.claims.map(claim => {
    const row = rows.get(claim.id);
    if (!row) invalid();
    const selected = row.supportIds.map(id => references.get(id));
    const valid = selected.length > 0 && new Set(row.supportIds).size === row.supportIds.length &&
      selected.every(s => s && claim.chunkIds.includes(s.chunkId)) &&
      claim.chunkIds.every(id => selected.some(s => s?.chunkId === id));
    const accepted = row.verdict === 'supported' && !row.unsupportedClause.trim() && valid;
    return {id: claim.id, accepted, verdict: row.verdict, unsupportedClause: row.unsupportedClause,
      support: valid ? selected : [], provenanceValid: valid,
      semanticVerification: 'model_judgment_not_certification'};
  });
}

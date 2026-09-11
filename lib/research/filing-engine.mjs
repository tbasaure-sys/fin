// Derived from Trama scripts/research/engine.mjs. Pure document selection only; no model client.
import { createHash } from "node:crypto";
import { SAXParser } from "parse5-sax-parser";

export const VERSION = "filing-research-local-v1";
export const hash = (x) =>
  createHash("sha256")
    .update(typeof x === "string" || Buffer.isBuffer(x) ? x : JSON.stringify(x))
    .digest("hex");
export const normalize = (x) => String(x).replace(/\s+/g, " ").trim();
export const topics = [
  {
    id: "business",
    title: "Negocio, ventajas competitivas y calidad de ingresos",
    terms: [
      "segment",
      "competition",
      "subscription",
      "revenue",
      "customer",
      "remaining performance obligations",
    ],
    question:
      "Distingue crecimiento, recurrencia, concentración y evidencia de ventajas competitivas. Separa lo que declara la gerencia de lo demostrado. Caso favorable y contraargumento.",
  },
  {
    id: "cash",
    title: "Caja, reinversión y asignación de capital",
    terms: [
      "cash flows",
      "capital expenditure",
      "property and equipment",
      "finance leases",
      "stock-based compensation",
      "repurchase",
      "debt",
    ],
    question:
      "Evalúa conversión de beneficios a caja, capex y arrendamientos, reinversión, deuda y dilución. No confundas capex total con mantenimiento ni SBC con dinero gratis. No calcules ratios sin períodos/unidades completos.",
  },
  {
    id: "thesis",
    title: "Asimetría posible, riesgos y prueba de la tesis",
    terms: [
      "risk",
      "impairment",
      "commitments",
      "uncertainty",
      "artificial intelligence",
      "margin",
      "obligations",
    ],
    question:
      "Propón una hipótesis falsable de posible ineficiencia, su explicación alternativa, riesgos de pérdida, catalizadores documentados y KPI de invalidación. Sin precio/consenso actual no puedes afirmar barato/caro ni expectativas implícitas. No inventes precio objetivo ni probabilidad.",
  },
];
export function selectFilings(recent, asOf = new Date().toISOString()) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw Error("INVALID_CUTOFF");
  const rows = recent.form
    .map((form, i) => ({
      form,
      accession: recent.accessionNumber[i],
      document: recent.primaryDocument[i],
      filedAt: recent.filingDate[i],
      acceptedAt: recent.acceptanceDateTime[i],
      periodEnd: recent.reportDate[i],
    }))
    .filter(
      (x) =>
        ["10-K", "10-Q", "10-K/A", "10-Q/A"].includes(x.form) &&
        Number.isFinite(Date.parse(x.acceptedAt)) &&
        Date.parse(x.acceptedAt) <= cutoff,
    )
    .sort(
      (a, b) =>
        Date.parse(a.acceptedAt) - Date.parse(b.acceptedAt) ||
        a.accession.localeCompare(b.accession),
    );
  const annual = rows.filter((x) => x.form === "10-K").at(-1);
  if (!annual) throw Error("NO_RECENT_ANNUAL_FILING");
  const chosen = rows.filter(
    (x) => Date.parse(x.acceptedAt) >= Date.parse(annual.acceptedAt),
  );
  if (chosen.length > 8) throw Error("DOCUMENT_BUDGET_REQUIRES_REVIEW");
  return chosen;
}
export function documentBlocks(html) {
  // Streaming tokenizer: a multi-MB iXBRL filing must not create a browser DOM.
  const parser = new SAXParser(),
    blocks = [],
    stack = [];
  let text = "",
    row = false;
  const flush = () => {
    const t = normalize(text).replace(/\s*\|\s*$/, "");
    if (t.length >= 5) blocks.push(t);
    text = "";
  };
  const block = /^(p|div|h[1-6]|li|tr|table)$/;
  parser.on("startTag", (t) => {
    const hidden =
      stack.at(-1)?.hidden ||
      ["script", "style", "noscript", "ix:hidden", "head"].includes(
        t.tagName,
      ) ||
      t.attrs.some(
        (a) =>
          a.name === "hidden" ||
          (a.name === "style" &&
            /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.value)),
      );
    if (
      !t.selfClosing &&
      !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(
        t.tagName,
      )
    )
      stack.push({ tag: t.tagName, hidden });
    if (hidden) return;
    if (block.test(t.tagName) && !row) flush();
    if (t.tagName === "tr") row = true;
    if (t.tagName === "br") text += " ";
  });
  parser.on("text", (t) => {
    if (!stack.at(-1)?.hidden) text += t.text;
  });
  parser.on("endTag", (t) => {
    const hidden = stack.at(-1)?.hidden;
    if (!hidden) {
      if (t.tagName === "td" || t.tagName === "th") text += " | ";
      if (t.tagName === "tr") {
        row = false;
        flush();
      } else if (block.test(t.tagName) && !row) flush();
    }
    const i = stack.findLastIndex((x) => x.tag === t.tagName);
    if (i >= 0) stack.length = i;
  });
  parser.end(html);
  flush();
  return blocks;
}
export function makeChunks(blocks, docId) {
  const chunks = [];
  let text = "",
    start = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (text.length + blocks[i].length > 2200 && text) {
      chunks.push({
        id: `${docId}:${start}`,
        text,
        blockStart: start,
        blockEnd: i - 1,
      });
      text = "";
      start = i;
    }
    text += (text ? "\n" : "") + blocks[i];
  }
  if (text)
    chunks.push({
      id: `${docId}:${start}`,
      text,
      blockStart: start,
      blockEnd: blocks.length - 1,
    });
  return chunks;
}
export function retrieve(chunks, topic) {
  const empirical =
    topic.id === "business"
      ? /\b(revenue|operating income) (increased|decreased|grew|declined) (by )?\$?\d/i
      : topic.id === "cash"
        ? /cash (from operations|used in \w+|provided by \w+) (increased|decreased) \$?\d/i
        : null;
  const scored = chunks
    .map((c, i) => ({
      ...c,
      i,
      score:
        topic.terms.reduce(
          (s, t) => s + (c.text.toLowerCase().includes(t) ? 1 : 0),
          0,
        ) + (empirical?.test(c.text) && /\d/.test(c.text) ? 6 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const chosen = [];
  let chars = 0;
  for (const c of scored) {
    if (chars + c.text.length > 6000) continue;
    chosen.push(c);
    chars += c.text.length;
    if (chosen.length === 3) break;
  }
  return chosen.sort((a, b) => a.i - b.i).map(({ i, score, ...c }) => c);
}

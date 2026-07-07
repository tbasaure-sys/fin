// Single source of user-facing language for AURORA.
// Components render product concepts through this map instead of engine field names.

export const VERDICT = {
  PASS: {
    label: "Pasar",
    tone: "muted",
    headline: "Esta idea todavía no merece trabajo serio.",
    sub: "O la historia no está suficientemente soportada, o el precio ya exige demasiado.",
  },
  RESEARCH: {
    label: "Investigar",
    tone: "active",
    headline: "Hay algo acá, pero falta evidencia clave.",
    sub: "Vale la pena mirarla más antes de compararla con otras ideas.",
  },
  RANK: {
    label: "Rankear",
    tone: "positive",
    headline: "La tesis tiene suficiente estructura para competir con otras ideas.",
    sub: "Puedes compararla contra tu watchlist seria.",
  },
  ABSTAIN: {
    label: "Sin veredicto",
    tone: "neutral",
    headline: "Todavía no sabes lo suficiente para decidir.",
    sub: "Falta información importante, o el análisis no es confiable para este nombre ahora.",
  },
};

export const SECTIONS = [
  { id: "implied", label: "Qué está asumiendo el precio", source: "expectations" },
  { id: "musttrue", label: "Qué tendría que ser cierto", source: "feasibility" },
  { id: "evidence", label: "Evidencia", source: "evidence" },
  { id: "review", label: "Qué revisar ahora", source: "review" },
  { id: "breaks", label: "Qué rompería la tesis", source: "falsifiers" },
];

export const LAB_SECTIONS = [
  { id: "range", label: "Rango de valoración", source: "valuation" },
  { id: "lenses", label: "Cómo se ponderó", source: "methods" },
  { id: "uncertainty", label: "Incertidumbre", source: "calibration" },
];

export const NEVER_RENDER = [
  "Priced Belief",
  "Belief Compiler",
  "Feasibility Manifold",
  "Omega Spine",
  "channel sufficiency",
  "suficiencia de canal",
  "Blackwell",
  "defeater",
  "processing gap",
  "orthogonal",
  "alpha ortogonal",
  "decision rights",
  "authorization",
  "observabilidad parcial",
  "router weights",
];

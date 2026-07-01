// Single source of user-facing language for AURORA.
// Components render product concepts through this map instead of engine field names.

export const VERDICT = {
  PASS: {
    label: "Pasar",
    tone: "muted",
    headline: "Esta idea todavia no merece trabajo serio.",
    sub: "O la historia no esta suficientemente soportada, o el precio ya exige demasiado.",
  },
  RESEARCH: {
    label: "Investigar",
    tone: "active",
    headline: "Hay algo aca, pero falta evidencia clave.",
    sub: "Vale la pena mirarla mas antes de compararla con otras ideas.",
  },
  RANK: {
    label: "Rankear",
    tone: "positive",
    headline: "La tesis tiene suficiente estructura para competir con otras ideas.",
    sub: "Puedes compararla contra tu watchlist serio.",
  },
  ABSTAIN: {
    label: "Sin veredicto",
    tone: "neutral",
    headline: "Todavia no sabes lo suficiente para decidir.",
    sub: "Falta informacion importante, o el analisis no es confiable para este nombre ahora.",
  },
};

export const SECTIONS = [
  { id: "implied", label: "Que esta asumiendo el precio", source: "expectations" },
  { id: "musttrue", label: "Que tendria que ser cierto", source: "feasibility" },
  { id: "evidence", label: "Evidencia", source: "evidence" },
  { id: "review", label: "Que revisar ahora", source: "review" },
  { id: "breaks", label: "Que romperia la tesis", source: "falsifiers" },
];

export const LAB_SECTIONS = [
  { id: "range", label: "Rango de valoracion", source: "valuation" },
  { id: "lenses", label: "Como se pondero", source: "methods" },
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

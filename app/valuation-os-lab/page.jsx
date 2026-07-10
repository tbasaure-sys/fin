"use client";

import { useEffect, useMemo, useState } from "react";
import { AuroraVerdictCard } from "@/components/aurora-verdict-card";
import { SECTIONS } from "@/lib/aurora-copy-map";
import styles from "./valuation-os-lab.module.css";
import { buildValuationRouter, MODEL_LABELS } from "../../lib/valuation-router.js";

const companies = {
  compounder: {
    ticker: "CONST",
    name: "Constellation Software",
    sector: "Vertical market software",
    price: 3320,
    baseFcf: 112,
    revenueCagr: 0.095,
    margin: 0.295,
    roic: 0.24,
    terminalRoic: 0.17,
    wacc: 0.085,
    terminalGrowth: 0.027,
    reinvestment: 0.43,
    dilution: -0.006,
    moatHalfLife: 11,
    thesisQuality: 0.84,
    demandSupply: 0.76,
    bottleneckPower: 0.63,
    dataQuality: 0.81,
    modelRisk: 0.23,
    beta: 0.76,
  },
  cyclical: {
    ticker: "CYCLE",
    name: "Semiconductor Equipment",
    sector: "Capacity-cycle industrial tech",
    price: 178,
    baseFcf: 8.6,
    revenueCagr: 0.065,
    margin: 0.225,
    roic: 0.19,
    terminalRoic: 0.13,
    wacc: 0.091,
    terminalGrowth: 0.024,
    reinvestment: 0.52,
    dilution: 0.003,
    moatHalfLife: 6,
    thesisQuality: 0.82,
    demandSupply: 0.88,
    bottleneckPower: 0.91,
    dataQuality: 0.74,
    modelRisk: 0.36,
    beta: 1.18,
  },
  bank: {
    ticker: "COREB",
    name: "Regional Bank",
    sector: "Credit and deposit beta",
    price: 48,
    baseFcf: 4.2,
    revenueCagr: 0.035,
    margin: 0.165,
    roic: 0.12,
    terminalRoic: 0.105,
    wacc: 0.102,
    terminalGrowth: 0.018,
    reinvestment: 0.36,
    dilution: 0.007,
    moatHalfLife: 3.8,
    thesisQuality: 0.52,
    demandSupply: 0.46,
    bottleneckPower: 0.28,
    dataQuality: 0.69,
    modelRisk: 0.44,
    beta: 1.34,
  },
};

const assumptionSchema = [
  {
    key: "revenueCagr",
    label: "Crecimiento de ingresos, años 1-5",
    fmt: "pct",
    low: 0.01,
    high: 0.18,
    falsifier: "El crecimiento queda bajo esta ruta por dos reportes seguidos.",
    source: "Ventas, pedidos y demanda de clientes",
  },
  {
    key: "margin",
    label: "Margen operativo, año 5",
    fmt: "pct",
    low: 0.08,
    high: 0.42,
    falsifier: "El margen cae aunque la mezcla de productos, la escala o los precios deberían ayudar.",
    source: "Resultado operativo después de ajustes contables",
  },
  {
    key: "roic",
    label: "Rentabilidad sobre el capital (ROIC), año 5",
    fmt: "pct",
    low: 0.06,
    high: 0.34,
    falsifier: "La nueva inversión rinde menos que el retorno mínimo exigido durante varios períodos.",
    source: "Resultado operativo y capital invertido",
  },
  {
    key: "terminalRoic",
    label: "Rentabilidad sobre el capital a largo plazo",
    fmt: "pct",
    low: 0.06,
    high: 0.24,
    falsifier: "La competencia aumenta y la empresa ya no puede mantener sus precios.",
    source: "Historia, empresas comparables y competencia",
  },
  {
    key: "wacc",
    label: "Retorno mínimo exigido (WACC)",
    fmt: "pct",
    low: 0.055,
    high: 0.14,
    falsifier: "Las tasas, la deuda o el riesgo del negocio cambian el retorno mínimo exigido.",
    source: "Tasas, riesgo del mercado y deuda",
  },
  {
    key: "terminalGrowth",
    label: "Crecimiento de largo plazo",
    fmt: "pct",
    low: 0.005,
    high: 0.04,
    falsifier: "La empresa necesitaría demasiada reinversión para sostener crecimiento.",
    source: "Inflación, mercado total, saturación",
  },
  {
    key: "reinvestment",
    label: "Caja reinvertida",
    fmt: "pct",
    low: 0.15,
    high: 0.72,
    falsifier: "El crecimiento queda en el papel mientras la inversión o el capital de trabajo se reducen.",
    source: "Inversión, capital de trabajo y adquisiciones",
  },
  {
    key: "dilution",
    label: "Dilución accionaria",
    fmt: "pct",
    low: -0.02,
    high: 0.035,
    falsifier: "Las recompras no impiden que aumente el número de acciones.",
    source: "Compensación en acciones, recompras y opciones",
  },
  {
    key: "thesisQuality",
    label: "Evidencia de calidad del negocio",
    fmt: "score",
    low: 0.2,
    high: 0.95,
    falsifier: "Los clientes, el producto o la rentabilidad por cliente empeoran.",
    source: "Ventaja competitiva, clientes y ejecución",
  },
  {
    key: "demandSupply",
    label: "Demanda vs oferta",
    fmt: "score",
    low: 0.15,
    high: 0.95,
    falsifier: "La demanda se desacelera o aparece nueva oferta antes de que la empresa ajuste sus precios.",
    source: "Pedidos, capacidad, inventario y precios",
  },
  {
    key: "bottleneckPower",
    label: "Ventaja por escasez",
    fmt: "score",
    low: 0.1,
    high: 0.98,
    falsifier: "Los clientes encuentran sustitutos o la capacidad deja de ser escasa.",
    source: "Escasez, sustitutos, costos de cambio y plazos de entrega",
  },
  {
    key: "moatHalfLife",
    label: "Durabilidad de ventaja",
    fmt: "yrs",
    low: 1,
    high: 15,
    falsifier: "ROIC cae más rápido que en empresas comparables.",
    source: "Persistencia histórica de ROIC sobre WACC",
  },
];

const engines = [
  ["truth", "Fuentes", "¿Los datos son completos y rastreables?"],
  ["accounting", "Caja y retornos", "¿El negocio gana más que su WACC?"],
  ["twin", "Qué debe ser cierto", "¿Qué tendría que ser cierto para que funcione?"],
  ["bayes", "Escenarios", "¿Cuánta incertidumbre hay que admitir?"],
  ["value", "Valor", "¿Hay margen de seguridad suficiente?"],
  ["expect", "Expectativas del precio", "¿Qué crecimiento y rentabilidad ya supone el precio?"],
  ["flows", "Factores que mueven el precio", "¿Qué puede mover la acción aunque el negocio no cambie?"],
  ["calibration", "Confianza de la lectura", "¿Qué tan confiable es esta lectura?"],
];

const SIMPLE_MODEL_LABELS = {
  dcf: "Valor por caja futura",
  roicFade: "Duración de la rentabilidad",
  reverseDcf: "Expectativas implícitas",
  residualIncome: "Retorno sobre el capital contable",
  assetValue: "Piso de activos",
  unitEconomics: "Rentabilidad por cliente",
  bottleneck: "Ventaja por escasez",
  realOptions: "Posibles oportunidades futuras",
  ownerEarnings: "Caja que queda para el dueño",
  capitalCycle: "Ciclo de oferta",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function scaleDriver(value, factor, offset = 0) {
  return isFiniteNumber(value) ? value * factor + offset : value;
}

function fmtPct(value, digits = 1) {
  if (!isFiniteNumber(value)) return "N/A";
  return `${(value * 100).toFixed(digits)}%`;
}

function fmtMoney(value) {
  if (!isFiniteNumber(value)) return "N/A";
  if (value >= 1000) return `$${value.toFixed(0)}`;
  if (value >= 100) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

function fmtValue(value, fmt) {
  if (!isFiniteNumber(value)) return "N/A";
  if (fmt === "pct") return fmtPct(value);
  if (fmt === "yrs") return `${value.toFixed(1)}a`;
  if (fmt === "score") return `${Math.round(value * 100)}/100`;
  return value.toFixed(2);
}

function driverOr(current, key) {
  return isFiniteNumber(current?.[key]) ? current[key] : companies.compounder[key];
}

function coreDcfValue(drivers) {
  const required = [
    drivers.baseFcf,
    drivers.revenueCagr,
    drivers.margin,
    drivers.terminalRoic,
    drivers.wacc,
    drivers.terminalGrowth,
    drivers.reinvestment,
    drivers.moatHalfLife,
    drivers.dilution,
    drivers.thesisQuality,
    drivers.demandSupply,
    drivers.bottleneckPower,
  ];
  if (required.some((value) => !isFiniteNumber(value))) return null;
  const thesisMultiplier = 0.88 + drivers.thesisQuality * 0.24;
  const demandMultiplier = 0.9 + drivers.demandSupply * 0.22;
  const bottleneckMultiplier = 0.94 + drivers.bottleneckPower * 0.16;
  const effectiveCagr = clamp(drivers.revenueCagr * demandMultiplier * bottleneckMultiplier, -0.04, 0.24);
  const growthPower = Math.pow(1 + effectiveCagr, 5);
  const marginQuality = 0.72 + drivers.margin * 1.25;
  const roicSpread = Math.max(0, drivers.terminalRoic - drivers.wacc);
  const reinvestmentRelief = 1 - drivers.bottleneckPower * 0.08;
  const reinvestmentDrag = 1 - clamp(drivers.reinvestment * 0.34 * reinvestmentRelief, 0.035, 0.28);
  const moatMultiplier = 1 + clamp((drivers.moatHalfLife / 30) * thesisMultiplier, 0.03, 0.62);
  const terminalDenominator = Math.max(0.026, drivers.wacc - drivers.terminalGrowth);
  const steadyFcf = drivers.baseFcf * growthPower * marginQuality * reinvestmentDrag;
  const terminal = steadyFcf * (1 + drivers.terminalGrowth) / terminalDenominator;
  const structuralBonus = 1 + (drivers.thesisQuality + drivers.demandSupply + drivers.bottleneckPower - 1.5) * 0.08;
  const fadeBonus = (1 + roicSpread * 2.5 * moatMultiplier) * structuralBonus;
  const dilutionPenalty = Math.pow(1 + drivers.dilution, 5);
  return (steadyFcf * 4.2 + terminal * 0.62 * fadeBonus) / dilutionPenalty;
}

function methodValuations(drivers) {
  const dcf = coreDcfValue(drivers);
  if (!isFiniteNumber(dcf)) return null;
  const modelRisk = isFiniteNumber(drivers.modelRisk) ? drivers.modelRisk : 0.35;
  const roicSpread =
    isFiniteNumber(drivers.terminalRoic) && isFiniteNumber(drivers.wacc)
      ? drivers.terminalRoic - drivers.wacc
      : 0;
  const structuralAverage =
    (driverOr(drivers, "thesisQuality") + driverOr(drivers, "demandSupply") + driverOr(drivers, "bottleneckPower")) / 3;
  const marketAnchor = isFiniteNumber(drivers.price)
    ? drivers.price * (0.86 + structuralAverage * 0.16 + clamp(drivers.revenueCagr || 0, -0.02, 0.18) * 0.7)
    : dcf * 0.92;
  const residualIncome =
    (drivers.baseFcf / Math.max(0.045, drivers.wacc - drivers.terminalGrowth * 0.35)) *
    clamp(0.5 + Math.max(0, roicSpread) * 3.2 + drivers.margin * 0.35, 0.45, 1.45);
  const assetValue = drivers.baseFcf * clamp(7.2 + drivers.margin * 13 - modelRisk * 3.5, 5.5, 14);
  const unitEconomics = dcf * clamp(0.78 + drivers.thesisQuality * 0.18 + drivers.demandSupply * 0.14 + drivers.revenueCagr * 0.55, 0.72, 1.22);
  const bottleneck = dcf * clamp(0.8 + drivers.bottleneckPower * 0.28 + drivers.demandSupply * 0.1, 0.78, 1.22);
  const realOptions = dcf * clamp(0.72 + drivers.thesisQuality * 0.17 + clamp(drivers.revenueCagr, -0.02, 0.18) * 1.15 + modelRisk * 0.08, 0.68, 1.24);
  const ownerEarnings = dcf * clamp(0.86 + drivers.margin * 0.32 + Math.max(0, 0.55 - drivers.reinvestment) * 0.18 - modelRisk * 0.1, 0.68, 1.26);
  const capitalCycle = dcf * clamp(0.9 + drivers.demandSupply * 0.15 + drivers.bottleneckPower * 0.1 - drivers.reinvestment * 0.16, 0.68, 1.24);

  return {
    dcf,
    roicFade: dcf * clamp(0.84 + Math.max(0, roicSpread) * 2.6 + drivers.moatHalfLife / 70, 0.74, 1.28),
    reverseDcf: marketAnchor,
    residualIncome,
    assetValue,
    unitEconomics,
    bottleneck,
    realOptions,
    ownerEarnings,
    capitalCycle,
  };
}

function valueAt(drivers, router = buildValuationRouter(drivers)) {
  const methods = methodValuations(drivers);
  if (!methods) return null;
  const weights = router?.methodWeights || {};
  const weighted = Object.entries(weights).reduce((sum, [key, weight]) => {
    const value = methods[key];
    return isFiniteNumber(value) ? sum + value * weight : sum;
  }, 0);
  return weighted > 0 ? weighted : methods.dcf;
}

function impliedCagrForPrice(drivers, router) {
  if (!isFiniteNumber(drivers.price) || !isFiniteNumber(drivers.baseFcf)) return null;
  let best = drivers.revenueCagr;
  let bestGap = Infinity;
  for (let cagr = -0.02; cagr <= 0.22; cagr += 0.001) {
    const candidate = valueAt({ ...drivers, revenueCagr: cagr }, router);
    const gap = Math.abs(candidate - drivers.price);
    if (gap < bestGap) {
      best = cagr;
      bestGap = gap;
    }
  }
  return best;
}

function buildDistribution(drivers, valuation) {
  if (!isFiniteNumber(valuation) || !isFiniteNumber(drivers.price)) {
    return { rows: [], p10: null, p50: null, p90: null, probAbovePrice: null };
  }
  const rows = Array.from({ length: 41 }, (_, index) => {
    const z = (index - 20) / 6;
    const x = valuation * (1 + z * (0.08 + drivers.modelRisk * 0.14));
    const shape = Math.exp(-0.5 * z * z) * (0.72 + Math.sin(index * 1.8) * 0.06);
    return { x, y: Math.max(0.03, shape) };
  });
  const sorted = rows.map((row) => row.x).sort((a, b) => a - b);
  return {
    rows,
    p10: sorted[4],
    p50: sorted[20],
    p90: sorted[36],
    probAbovePrice: clamp(0.5 + (valuation / drivers.price - 1) * 0.9, 0.03, 0.97),
  };
}

function buildSurface(drivers, router) {
  const cagrValues = Array.from({ length: 7 }, (_, i) => 0.02 + i * 0.025);
  const roicValues = Array.from({ length: 6 }, (_, i) => 0.08 + i * 0.025);
  return roicValues
    .slice()
    .reverse()
    .map((roic) =>
      cagrValues.map((cagr) => {
        const v = valueAt({ ...drivers, revenueCagr: cagr, terminalRoic: roic }, router);
        const ratio =
          isFiniteNumber(v) && isFiniteNumber(drivers.price)
            ? clamp((v / drivers.price - 0.55) / 1.4, 0, 1)
            : null;
        return { cagr, roic, v, ratio };
      }),
    );
}

function SparkBars({ rows, price }) {
  if (!rows.length) {
    return <div className={styles.emptyChart}>Carga los drivers requeridos para activar la valoración.</div>;
  }
  const max = Math.max(...rows.map((row) => row.y));
  return (
    <div className={styles.histogram} aria-label="Possible value range">
      {rows.map((row, index) => (
        <span
          key={index}
          style={{
            height: `${Math.max(6, (row.y / max) * 100)}%`,
            opacity: row.x > price ? 0.98 : 0.42,
          }}
          title={`${fmtMoney(row.x)} per share`}
        />
      ))}
      <i style={{ left: "50%" }} />
    </div>
  );
}

function Surface({ surface, price }) {
  const hasValidSurface = surface.flat().some((cell) => isFiniteNumber(cell.v) && isFiniteNumber(price));
  return (
    <div className={styles.surfaceWrap}>
      <div className={styles.yAxis}>Rentabilidad de largo plazo</div>
      <div className={`${styles.surfaceGrid} ${hasValidSurface ? "" : styles.surfaceGridDisabled}`}>
        {surface.flat().map((cell) => {
          const validCell = isFiniteNumber(cell.v) && isFiniteNumber(price);
          const ratio = validCell ? cell.ratio : 0;
          const hue = 24 + ratio * 160;
          const alpha = 0.2 + ratio * 0.58;
          return (
            <div
              key={`${cell.cagr}-${cell.roic}`}
              className={`${styles.surfaceCell} ${validCell ? "" : styles.surfaceCellDisabled}`}
              style={{ background: `hsla(${hue}, 62%, 48%, ${alpha})` }}
              title={`CAGR ${fmtPct(cell.cagr)} / ROIC ${fmtPct(cell.roic)} -> ${fmtMoney(cell.v)}`}
            >
              <span>{validCell ? Math.round((cell.v / price) * 100) : "N/A"}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.xAxis}>Revenue growth, years 1-5</div>
    </div>
  );
}

function MiniLine({ points, tone = "teal" }) {
  const width = 220;
  const height = 72;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const d = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((value - min) / Math.max(0.001, max - min)) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className={styles.miniLine} viewBox={`0 0 ${width} ${height}`} role="img">
      <path d={d} data-tone={tone} />
    </svg>
  );
}

function RangeBar({ value, low, high }) {
  const pos = clamp((value - low) / Math.max(0.001, high - low), 0, 1) * 100;
  return (
    <div className={styles.rangeBar}>
      <span style={{ left: `${pos}%` }} />
    </div>
  );
}

function fmtOptional(value, formatter) {
  return isFiniteNumber(value) ? formatter(value) : "Faltante";
}

function factMoney(value) {
  if (!isFiniteNumber(value)) return "Faltante";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  return fmtMoney(value);
}

function statusCopy(status) {
  if (status === "ok") return "Lectura completa: revisión final disponible";
  if (status === "rate_limited") return "Lectura disponible; la revisión final está temporalmente pausada";
  if (status === "error") return "Lectura disponible; la revisión final no pudo completarse";
  if (status === "unavailable") return "Lectura local disponible; no hay revisión externa conectada";
  return "Lectura inicial disponible";
}

function adoptionStatusLabel(status) {
  return (
    {
      ready: "Usar como lectura principal",
      guardrailed: "Usar con cautela",
      shadow: "Mostrar como referencia",
      observe: "Seguir reuniendo resultados",
      blocked: "No usar para decidir",
      missing: "Aún no disponible",
    }[status] || "Revisar"
  );
}

function branchLabel(branch) {
  return (
    {
      calibrated: "Valor ajustado",
      raw: "Valor original",
      none: "Sin rama secundaria",
    }[branch] || String(branch || "Valor original").replaceAll("_", " ")
  );
}

function checklistLabel(status) {
  return (
    {
      pass: "OK",
      warn: "Revisar",
      fail: "Falta",
      unknown: "Sin dato",
    }[status] || "Revisar"
  );
}

function buildLocalAdoptionPreview({ adjustedDrivers, feasibility, quality, mode, debate }) {
  const risk = clamp(adjustedDrivers.modelRisk || 0.35, 0, 1);
  const score = clamp(quality * 0.45 + feasibility * 0.35 + (1 - risk) * 0.2, 0, 1);
  const status =
    score >= 0.72 && debate?.agents?.length
      ? "guardrailed"
      : score >= 0.52
        ? "shadow"
        : "observe";
  return {
    version: "valuation_os_local_adoption_preview_v1",
    status,
    decisionUse:
      status === "guardrailed"
        ? "calibrated_with_raw_check"
        : status === "shadow"
          ? "raw_primary_calibrated_shadow"
          : "raw_primary_collect_outcomes",
    canPromote: false,
    canStage: status === "guardrailed",
    mustUseRawPrimary: status !== "guardrailed",
    mustAbstain: false,
    adoption: {
      primaryBranch: status === "guardrailed" ? "calibrated" : "raw",
      calibratedWeight: status === "guardrailed" ? Math.min(0.45, score * 0.55) : 0,
      rawWeight: status === "guardrailed" ? Math.max(0.55, 1 - score * 0.55) : 1,
      shadowWeight: status === "shadow" ? Math.min(0.55, score) : 0,
      maxPositionSizeMultiplier: status === "guardrailed" ? Math.min(0.35, score * 0.42) : 0,
    },
    evidence: {
      authorityScore: score,
      evidenceTier: "preview_only",
      scoredRecords: 0,
      minRecords: 12,
      contextualApplied: false,
      activeSegment: { label: `${adjustedDrivers.sector || "Negocio"} / caso ${mode}` },
      requiredEvidence: ["12 realized outcomes before calibrated output can become primary"],
    },
    checklist: [
      {
        id: "realized_outcomes",
        label: "Resultados reales",
        status: "fail",
        observed: 0,
        target: 12,
        message: "Faltan resultados reales para saber si la lectura funciona fuera de muestra.",
      },
      {
        id: "raw_comparison",
        label: "Comparar contra original",
        status: "warn",
        observed: status,
        target: "ready",
        message: "Hasta tener historial, muestra el ajuste calibrado solo como comparacion.",
      },
      {
        id: "final_review",
        label: "Revision final",
        status: debate?.agents?.length ? "pass" : "warn",
        observed: debate?.agents?.length ? "complete" : "pending",
        target: "complete",
        message: debate?.agents?.length ? "La revisión local ya corrió." : "Corre la revisión final antes de leerlo como tesis.",
      },
    ],
    blockers: status === "observe" ? ["realized_outcomes"] : [],
    warnings: ["Preview local: el permiso real requiere historial de resultados."],
    memo: {
      headline: `${adoptionStatusLabel(status)}; vista preliminar.`,
      explanation: "Esta vista muestra cómo cambia la lectura, pero no reemplaza resultados reales.",
      nextStep: "Guardar predicciones y comparar contra resultados futuros.",
    },
  };
}

function plainDecision(upside, feasibility, missingDrivers) {
  if (missingDrivers.length) return "Incompleta";
  if (!isFiniteNumber(upside)) return "Faltan datos";
  if (upside > 0.15 && feasibility > 0.55) return "Atractiva, verificar";
  if (upside < -0.1) return "Precio exigente";
  return "Caso ajustado";
}

function operationalVerdict({ missingDrivers, valuationRouter, upside, feasibility, quality, tripwires }) {
  if (missingDrivers.length) {
    return {
      tier: "ABSTAIN",
      reason: `Faltan datos clave: ${missingDrivers.slice(0, 3).join(", ")}.`,
      nextStep: "Completar los inputs faltantes antes de comparar esta idea.",
    };
  }
  if (valuationRouter?.abstain) {
    return {
      tier: "ABSTAIN",
      reason: valuationRouter.decision?.reason || "La mezcla de datos y métodos no da una lectura confiable.",
      nextStep: "Revisar fuentes, supuestos y calidad de datos.",
    };
  }
  if (!isFiniteNumber(upside)) {
    return {
      tier: "ABSTAIN",
      reason: "No hay suficiente información para estimar la brecha entre precio y valor.",
      nextStep: "Cargar una empresa o completar FCF, precio, WACC y crecimiento.",
    };
  }
  if (upside < -0.1) {
    return {
      tier: "PASS",
      reason: "El precio ya exige demasiado frente al valor estimado.",
      nextStep: "Archivar o esperar una mejor entrada de precio/evidencia.",
    };
  }
  if (feasibility < 0.34 && upside > 0.1) {
    return {
      tier: "RESEARCH",
      reason: "La diferencia positiva depende de una tesis mucho más optimista que lo que el precio supone.",
      nextStep: "Revisar crecimiento, rentabilidad, margen y reinversión antes de darle prioridad.",
    };
  }
  if (feasibility < 0.34) {
    return {
      tier: "ABSTAIN",
      reason: "La empresa tendría que cumplir demasiados supuestos y la diferencia de valor no compensa ese riesgo.",
      nextStep: "Revisar supuestos antes de tomar una postura.",
    };
  }
  if (upside > 0.16 && feasibility > 0.58 && quality > 0.58 && tripwires.length <= 3) {
    return {
      tier: "RANK",
      reason: "La diferencia frente al precio y la calidad de los datos permiten compararla con otras empresas.",
      nextStep: "Compararla con otras empresas y definir qué te haría cambiar de opinión.",
    };
  }
  return {
    tier: "RESEARCH",
    reason: "La empresa tiene aspectos interesantes, pero todavía necesita datos concretos.",
    nextStep: "Revisar los puntos críticos antes de darle prioridad.",
  };
}

function buildOperationalLadder({
  adjustedDrivers,
  impliedCagr,
  upside,
  feasibility,
  quality,
  tripwires,
  missingDrivers,
  liveSnapshot,
  valuationRouter,
}) {
  const priceNeedsGrowth = isFiniteNumber(impliedCagr) && impliedCagr > 0;
  const thesisMuchHigherThanPrice =
    isFiniteNumber(impliedCagr) &&
    isFiniteNumber(adjustedDrivers.revenueCagr) &&
    adjustedDrivers.revenueCagr > impliedCagr + 0.06;
  const roicBelowHurdle =
    isFiniteNumber(adjustedDrivers.roic) &&
    isFiniteNumber(adjustedDrivers.wacc) &&
    adjustedDrivers.roic < adjustedDrivers.wacc;
  const reinvestmentHeavy = isFiniteNumber(adjustedDrivers.reinvestment) && adjustedDrivers.reinvestment >= 0.85;
  const implied = [
    priceNeedsGrowth
      ? `El precio necesita cerca de ${fmtPct(impliedCagr)} de crecimiento anual de ingresos para que la historia cierre.`
      : `El precio no está exigiendo crecimiento alto: crecimiento anual implícito ${fmtPct(impliedCagr)}.`,
    `La tesis actual usa ${fmtPct(adjustedDrivers.revenueCagr)} de crecimiento anual de ingresos y ${fmtPct(adjustedDrivers.margin)} de margen operativo.`,
    thesisMuchHigherThanPrice
      ? "La brecha positiva viene de una tesis mucho más optimista que el precio, no de un precio exigente."
      : isFiniteNumber(upside) && upside >= 0
      ? `El valor estimado queda ${fmtPct(upside)} sobre el precio actual.`
      : `El precio actual ya parece exigir más que el caso base.`,
  ];

  const mustTrue = [
    roicBelowHurdle
      ? `ROIC está bajo WACC: ${fmtPct(adjustedDrivers.roic)} vs ${fmtPct(adjustedDrivers.wacc)}. Hay que explicar cómo vuelve a crear valor.`
      : `ROIC debe mantenerse por encima de WACC: ${fmtPct(adjustedDrivers.roic)} vs ${fmtPct(adjustedDrivers.wacc)}.`,
    reinvestmentHeavy
      ? `La tesis reinvierte casi todo el FCF: ${fmtPct(adjustedDrivers.reinvestment)}. Debe probar retorno incremental alto.`
      : `La reinversión debe sostener crecimiento sin comerse el FCF: ${fmtPct(adjustedDrivers.reinvestment)} reinvertido.`,
    `La ventaja competitiva debe durar cerca de ${fmtValue(adjustedDrivers.moatHalfLife, "yrs")}.`,
  ];

  const evidenceFor = [
    quality >= 0.62 ? "Datos suficientemente rastreables para una primera lectura." : null,
    adjustedDrivers.thesisQuality >= 0.68 ? "Calidad de tesis por encima del punto medio." : null,
    adjustedDrivers.demandSupply >= 0.65 ? "Oferta/demanda apoya la historia actual." : null,
    adjustedDrivers.bottleneckPower >= 0.62 ? "Hay señales de escasez o de que cambiar de proveedor sería costoso." : null,
  ].filter(Boolean);

  const evidenceAgainst = [
    adjustedDrivers.modelRisk >= 0.4 ? "Desacuerdo alto entre métodos o supuestos." : null,
    feasibility < 0.5 ? "Los supuestos son poco razonables: revisa la tesis antes de compararla." : null,
    thesisMuchHigherThanPrice ? "La tesis asume mucho más crecimiento que el precio implícito." : null,
    roicBelowHurdle ? "ROIC está por debajo de WACC." : null,
    reinvestmentHeavy ? "La reinversión consume casi todo el FCF." : null,
    tripwires.length ? `${tripwires.length} supuestos están cerca de zona de alerta.` : null,
    missingDrivers.length ? "Faltan inputs específicos del ticker." : null,
  ].filter(Boolean);

  const review = [
    missingDrivers.length ? `Completar: ${missingDrivers.slice(0, 3).join(", ")}.` : null,
    adjustedDrivers.modelRisk >= 0.35 ? "Revisar por qué los métodos discrepan." : null,
    thesisMuchHigherThanPrice ? "Comprobar si la empresa puede sostener una ruta muy superior a la implícita en precio." : null,
    roicBelowHurdle ? "Identificar qué cambio haría que ROIC vuelva a superar WACC." : null,
    reinvestmentHeavy ? "Separar reinversión de mantenimiento vs crecimiento real." : null,
    adjustedDrivers.demandSupply < 0.62 ? "Buscar datos de demanda, capacidad, inventario o precios." : null,
    liveSnapshot?.coverage?.braveConfigured === false ? "Agregar evidencia externa de noticias o catalizadores." : null,
    valuationRouter?.decision?.reason || null,
  ].filter(Boolean).slice(0, 4);

  const breaks = (tripwires.length ? tripwires : []).slice(0, 4).map((item) => item.falsifier);
  if (!breaks.length) {
    breaks.push("Dos reportes seguidos bajo la ruta de crecimiento asumida.");
    breaks.push("El margen bruto cae más de 3 puntos sin explicación de productos o precios.");
    breaks.push("ROIC incremental cae bajo WACC.");
  }

  return { implied, mustTrue, evidenceFor, evidenceAgainst, review, breaks };
}

function EngineMetric({ label, value, tone }) {
  return (
    <div className={styles.engineMetric} data-tone={tone || "neutral"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RouterPanel({ router }) {
  if (!router) return null;
  return (
    <section className={styles.routerPanel} aria-label="Cómo se calcula">
      <div>
        <span>Cómo se calcula</span>
        <h2>Por qué se usan estas referencias</h2>
        <p>
          No todas las empresas se valoran igual. Una entidad financiera, una compañía de software y un fabricante industrial necesitan referencias distintas.
        </p>
      </div>
      <div className={styles.routerGrid}>
        <article>
          <strong>Tipo de negocio</strong>
          {router.topRegimes.map((item) => (
            <div className={styles.routerRow} key={item.key}>
              <span>{item.label}</span>
              <i>{fmtPct(item.weight, 0)}</i>
            </div>
          ))}
        </article>
        <article>
          <strong>Referencias usadas</strong>
          {router.topModels.map((item) => (
            <div className={styles.routerRow} key={item.key}>
              <span>{SIMPLE_MODEL_LABELS[item.key] || MODEL_LABELS[item.key] || item.label}</span>
              <i>{fmtPct(item.weight, 0)}</i>
            </div>
          ))}
        </article>
        <article>
          <strong>¿Se puede usar?</strong>
          <div className={styles.routerDecision} data-abstain={router.abstain ? "true" : "false"}>
            <span>{router.abstain ? "Aún falta evidencia" : "Usable como vista preliminar"}</span>
            <i>{fmtPct(router.confidence, 0)} confianza</i>
          </div>
          <p>{router.rationale?.[2] || "Este panel explica la mezcla; no toma la decisión de inversión por sí solo."}</p>
        </article>
      </div>
    </section>
  );
}

function BulletList({ items }) {
  const visibleItems = items.filter(Boolean).slice(0, 5);
  if (!visibleItems.length) return null;
  return (
    <ul className={styles.bulletList}>
      {visibleItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CalibrationContract({ adjustedDrivers, feasibility, quality, mode, debate, adoptionGate }) {
  const gate = adoptionGate || buildLocalAdoptionPreview({ adjustedDrivers, feasibility, quality, mode, debate });
  const authorityScore = gate.evidence?.authorityScore ?? gate.authorityScore ?? 0;
  const scoredRecords = gate.evidence?.scoredRecords ?? null;
  const minRecords = gate.evidence?.minRecords ?? null;
  const activeSegment = gate.evidence?.activeSegment?.label || `${adjustedDrivers.sector || "Negocio"} / caso ${mode}`;
  const primaryBranch = gate.adoption?.primaryBranch || gate.productRead?.primaryBranch || "raw";
  const calibratedWeight = gate.adoption?.calibratedWeight ?? 0;
  const rawWeight = gate.adoption?.rawWeight ?? (primaryBranch === "raw" ? 1 : 1 - calibratedWeight);
  const shadowWeight = gate.adoption?.shadowWeight ?? 0;
  const checklist = (gate.checklist || []).slice(0, 6);
  const rows = [
    {
      label: "Permiso actual",
      value: adoptionStatusLabel(gate.status),
        note: gate.memo?.explanation || "Define si la lectura ajustada puede usarse, verse solo como comparación o bloquearse.",
    },
    {
      label: "Grupo comparable",
      value: activeSegment,
      note: "La confianza debe medirse contra empresas y horizontes parecidos, no contra todo mezclado.",
    },
    {
      label: "Historial requerido",
      value: scoredRecords === null ? "Sin historial" : `${scoredRecords}/${minRecords || "?"} resultados`,
      note: gate.memo?.nextStep || "Guardar resultados reales permite saber si los rangos fueron honestos.",
    },
  ];

  return (
    <div className={styles.calibrationContract} aria-label="Confianza de la lectura">
      <div>
        <span>Confianza de la lectura</span>
        <strong>{adoptionStatusLabel(gate.status)}</strong>
        <p>
          Este panel muestra qué tan confiable es la lectura y si debe usarse como referencia o como base principal. Sin resultados suficientes, el valor original sigue siendo la lectura principal.
        </p>
        <div className={styles.branchMix}>
          <div>
            <span>Rama principal</span>
            <strong>{branchLabel(primaryBranch)}</strong>
          </div>
          <div>
            <span>Peso ajustado</span>
            <strong>{fmtPct(calibratedWeight, 0)}</strong>
          </div>
          <div>
            <span>Peso original</span>
            <strong>{fmtPct(rawWeight, 0)}</strong>
          </div>
          <div>
            <span>Solo como referencia</span>
            <strong>{fmtPct(shadowWeight, 0)}</strong>
          </div>
          <div>
            <span>Fuerza de evidencia</span>
            <strong>{fmtPct(authorityScore, 0)}</strong>
          </div>
        </div>
      </div>
      <div className={styles.calibrationSteps}>
        {rows.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.note}</p>
          </article>
        ))}
      </div>
      {checklist.length ? (
        <div className={styles.calibrationChecklist}>
          {checklist.map((item) => (
            <article key={item.id || item.label} data-status={item.status || "unknown"}>
              <div>
                <span>{checklistLabel(item.status)}</span>
                <strong>{item.label}</strong>
              </div>
              <p>{item.message}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EngineConsole({
  activeEngine,
  adjustedDrivers,
  distribution,
  expectedIrr,
  feasibility,
  impliedCagr,
  liveSnapshot,
  missingDrivers,
  mode,
  onRunDebate,
  quality,
  tripwires,
  upside,
  valuation,
  debate,
  debateStatus,
}) {
  const calibrationGate =
    liveSnapshot?.calibrationAdoptionGate || liveSnapshot?.calibrationIntegration?.calibrationAdoptionGate || null;
  const activeCalibrationGate =
    calibrationGate || buildLocalAdoptionPreview({ adjustedDrivers, feasibility, quality, mode, debate });
  const coverage = liveSnapshot?.coverage || {};
  const facts = liveSnapshot?.facts || {};
  const assumptions = liveSnapshot?.assumptions || {};
  const fiscalYear = liveSnapshot?.company?.fiscalYear || "latest";
  const activeFalsifiers = tripwires.map((item) => item.falsifier || item.label);
  const panels = {
    truth: {
      eyebrow: "Confiabilidad de los datos",
      title: "Fuentes y trazabilidad",
      copy:
        missingDrivers.length > 0
          ? "Faltan datos actuales, por lo que la valoración debe leerse como borrador."
          : "Los datos principales están presentes y se pueden rastrear a sus fuentes.",
      plain: "¿Podemos confiar en los números antes de leer la valoración?",
      technical: "Revisa la fecha, la fuente del precio, la tasa utilizada y los datos que faltan.",
      metrics: [
        ["Último informe", liveSnapshot ? `${liveSnapshot.company?.form || "SEC"} / FY${fiscalYear}` : "Datos de ejemplo"],
        ["Política sectorial", assumptions.industry?.label || "Supuesto de ejemplo"],
        ["Precio", coverage.quoteSource || "Faltante"],
        ["Calidad de datos", fmtPct(quality, 0), quality >= 0.65 ? "good" : "warn"],
      ],
      bullets: [
        liveSnapshot
          ? `Datos financieros: ${coverage.secCompanyFacts ? "cargados" : "no cargados"}`
          : "Se usa una empresa de ejemplo hasta cargar un snapshot SEC real.",
        assumptions.riskFree
          ? `Tasa de referencia: ${fmtOptional(assumptions.riskFree.value, fmtPct)} desde ${assumptions.riskFree.source}.`
          : coverage.fredConfigured
            ? "La fuente de tasa libre de riesgo está configurada."
            : "La fuente de tasa libre de riesgo no está configurada.",
        assumptions.industry?.sicDescription ? `Industria: ${assumptions.industry.sicDescription}.` : null,
        coverage.quoteSource ? `Fuente de precio disponible: ${coverage.quoteSource}.` : "La fuente de precio falta o no respondió.",
        isFiniteNumber(facts.revenue) ? `Ingresos: ${factMoney(facts.revenue)}` : null,
        missingDrivers.length ? `Faltante: ${missingDrivers.join(", ")}` : null,
      ],
    },
    accounting: {
      eyebrow: "Caja y retornos",
      title: "FCF, ROIC y WACC",
      copy:
        "Los estados financieros se traducen a caja, márgenes y retorno sobre capital.",
      plain: "¿El negocio produce caja valiosa?",
      technical: "Compara caja, margen, rentabilidad, reinversión y crecimiento de largo plazo.",
      metrics: [
        ["Caja por acción", fmtMoney(adjustedDrivers.baseFcf)],
        ["Crecimiento de ingresos", fmtOptional(adjustedDrivers.revenueCagr, fmtPct)],
        ["Margen", fmtOptional(adjustedDrivers.margin, fmtPct)],
        ["Rentabilidad - retorno mínimo", fmtOptional(adjustedDrivers.roic - adjustedDrivers.wacc, fmtPct), adjustedDrivers.roic >= adjustedDrivers.wacc ? "good" : "bad"],
      ],
      bullets: [
        assumptions.wacc && isFiniteNumber(assumptions.wacc.beta)
          ? `WACC build: beta ${assumptions.wacc.beta.toFixed(2)}, ERP ${fmtPct(assumptions.wacc.equityRiskPremium)}, debt weight ${fmtPct(assumptions.wacc.debtWeight)}.`
          : null,
        `Porcentaje reinvertido: ${fmtOptional(adjustedDrivers.reinvestment, fmtPct)}.`,
        `Crecimiento de largo plazo: ${fmtOptional(adjustedDrivers.terminalGrowth, fmtPct)}.`,
        isFiniteNumber(adjustedDrivers.roic) && isFiniteNumber(adjustedDrivers.wacc) && adjustedDrivers.roic < adjustedDrivers.wacc
          ? "Alerta contable: ROIC no supera WACC."
          : "El negocio supera el umbral básico de ROIC.",
        isFiniteNumber(facts.operatingCashFlow) ? `Caja de operaciones: ${factMoney(facts.operatingCashFlow)}.` : null,
        isFiniteNumber(facts.capex) ? `Inversión: ${factMoney(facts.capex)}.` : null,
      ],
    },
    twin: {
      eyebrow: "Lógica del negocio",
      title: "Drivers de tesis",
      copy:
        "La tesis se separa en factores que se pueden cambiar, probar y revisar.",
      plain: "¿Qué tendría que ser cierto para que esta inversión funcione?",
      technical: "Relaciona crecimiento, reinversión, rentabilidad y duración de la ventaja competitiva.",
      metrics: [
        ["Escenario", mode],
        ["Calidad del negocio", fmtValue(adjustedDrivers.thesisQuality, "score")],
        ["Demanda y oferta", fmtValue(adjustedDrivers.demandSupply, "score")],
        ["Ventaja por escasez", fmtValue(adjustedDrivers.bottleneckPower, "score")],
        ["Alertas", String(tripwires.length), tripwires.length > 3 ? "warn" : "neutral"],
      ],
      bullets: [
        `El valor estimado es ${fmtMoney(valuation)} frente a un precio de ${fmtMoney(adjustedDrivers.price)}.`,
        `La rentabilidad de largo plazo (${fmtOptional(adjustedDrivers.terminalRoic, fmtPct)}) se compara con el retorno mínimo exigido (${fmtOptional(adjustedDrivers.wacc, fmtPct)}).`,
        `La calidad del negocio (${fmtValue(adjustedDrivers.thesisQuality, "score")}) ayuda a estimar cuánto puede durar su rentabilidad.`,
        `La ventaja por escasez (${fmtValue(adjustedDrivers.bottleneckPower, "score")}) pregunta si los clientes tienen buenos sustitutos.`,
        activeFalsifiers[0] || "No hay una alerta cercana al límite de su rango.",
        activeFalsifiers[1] || null,
      ],
    },
    bayes: {
      eyebrow: "Escenarios",
      title: "Confianza de escenario",
      copy:
        "Compara tu tesis con los supuestos que el precio ya trae dentro.",
      plain: "¿Cuánta confianza corresponde después de admitir incertidumbre?",
      technical: "Compara los supuestos con la historia del negocio y muestra dónde hay más incertidumbre.",
      metrics: [
        ["Supuestos razonables", fmtPct(feasibility, 0), feasibility >= 0.55 ? "good" : "warn"],
        ["Sobre precio", fmtPct(distribution.probAbovePrice, 0)],
        ["CAGR implícito", fmtPct(impliedCagr)],
        ["Respaldo del negocio", fmtValue((adjustedDrivers.thesisQuality + adjustedDrivers.demandSupply + adjustedDrivers.bottleneckPower) / 3, "score")],
      ],
      bullets: [
        `Retorno esperado a 5 años: ${fmtPct(expectedIrr)}.`,
        `Diferencia frente al precio: ${fmtPct(upside)}.`,
        isFiniteNumber(impliedCagr) && isFiniteNumber(adjustedDrivers.revenueCagr) && impliedCagr > adjustedDrivers.revenueCagr
          ? "El crecimiento implícito del mercado supera los supuestos de la tesis."
          : "El crecimiento de la tesis no está por debajo del que supone el precio.",
        missingDrivers.length ? "El rango debe mantenerse amplio porque faltan datos en vivo." : null,
      ],
    },
    value: {
      eyebrow: "Valor",
      title: "Estimación de valor",
      copy: "El valor estimado se compara con precio, retorno esperado y desacuerdo entre métodos.",
      plain: "¿El precio actual deja margen de seguridad suficiente?",
      technical: "Compara caja futura, rentabilidad, activos y el posible descenso del precio.",
      metrics: [
        ["Valor / acción", fmtMoney(valuation)],
        ["Precio", fmtMoney(adjustedDrivers.price)],
        ["Upside", fmtPct(upside), upside >= 0 ? "good" : "bad"],
        ["Retorno esperado", fmtPct(expectedIrr)],
      ],
      bullets: [
        "DCF y durabilidad de ROIC son los chequeos principales; los otros métodos muestran si el resultado es frágil.",
        `Probabilidad de superar el precio: ${fmtPct(distribution.probAbovePrice, 0)}.`,
      ],
    },
    expect: {
      eyebrow: "Precio implícito",
      title: "Lo que exige el precio",
      copy: "Muestra el crecimiento y ROIC necesarios para justificar el precio actual.",
      plain: "¿Qué supone ya el precio de la acción?",
      technical: "Muestra qué crecimiento y rentabilidad ya supone el precio actual.",
      metrics: [
        ["Crecimiento implícito", fmtPct(impliedCagr)],
        ["Crecimiento de la tesis", fmtOptional(adjustedDrivers.revenueCagr, fmtPct)],
        ["Supuestos razonables", fmtPct(feasibility, 0)],
        ["Falsificadores", String(tripwires.length)],
      ],
      bullets: [
        "Usa la grilla de abajo para ver dónde las expectativas del mercado se vuelven plausibles o frágiles.",
        assumptions.wacc ? `WACC queda acotado por la política ${assumptions.industry?.label || "seleccionada"} antes de leer el Reverse DCF.` : null,
        activeFalsifiers[0] || null,
      ],
    },
    flows: {
      eyebrow: "Factores que pueden mover el precio",
      title: "Flujos y contexto",
      copy: "La mecánica de mercado se mantiene separada del valor económico del negocio.",
      plain: "¿La acción puede moverse por razones ajenas al valor del negocio?",
      technical: "Revisa movimientos de fondos, nuevas acciones, recompras, posiciones cortas y liquidez.",
      metrics: [
        ["Beta", isFiniteNumber(adjustedDrivers.beta) ? adjustedDrivers.beta.toFixed(2) : "N/A"],
        ["Proxy de buyback", adjustedDrivers.dilution < 0 ? "Apoya" : "Dilutivo"],
        ["Dilución neta", fmtOptional(adjustedDrivers.dilution, fmtPct)],
        ["Brecha de precio", fmtPct(upside)],
      ],
      bullets: [
        "Un buen negocio puede ser una mala entrada si el soporte de mercado ya está agotado.",
        "Estos chequeos no cambian el valor del negocio; explican riesgo de movimiento de precio.",
      ],
    },
    calibration: {
      eyebrow: "Confianza de la lectura",
      title: "Permiso de uso",
      copy: "Esta sección muestra qué tan confiable es la lectura y qué información todavía falta.",
      plain: "¿La lectura tiene suficientes resultados pasados para ganar confianza?",
      technical: "Compara calidad de datos, diferencias entre métodos y resultados anteriores cuando existen.",
      metrics: [
        ["Calidad de datos", fmtPct(quality, 0)],
        ["Desacuerdo", fmtPct(adjustedDrivers.modelRisk, 0)],
        ["Uso permitido", adoptionStatusLabel(activeCalibrationGate.status)],
        ["Resultados medidos", activeCalibrationGate.evidence?.scoredRecords === undefined ? "Vista previa" : `${activeCalibrationGate.evidence.scoredRecords}/${activeCalibrationGate.evidence.minRecords || "?"}`],
      ],
      bullets: [
        "La valoración original sigue siendo la primaria hasta que suficientes predicciones pasadas hayan sido evaluadas.",
        "La confianza se revisa por plazo y tipo de negocio, no mezclando empresas distintas.",
        activeCalibrationGate.memo?.nextStep || "Guardar predicciones y compararlas contra resultados futuros.",
        debate?.final_orchestrator ? statusCopy(debate.final_orchestrator.status) : "Corre la revisión para agregar el veredicto final.",
      ],
    },
  };
  const panel = panels[activeEngine] || panels.expect;
  const final = debate?.final_orchestrator;
  const finalAnalysis = final?.analysis || debate?.deterministic_verdict;
  const researchability = finalAnalysis?.researchability || debate?.researchability;
  const quickKill = finalAnalysis?.quick_kill || debate?.quick_kill;
  const scorecard = finalAnalysis?.scorecard || debate?.agents || [];
  const bullCase = finalAnalysis?.bull_case || finalAnalysis?.strongest_points || [];
  const bearCase = finalAnalysis?.bear_case || finalAnalysis?.red_team || [];
  const killCriteria = finalAnalysis?.kill_criteria || quickKill?.checks?.filter((item) => item.status !== "pass").map((item) => `${item.label}: ${item.note}`) || [];
  const catalystPack = debate?.catalyst_pack || liveSnapshot?.catalystPack;
  const catalystItems = catalystPack?.dominantCatalysts || [];
  const liveEvidenceItems = catalystPack?.evidence?.items || catalystPack?.evidencePack?.items || [];
  const changeLog = debate?.change_log;
  const providerDiagnostics = debate?.context_pack?.providerDiagnostics || liveSnapshot?.contextPack?.providerDiagnostics || [];
  const engineIndex = engines.findIndex(([key]) => key === activeEngine);

  return (
    <section className={styles.engineConsole} aria-label="Explicación de la valoración">
      <div className={styles.engineConsoleTop}>
        <div>
          <span>{panel.eyebrow}</span>
          <h2>
            {String(engineIndex + 1).padStart(2, "0")} {panel.title}
          </h2>
          <p>{panel.copy}</p>
          <div className={styles.explainPair}>
            <span>En simple</span>
            <strong>{panel.plain}</strong>
            <span>Qué se revisa</span>
            <strong>{panel.technical}</strong>
          </div>
        </div>
        <div className={styles.debateActions}>
          <button type="button" onClick={onRunDebate} disabled={debateStatus.state === "loading"}>
            {debateStatus.state === "loading" ? "Revisando" : "Revisar ahora"}
          </button>
          <small>Primero revisión local; una consulta adicional como máximo</small>
        </div>
      </div>
      <div className={styles.engineMetrics}>
        {panel.metrics.map(([label, value, tone]) => (
          <EngineMetric key={label} label={label} value={value} tone={tone} />
        ))}
      </div>
      <div className={styles.engineGrid}>
        <div className={styles.engineCard}>
          <strong>Lectura actual</strong>
          <BulletList items={panel.bullets} />
        </div>
        <div className={styles.engineCard}>
          <strong>Estado de revisión</strong>
          <p>{debateStatus.message || "Corre la revisión final para ver los controles y el veredicto."}</p>
          {debate?.agents?.length ? (
            <div className={styles.agentVotes}>
              {debate.agents.slice(0, 7).map((item) => (
                <span key={item.id} data-vote={item.vote}>
                  {item.label.replace(/^\d+\s*/, "")}: {item.vote}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {activeEngine === "calibration" ? (
        <CalibrationContract
          adjustedDrivers={adjustedDrivers}
          feasibility={feasibility}
          quality={quality}
          mode={mode}
          debate={debate}
          adoptionGate={activeCalibrationGate}
        />
      ) : null}
      {debate?.agents?.length ? (
        <div className={styles.debatePanel}>
          <div className={styles.debateHeader}>
            <div>
              <span>Revisión final</span>
              <h3>{finalAnalysis?.decision || "Veredicto final"}</h3>
              <p>
                {finalAnalysis?.one_line_conclusion || finalAnalysis?.executive_judgment}
                {debate?.runtime_mode?.detail ? ` — ${debate.runtime_mode.detail}` : ""}
              </p>
            </div>
            <div className={styles.verdictBadges}>
              <mark>{debate?.runtime_mode?.label || (final ? statusCopy(final.status) : "Veredicto local")}</mark>
              {researchability?.grade ? <mark>Ficha {researchability.grade}</mark> : null}
              {finalAnalysis?.composite_score ? <mark>{finalAnalysis.composite_score}/5</mark> : null}
            </div>
          </div>
          {debate?.pre_revenue?.applicable ? (
            <div className={styles.committeeStrip}>
              <div>
                <span>Análisis de empresa sin ventas</span>
                <strong>{debate.pre_revenue.statusLabel}</strong>
                <p>{debate.pre_revenue.summary}</p>
              </div>
              <div>
                <span>Meses de caja</span>
                <strong>{debate.pre_revenue.runway?.runwayLabel || "N/D"}</strong>
                <p>Probabilidad de fracaso asumida: {Math.round((debate.pre_revenue.failureProbability || 0) * 100)}%. Dilución esperada: {Math.round((debate.pre_revenue.expectedDilution || 0) * 100)}%.</p>
              </div>
              <div>
                <span>Escenarios</span>
                <strong>
                  {debate.pre_revenue.scenarios
                    ? debate.pre_revenue.scenarios.map((s) => `${s.label} ${Math.round(s.probability * 100)}%`).join(" / ")
                    : "Sin escenarios publicables"}
                </strong>
                <p>
                  {debate.pre_revenue.status === "ok"
                    ? `Valor ponderado: $${Number(debate.pre_revenue.probabilityWeightedValuePerShare || 0).toFixed(2)} por acción.`
                    : debate.pre_revenue.impliedExpectations?.note || `Faltan datos: ${(debate.pre_revenue.missingInputs || []).join(", ")}.`}
                </p>
              </div>
              <div>
                <span>Qué rompería esta lectura</span>
                <strong>{debate.pre_revenue.falsifiers?.[0] || "Sin falsificadores"}</strong>
                <p>{debate.pre_revenue.disclaimer}</p>
              </div>
            </div>
          ) : null}
          <div className={styles.committeeStrip}>
            <div>
              <span>Facilidad de revisión</span>
              <strong>{researchability?.label || "Ficha de fuentes pendiente"}</strong>
              <p>{researchability?.strategy || "Carga una empresa y corre la revisión final."}</p>
            </div>
            <div>
              <span>Puntos que impiden avanzar</span>
              <strong>{quickKill?.hard_fail ? "Bloqueo activado" : `${quickKill?.tally?.fail || 0} fallas / ${quickKill?.tally?.warn || 0} alertas`}</strong>
              <p>{quickKill?.hard_fail ? "La lectura bloquea tamaño hasta reparar el punto señalado." : "Sin bloqueo duro; lee las alertas antes de definir tamaño."}</p>
            </div>
            <div>
              <span>Datos a buscar</span>
              <strong>{catalystPack?.aggregateScore !== undefined ? fmtPct(catalystPack.aggregateScore, 0) : "Pendiente"}</strong>
              <p>
                {catalystItems.length
                  ? `${catalystItems.map((item) => `${item.label} ${fmtPct(item.score, 0)}`).join(" / ")}${
                      liveEvidenceItems.length ? ` desde ${liveEvidenceItems.length} fuentes vivas` : ""
                    }`
                  : "Carga un snapshot para puntuar demanda, oferta, cuellos de botella, regulación, earnings y capex."}
              </p>
            </div>
            <div>
              <span>Cambios desde la última lectura</span>
              <strong>{changeLog?.status || "Base pendiente"}</strong>
              <p>
                {changeLog?.changes?.length
                  ? changeLog.changes.slice(0, 2).map((item) => `${item.label}: ${item.previous} -> ${item.current}`).join(" / ")
                  : "La primera corrida fija la base para la siguiente valoración."}
              </p>
            </div>
          </div>
          <div className={styles.agentGrid}>
            {scorecard.map((item) => (
              <article key={item.id || item.label} className={styles.agentCard} data-vote={item.vote}>
                <span>{item.label}</span>
                <strong>{item.stance || item.role}</strong>
                <small>{item.role || item.lens}</small>
                <p>{item.summary}</p>
                {item.score_5 ? <mark>{item.score_5}/5</mark> : null}
              </article>
            ))}
          </div>
          <div className={styles.caseGrid}>
            <article className={styles.orchestratorCard}>
              <span>Vista final</span>
              <p>{finalAnalysis?.executive_judgment}</p>
              <div>
                <strong>Caso favorable</strong>
                <BulletList items={bullCase} />
              </div>
            </article>
            <article className={styles.orchestratorCard}>
              <span>Cuestionamiento</span>
              <div>
                <strong>Caso desfavorable</strong>
                <BulletList items={bearCase} />
              </div>
              <div>
                <strong>Qué rompería la tesis</strong>
                <BulletList items={killCriteria.length ? killCriteria : finalAnalysis?.open_questions || []} />
              </div>
            </article>
          </div>
          <div className={styles.diagnosticsGrid}>
            <article className={styles.orchestratorCard}>
              <span>Estado de fuentes</span>
              <div className={styles.providerList}>
                {providerDiagnostics.slice(0, 6).map((item) => (
                  <div key={item.block || item.source}>
                    <strong>{item.block}</strong>
                    <small>{item.status} / {item.source || "calculado"}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className={styles.orchestratorCard}>
              <span>Vista previa del memo</span>
              <p>{debate?.memo?.title || "El memo se genera después de la revisión final."}</p>
              {debate?.memo?.markdown ? <pre className={styles.memoPreview}>{debate.memo.markdown.split("\n").slice(0, 10).join("\n")}</pre> : null}
            </article>
            <article className={styles.orchestratorCard}>
              <span>Evidencia de catalizadores</span>
              {liveEvidenceItems.length ? (
                <div className={styles.evidenceList}>
                  {liveEvidenceItems.slice(0, 4).map((item, index) => (
                    <a key={`${item.provider || "source"}-${item.url || item.title}-${index}`} href={item.url} target="_blank" rel="noreferrer">
                      <strong>{item.title}</strong>
                      <small>{item.source || item.provider} / {item.catalystTags?.join(", ") || "catalyst"} / {item.polarity}</small>
                    </a>
                  ))}
                </div>
              ) : (
                <p>No hay evidencia de noticias en vivo asociada a esta corrida.</p>
              )}
            </article>
          </div>
          {quickKill?.checks?.length ? (
            <div className={styles.quickKillGrid}>
              {quickKill.checks.map((item) => (
                <span key={item.id} data-status={item.status}>
                  <strong>{item.label}</strong>
                  {item.note}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function ValuationOsLabPage() {
  const [companyKey, setCompanyKey] = useState("compounder");
  const [liveCompany, setLiveCompany] = useState(null);
  const [missingDrivers, setMissingDrivers] = useState([]);
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [liveSnapshot, setLiveSnapshot] = useState(null);
  const [liveStatus, setLiveStatus] = useState({ state: "idle", message: "" });
  const [debate, setDebate] = useState(null);
  const [debateStatus, setDebateStatus] = useState({ state: "idle", message: "" });
  const [activeEngine, setActiveEngine] = useState("expect");
  const [mode, setMode] = useState("base");
  const [drivers, setDrivers] = useState(companies.compounder);

  const companyOptions = useMemo(
    () => ({
      ...companies,
      ...(liveCompany ? { live: liveCompany } : {}),
    }),
    [liveCompany],
  );

  function selectCompany(key) {
    const nextCompany = companyOptions[key];
    if (!nextCompany) return;
    setCompanyKey(key);
    setDrivers(nextCompany);
  }

  const adjustedDrivers = useMemo(() => {
    if (mode === "bear") {
      return {
        ...drivers,
        revenueCagr: scaleDriver(drivers.revenueCagr, 0.62),
        margin: scaleDriver(drivers.margin, 0.91),
        terminalRoic: scaleDriver(drivers.terminalRoic, 0.86),
        wacc: scaleDriver(drivers.wacc, 1, 0.012),
        moatHalfLife: scaleDriver(drivers.moatHalfLife, 0.72),
        thesisQuality: clamp(scaleDriver(drivers.thesisQuality, 0.78), 0.05, 0.98),
        demandSupply: clamp(scaleDriver(drivers.demandSupply, 0.72), 0.05, 0.98),
        bottleneckPower: clamp(scaleDriver(drivers.bottleneckPower, 0.7), 0.05, 0.98),
      };
    }
    if (mode === "bull") {
      return {
        ...drivers,
        revenueCagr: scaleDriver(drivers.revenueCagr, 1.24, 0.01),
        margin: scaleDriver(drivers.margin, 1.06),
        terminalRoic: scaleDriver(drivers.terminalRoic, 1.1),
        wacc: scaleDriver(drivers.wacc, 1, -0.006),
        moatHalfLife: scaleDriver(drivers.moatHalfLife, 1.22),
        thesisQuality: clamp(scaleDriver(drivers.thesisQuality, 1.12, 0.03), 0.05, 0.98),
        demandSupply: clamp(scaleDriver(drivers.demandSupply, 1.16, 0.02), 0.05, 0.98),
        bottleneckPower: clamp(scaleDriver(drivers.bottleneckPower, 1.18, 0.02), 0.05, 0.98),
      };
    }
    return drivers;
  }, [drivers, mode]);

  const valuationRouter = useMemo(() => buildValuationRouter(adjustedDrivers, liveSnapshot), [adjustedDrivers, liveSnapshot]);
  const valuation = useMemo(() => valueAt(adjustedDrivers, valuationRouter), [adjustedDrivers, valuationRouter]);
  const impliedCagr = useMemo(() => impliedCagrForPrice(adjustedDrivers, valuationRouter), [adjustedDrivers, valuationRouter]);
  const distribution = useMemo(
    () => buildDistribution(adjustedDrivers, valuation),
    [adjustedDrivers, valuation],
  );
  const surface = useMemo(() => buildSurface(adjustedDrivers, valuationRouter), [adjustedDrivers, valuationRouter]);
  const selectedEngine = engines.find((engine) => engine[0] === activeEngine);
  const upside =
    isFiniteNumber(valuation) && isFiniteNumber(adjustedDrivers.price)
      ? valuation / adjustedDrivers.price - 1
      : null;
  const expectedIrr =
    isFiniteNumber(upside) && isFiniteNumber(adjustedDrivers.price)
      ? Math.pow(valuation / adjustedDrivers.price, 1 / 5) - 1
      : null;
  const feasibility = clamp(
    isFiniteNumber(impliedCagr) &&
      isFiniteNumber(adjustedDrivers.revenueCagr) &&
      isFiniteNumber(adjustedDrivers.reinvestment) &&
      isFiniteNumber(adjustedDrivers.modelRisk) &&
      isFiniteNumber(adjustedDrivers.thesisQuality) &&
      isFiniteNumber(adjustedDrivers.demandSupply) &&
      isFiniteNumber(adjustedDrivers.bottleneckPower)
      ? 1 -
          Math.abs(adjustedDrivers.revenueCagr - impliedCagr) * 2.8 -
          Math.max(0, adjustedDrivers.reinvestment - 0.6) * 0.7 -
          adjustedDrivers.modelRisk * 0.28 -
          (1 - adjustedDrivers.thesisQuality) * 0.16 -
          (1 - adjustedDrivers.demandSupply) * 0.14 -
          (1 - adjustedDrivers.bottleneckPower) * 0.1
      : 0.05,
    0.05,
    0.95,
  );
  const quality = clamp(
    adjustedDrivers.dataQuality -
      adjustedDrivers.modelRisk * 0.12 +
      (adjustedDrivers.thesisQuality - 0.5) * 0.08 +
      (adjustedDrivers.demandSupply - 0.5) * 0.05,
    0.2,
    0.95,
  );
  const tripwires = assumptionSchema.filter((item) => {
    const value = adjustedDrivers[item.key];
    if (!isFiniteNumber(value)) return true;
    const span = item.high - item.low;
    return value < item.low + span * 0.12 || value > item.high - span * 0.12;
  });
  const plainRead = plainDecision(upside, feasibility, missingDrivers);
  const operationalRead = useMemo(
    () =>
      operationalVerdict({
        missingDrivers,
        valuationRouter,
        upside,
        feasibility,
        quality,
        tripwires,
      }),
    [missingDrivers, valuationRouter, upside, feasibility, quality, tripwires],
  );
  const operationalLadder = useMemo(
    () =>
      buildOperationalLadder({
        adjustedDrivers,
        impliedCagr,
        upside,
        feasibility,
        quality,
        tripwires,
        missingDrivers,
        liveSnapshot,
        valuationRouter,
      }),
    [adjustedDrivers, impliedCagr, upside, feasibility, quality, tripwires, missingDrivers, liveSnapshot, valuationRouter],
  );
  const assumptionPolicy = liveSnapshot?.assumptions || null;
  const assumptionCards = assumptionPolicy
    ? [
        {
          label: "Criterio sectorial",
          value: assumptionPolicy.industry?.label || "Empresa operativa amplia",
          note: assumptionPolicy.industry?.sicDescription || "Ticker y perfil SEC",
        },
        {
          label: "Tasa de referencia",
          value: fmtOptional(assumptionPolicy.riskFree?.value, fmtPct),
          note: assumptionPolicy.riskFree?.date
            ? `${assumptionPolicy.riskFree.source} / ${assumptionPolicy.riskFree.date}`
            : assumptionPolicy.riskFree?.source || "Fallback explícito",
        },
        {
          label: "Retorno mínimo exigido",
          value: fmtOptional(assumptionPolicy.wacc?.value, fmtPct),
          note: isFiniteNumber(assumptionPolicy.wacc?.beta)
            ? `Beta ${assumptionPolicy.wacc.beta.toFixed(2)} + ERP ${fmtPct(assumptionPolicy.wacc.equityRiskPremium)}`
            : "Tasa, beta, diferencial e impuestos",
        },
        {
          label: "Confianza del criterio",
          value: fmtOptional(assumptionPolicy.industry?.confidence, (value) => fmtPct(value, 0)),
          note: "Datos cargados y ciclo del sector",
        },
      ]
    : [];

  const fadePath = Array.from({ length: 20 }, (_, index) => {
    const phi = Math.pow(0.5, 1 / adjustedDrivers.moatHalfLife);
    return Math.pow(phi, index) * 100;
  });
  const posteriorPath = Array.from({ length: 24 }, (_, index) => {
    const x = (index - 11.5) / 4.2;
    return Math.exp(-0.5 * x * x) * (1 + Math.sin(index) * 0.04);
  });

  function updateDriver(key, nextValue) {
    setDrivers((current) => ({ ...current, [key]: Number(nextValue) }));
    setDebate(null);
    setDebateStatus({ state: "idle", message: "Assumption changed; rerun the final review for a fresh verdict." });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticker = String(params.get("ticker") || "").trim().toUpperCase();
    if (/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
      setTickerInput(ticker);
      loadLiveSnapshot(null, ticker);
    }
    // Run once on entry so /aurora?ticker=XXX becomes an actual handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLiveSnapshot(event, tickerOverride) {
    event?.preventDefault();
    const ticker = String(tickerOverride || tickerInput).trim().toUpperCase();
    if (!ticker) return;
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
      setLiveStatus({
        state: "error",
        message: "El ticker debe tener 1-12 letras, números, puntos o guiones.",
      });
      return;
    }

    setLiveStatus({ state: "loading", message: `Cargando ${ticker} desde SEC, precio de mercado y tasas...` });
    try {
      const response = await fetch(`/valuation-os-lab/api/snapshot?ticker=${encodeURIComponent(ticker)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Snapshot failed for ${ticker}`);
      }

      const nextCompany = {
        ...companies.compounder,
        ticker: payload.company?.ticker || ticker,
        name: payload.company?.entityName || payload.company?.name || ticker,
        sector: payload.company?.fiscalYear
          ? `Último reporte SEC FY${payload.company.fiscalYear}`
          : "Último reporte SEC",
        price: payload.drivers?.price,
        baseFcf: payload.drivers?.baseFcf,
        revenueCagr: payload.drivers?.revenueCagr,
        margin: payload.drivers?.margin,
        roic: payload.drivers?.roic,
        terminalRoic: payload.drivers?.terminalRoic,
        wacc: payload.drivers?.wacc,
        terminalGrowth: payload.drivers?.terminalGrowth,
        reinvestment: payload.drivers?.reinvestment,
        dilution: payload.drivers?.dilution,
        moatHalfLife: payload.drivers?.moatHalfLife,
        thesisQuality: payload.drivers?.thesisQuality ?? driverOr(drivers, "thesisQuality"),
        demandSupply: payload.drivers?.demandSupply ?? driverOr(drivers, "demandSupply"),
        bottleneckPower: payload.drivers?.bottleneckPower ?? driverOr(drivers, "bottleneckPower"),
        dataQuality: payload.drivers?.dataQuality,
        modelRisk: payload.drivers?.modelRisk,
        beta: payload.drivers?.beta ?? driverOr(drivers, "beta"),
      };

      setLiveCompany(nextCompany);
      setCompanyKey("live");
      setDrivers(nextCompany);
      setLiveSnapshot(payload);
      setMissingDrivers(payload.missingDrivers || []);
      setDebate(null);
      setDebateStatus({ state: "idle", message: "Datos cargados; corre la revision final para ver el veredicto." });
      setLiveStatus({
        state: "ready",
        message: `${nextCompany.ticker} cargado: SEC ${payload.company?.fiscalYear || "snapshot"}${
          payload.quote?.source ? ` + ${payload.quote.source}` : " sin precio en vivo"
        }${payload.riskFree?.value ? " + tasa libre de riesgo" : ""}${
          payload.valuationReady ? "." : `; faltan ${payload.missingDrivers.join(", ")}.`
        }`,
      });
    } catch (error) {
      setLiveStatus({
        state: "error",
        message: error instanceof Error ? error.message : "No se pudo cargar el reporte.",
      });
    }
  }

  async function runValuationDebate() {
    setDebateStatus({ state: "loading", message: "Corriendo revisiones locales y veredicto final..." });
    try {
      const response = await fetch("/valuation-os-lab/api/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ticker: adjustedDrivers.ticker,
          mode,
          drivers: adjustedDrivers,
          router: valuationRouter,
          snapshot: liveSnapshot,
          contextPack: liveSnapshot?.contextPack,
          catalystPack: liveSnapshot?.catalystPack,
          missingDrivers,
          tripwires: tripwires.map((item) => ({
            key: item.key,
            label: item.label,
            falsifier: item.falsifier,
          })),
          valuation,
          upside,
          expectedIrr,
          impliedCagr,
          feasibility,
          quality,
          probabilityAbovePrice: distribution.probAbovePrice,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Falló la revisión final.");
      }
      setDebate(payload.debate);
      setDebateStatus({
        state: "ready",
        message: `${payload.ticker} listo: ${statusCopy(payload.debate.final_orchestrator?.status)}${
          payload.cached ? " (cache)" : ""
        }.`,
      });
    } catch (error) {
      setDebateStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Falló la revisión final.",
      });
    }
  }

  return (
    <main className={`${styles.shell} valuation-os-lab-route`}>
      <style jsx global>{`
        body:has(.valuation-os-lab-route) .global-language-dock {
          display: none;
        }
      `}</style>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span>AURORA</span>
          <strong>Valoración de empresas</strong>
        </div>
        <div className={styles.companyCard}>
          <span>Empresa</span>
          <strong>{adjustedDrivers.ticker}</strong>
          <small>{adjustedDrivers.name}</small>
          <em>{adjustedDrivers.sector}</em>
        </div>
        <nav className={styles.engineNav} aria-label="Preguntas de valoración">
          {engines.map(([key, label, description], index) => (
            <button
              key={key}
              type="button"
              data-active={activeEngine === key}
              onClick={() => setActiveEngine(key)}
            >
              <i>{String(index + 1).padStart(2, "0")}</i>
              <span>{label}</span>
              <small>{description}</small>
            </button>
          ))}
        </nav>
        <div className={styles.healthPanel}>
          <span>Lectura actual</span>
          <strong>{plainRead}</strong>
          <p>
            Reúne la diferencia entre precio y valor estimado, la calidad de los datos y los principales riesgos.
          </p>
          <dl>
            <div>
              <dt>Alertas</dt>
              <dd>{tripwires.length} / {assumptionSchema.length}</dd>
            </div>
            <div>
              <dt>Supuestos razonables</dt>
              <dd>{fmtPct(feasibility, 0)}</dd>
            </div>
            <div>
              <dt>Calidad de datos</dt>
              <dd>{fmtPct(quality, 0)}</dd>
            </div>
          </dl>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <h1>AURORA · Valoración de empresas</h1>
            <p>
              Una mesa de valoración que muestra qué cree el precio, qué debe demostrar el negocio
              y qué evidencia debilitaría la tesis.
            </p>
            <div className={styles.heroSummary}>
              <span>Lectura</span>
              <strong>{plainRead}</strong>
              <span>Diferencia entre precio y valor estimado: {fmtPct(upside)}</span>
              <span>{fmtPct(feasibility, 0)} supuestos razonables</span>
            </div>
          </div>
          <div className={styles.controls}>
            <form className={styles.liveLoader} onSubmit={loadLiveSnapshot}>
              <input
                value={tickerInput}
                onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
                aria-label="Ticker a cargar"
                placeholder="AAPL"
              />
              <button type="submit" disabled={liveStatus.state === "loading"}>
                {liveStatus.state === "loading" ? "Cargando" : "Ver empresa"}
              </button>
            </form>
            <select aria-label="Empresa de ejemplo o cargada" value={companyKey} onChange={(event) => selectCompany(event.target.value)}>
              <option value="compounder">Ejemplo software de calidad</option>
              <option value="cyclical">Ciclo de semiconductores</option>
              <option value="bank">Ejemplo banco regional</option>
              {liveCompany ? <option value="live">Empresa cargada</option> : null}
            </select>
            <div className={styles.segmented} aria-label="Escenario">
              {["bear", "base", "bull"].map((item) => (
                <button
                  key={item}
                  type="button"
                  data-active={mode === item}
                  onClick={() => setMode(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {liveStatus.message ? (
              <div className={styles.liveStatus} data-state={liveStatus.state}>
                {liveStatus.message}
              </div>
            ) : null}
          </div>
        </header>

        <section className={styles.operationalShell} aria-label="Lectura principal de AURORA">
          <AuroraVerdictCard
            tier={operationalRead.tier}
            reason={operationalRead.reason}
            nextStep={operationalRead.nextStep}
            className={styles.verdictCard}
          />

          <div className={styles.verdictLadder}>
            <article className={styles.ladderPanel}>
              <span>01</span>
              <h2>{SECTIONS[0].label}</h2>
              <ul>
                {operationalLadder.implied.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article className={styles.ladderPanel}>
              <span>02</span>
              <h2>{SECTIONS[1].label}</h2>
              <ul>
                {operationalLadder.mustTrue.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article className={styles.ladderPanel}>
              <span>03</span>
              <h2>{SECTIONS[2].label}</h2>
              <div className={styles.evidenceColumns}>
                <div>
                  <strong>A favor</strong>
                  {(operationalLadder.evidenceFor.length ? operationalLadder.evidenceFor : ["No hay evidencia positiva suficiente todavía."]).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
                <div>
                  <strong>Preocupa</strong>
                  {(operationalLadder.evidenceAgainst.length ? operationalLadder.evidenceAgainst : ["No hay alertas fuertes en la primera lectura."]).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            </article>
            <article className={styles.ladderPanel}>
              <span>04</span>
              <h2>{SECTIONS[3].label}</h2>
              <ol>
                {(operationalLadder.review.length ? operationalLadder.review : ["Revisar el próximo reporte y comparar contra peers."]).map((item) => <li key={item}>{item}</li>)}
              </ol>
            </article>
            <article className={styles.ladderPanel}>
              <span>05</span>
              <h2>{SECTIONS[4].label}</h2>
              <ul>
                {operationalLadder.breaks.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </div>
        </section>

        <details className={styles.fullAnalysis}>
          <summary>Ver el análisis completo</summary>

        <section className={styles.orientationStrip} aria-label="Guía de lectura de AURORA">
          <div>
            <span>1 Fuentes</span>
            <strong>Informes públicos, precio, tasas</strong>
            <p>Verifica si los datos son usables.</p>
          </div>
          <div>
            <span>2 Economía</span>
            <strong>FCF, ROIC, WACC</strong>
            <p>Revisa si crecer crea valor.</p>
          </div>
          <div>
            <span>3 Negocio</span>
            <strong>Calidad, oferta, escasez</strong>
            <p>Conecta la historia con los números.</p>
          </div>
          <div>
            <span>4 Decisión</span>
            <strong>Supuestos + razones para cambiar de opinión</strong>
            <p>Muestra qué debe salir bien y qué rompería la tesis.</p>
          </div>
        </section>

        <section className={styles.termStrip} aria-label="Glosario financiero breve">
          <span>Glosario rápido</span>
          <p><strong>DCF</strong> valora hoy los flujos de caja futuros.</p>
          <p><strong>ROIC</strong> mide el retorno sobre el capital que usa el negocio.</p>
          <p><strong>WACC</strong> es el retorno mínimo exigido por el riesgo.</p>
          <p><strong>Reverse DCF</strong> pregunta qué crecimiento ya descuenta el precio.</p>
        </section>

        <RouterPanel router={valuationRouter} />

        <EngineConsole
          activeEngine={activeEngine}
          adjustedDrivers={adjustedDrivers}
          distribution={distribution}
          expectedIrr={expectedIrr}
          feasibility={feasibility}
          impliedCagr={impliedCagr}
          liveSnapshot={liveSnapshot}
          missingDrivers={missingDrivers}
          mode={mode}
          onRunDebate={runValuationDebate}
          quality={quality}
          tripwires={tripwires}
          upside={upside}
          valuation={valuation}
          debate={debate}
          debateStatus={debateStatus}
        />

        <section className={styles.heroGrid}>
          <article className={styles.surfacePanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Precio implícito</span>
                <h2>Qué tendría que ser cierto</h2>
                <p>
                  Cada celda muestra el valor estimado como porcentaje del precio actual. La grilla vuelve visibles los supuestos del mercado.
                </p>
              </div>
              <mark>Precio {fmtMoney(adjustedDrivers.price)}</mark>
            </div>
            <Surface surface={surface} price={adjustedDrivers.price} />
            <div className={styles.surfaceLegend}>
              <span>Más exigente</span>
              <b>La zona clara se acerca a valor justo</b>
              <span>Más atractivo</span>
            </div>
          </article>

          <article className={styles.ledgerPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Supuestos</span>
                <h2>Lo que puedes ajustar</h2>
                <p>
                  Cada control representa un supuesto. La frase inferior indica qué evidencia lo debilitaría.
                </p>
              </div>
              <mark>{tripwires.length} alertas</mark>
            </div>
            {missingDrivers.length ? (
              <div className={styles.missingData}>
                Faltan inputs en vivo: {missingDrivers.join(", ")}. El sistema no inventa datos específicos del ticker;
                ajusta los supuestos faltantes antes de confiar en la valoración.
              </div>
            ) : null}
            {assumptionCards.length ? (
              <div className={styles.policyStrip} aria-label="Assumption policy">
                {assumptionCards.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.policyStrip} aria-label="Assumption policy">
                <div>
                  <span>Política de tasas</span>
                  <strong>Supuesto de ejemplo</strong>
                  <small>Carga una empresa para reemplazarlo por inputs de compañía e industria.</small>
                </div>
              </div>
            )}
            <div className={styles.assumptionList}>
              {assumptionSchema.map((item) => (
                <label key={item.key} className={styles.assumptionRow}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.source}</small>
                  </div>
                  <input
                    type="range"
                    min={item.low}
                    max={item.high}
                    step={item.fmt === "yrs" ? 0.1 : 0.001}
                    value={isFiniteNumber(drivers[item.key]) ? drivers[item.key] : item.low}
                    onChange={(event) => updateDriver(item.key, event.target.value)}
                  />
                  <em>{fmtValue(adjustedDrivers[item.key], item.fmt)}</em>
                  <span>{item.falsifier}</span>
                </label>
              ))}
            </div>
          </article>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Rango de valor posible</span>
                <h3>{fmtMoney(distribution.p50)} valor mediano</h3>
                <p>Rango de valores después de ampliar por incertidumbre.</p>
              </div>
              <mark>{fmtPct(distribution.probAbovePrice, 0)} sobre precio</mark>
            </div>
            <SparkBars rows={distribution.rows} price={adjustedDrivers.price} />
            <dl className={styles.statStrip}>
              <div>
                <dt>P10</dt>
                <dd>{fmtMoney(distribution.p10)}</dd>
              </div>
              <div>
                <dt>P50</dt>
                <dd>{fmtMoney(distribution.p50)}</dd>
              </div>
              <div>
                <dt>P90</dt>
                <dd>{fmtMoney(distribution.p90)}</dd>
              </div>
            </dl>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Durabilidad de la ventaja</span>
                <h3>{adjustedDrivers.moatHalfLife.toFixed(1)} años</h3>
                <p>Cuánto tiempo se asume que la empresa mantiene ROIC sobre WACC.</p>
              </div>
              <mark>Duración de la rentabilidad</mark>
            </div>
            <MiniLine points={fadePath} />
            <p>
              La lectura reduce gradualmente la ventaja competitiva en vez de asumir que los retornos altos duran para siempre.
            </p>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Retorno del nuevo capital</span>
                <h3>{fmtPct(adjustedDrivers.roic)} rentabilidad año 5</h3>
                <p>Revisa si la nueva inversion puede financiar el crecimiento supuesto.</p>
              </div>
              <mark>Calidad del crecimiento</mark>
            </div>
            <MiniLine points={posteriorPath} tone="amber" />
            <p>
              La prueba pregunta si el nuevo capital gana lo suficiente para sostener
              el crecimiento modelado.
            </p>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Qué exige el precio</span>
                <h3>{fmtPct(impliedCagr)} CAGR implícito</h3>
                <p>Compara el crecimiento que exige el precio con el crecimiento de tu tesis.</p>
              </div>
              <mark>{isFiniteNumber(upside) && upside >= 0 ? "Descuento" : "Prima"}</mark>
            </div>
            <table className={styles.compactTable}>
              <tbody>
                <tr>
                  <th>Crecimiento de ingresos</th>
                  <td>{fmtPct(impliedCagr)}</td>
                  <td>{fmtPct(adjustedDrivers.revenueCagr)}</td>
                </tr>
                <tr>
                  <th>Rentabilidad de largo plazo</th>
                  <td>{fmtPct(adjustedDrivers.terminalRoic * 0.86)}</td>
                  <td>{fmtPct(adjustedDrivers.terminalRoic)}</td>
                </tr>
                <tr>
                  <th>WACC</th>
                  <td>{fmtPct(adjustedDrivers.wacc + 0.006)}</td>
                  <td>{fmtPct(adjustedDrivers.wacc)}</td>
                </tr>
              </tbody>
            </table>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Desacuerdo entre métodos</span>
                <h3>{fmtPct(adjustedDrivers.modelRisk, 0)} bandera de riesgo</h3>
                <p>Si los métodos difieren mucho, el valor exacto merece menos confianza.</p>
              </div>
              <mark>Contraste</mark>
            </div>
            {["DCF + ROIC fade", "Book-value return", "Adjusted cash flow", "Parts check", "Asset floor"].map(
              (label, index) => {
                const spread = [1, 0.94, 1.08, 0.88, 0.62][index];
                return (
                  <div key={label} className={styles.modelRow}>
                    <span>{label}</span>
                    <RangeBar value={valuation * spread} low={valuation * 0.52} high={valuation * 1.26} />
                    <strong>{fmtMoney(valuation * spread)}</strong>
                  </div>
                );
              },
            )}
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
              <span>Confiabilidad de los datos</span>
                <h3>{fmtPct(quality, 0)} con datos suficientes</h3>
                <p>Muestra si la lectura usa datos vivos y rastreables.</p>
              </div>
              <mark>Último informe</mark>
            </div>
            <div className={styles.qualityDial} style={{ "--score": `${quality * 100}%` }}>
              <strong>{fmtPct(quality, 0)}</strong>
              <span>rastreable</span>
            </div>
            {liveSnapshot ? (
              <div className={styles.coverageList}>
                <div>
                  <span>Datos financieros</span>
                  <strong>cargado</strong>
                </div>
                <div>
                  <span>Fuente de tasas</span>
                  <strong>{liveSnapshot.coverage?.fredConfigured ? "configurado" : "faltante"}</strong>
                </div>
                <div>
                  <span>Fuente de precio</span>
                  <strong>{liveSnapshot.coverage?.quoteSource || "faltante"}</strong>
                </div>
                <div>
                <span>Fuente financiera</span>
                  <strong>{liveSnapshot.coverage?.fmpConfigured ? "configurada" : "key local faltante"}</strong>
                </div>
              </div>
            ) : (
              <p>Los informes regulatorios son la fuente principal; las fuentes auxiliares sirven como apoyo.</p>
            )}
          </article>
        </section>

        <section className={styles.bottomGrid}>
          <article className={styles.outputPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Lectura</span>
                <h2>Lectura actual</h2>
                <p>Resume la diferencia frente al valor estimado, la calidad de los datos y las alertas activas.</p>
              </div>
              <mark>{selectedEngine?.[1]}</mark>
            </div>
            <div className={styles.outputStrip}>
              <div>
                <span>Valor / acción</span>
                <strong>{fmtMoney(valuation)}</strong>
              </div>
              <div data-tone={isFiniteNumber(upside) && upside >= 0 ? "good" : "bad"}>
                <span>Diferencia entre precio y valor estimado</span>
                <strong>{fmtPct(upside)}</strong>
              </div>
              <div>
                <span>Retorno esperado a 5 años</span>
                <strong>{fmtPct(expectedIrr)}</strong>
              </div>
              <div>
                <span>Supuestos razonables</span>
                <strong>{fmtPct(feasibility, 0)}</strong>
              </div>
              <div>
                <span>Alertas activas</span>
                <strong>{tripwires.length}</strong>
              </div>
            </div>
            <p>
              No es un precio objetivo único. Muestra qué supone el precio, qué sostiene la lectura y qué conviene revisar primero.
            </p>
          </article>

          <article className={styles.flowPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Factores que pueden mover el precio</span>
                <h2>Separados del valor del negocio</h2>
              </div>
              <mark>Contexto de mercado</mark>
            </div>
            <div className={styles.flowStack}>
              {[
                ["Fondos indexados y compras pasivas", "Neutral", 0.48],
                ["Compras internas y nuevas acciones", "Vigilar", 0.38],
                ["Recompras de acciones", "Positivo", 0.64],
                ["Posiciones cortas y opciones", "Elevado", 0.57],
              ].map(([label, state, score]) => (
                <div key={label} className={styles.flowRow}>
                  <span>{label}</span>
                  <RangeBar value={score} low={0} high={1} />
                  <strong>{state}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
        </details>
      </section>
    </main>
  );
}

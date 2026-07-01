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
    label: "Revenue growth, años 1-5",
    fmt: "pct",
    low: 0.01,
    high: 0.18,
    falsifier: "El crecimiento queda bajo esta ruta por dos reportes seguidos.",
    source: "Ventas por segmento, backlog, demanda de clientes",
  },
  {
    key: "margin",
    label: "Operating margin, año 5",
    fmt: "pct",
    low: 0.08,
    high: 0.42,
    falsifier: "Los márgenes caen aunque mix, escala o pricing deberían ayudar.",
    source: "Operating profit después de ajustes contables",
  },
  {
    key: "roic",
    label: "ROIC, año 5",
    fmt: "pct",
    low: 0.06,
    high: 0.34,
    falsifier: "La nueva inversión gana menos que WACC por varios períodos.",
    source: "NOPAT e invested capital",
  },
  {
    key: "terminalRoic",
    label: "ROIC de largo plazo",
    fmt: "pct",
    low: 0.06,
    high: 0.24,
    falsifier: "Entra competencia y el pricing power no resiste.",
    source: "Historia, peers y estructura competitiva",
  },
  {
    key: "wacc",
    label: "Retorno exigido (WACC)",
    fmt: "pct",
    low: 0.055,
    high: 0.14,
    falsifier: "Tasas, leverage o riesgo del negocio cambian el retorno exigido.",
    source: "Risk-free rate, beta, credit spread, deuda",
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
    falsifier: "El crecimiento sigue en papel mientras capex o working capital se contraen.",
    source: "Capex, working capital, adquisiciones",
  },
  {
    key: "dilution",
    label: "Dilución accionaria",
    fmt: "pct",
    low: -0.02,
    high: 0.035,
    falsifier: "Los buybacks no impiden que suba el share count.",
    source: "SBC, buybacks, opciones, RSUs",
  },
  {
    key: "thesisQuality",
    label: "Evidencia de calidad del negocio",
    fmt: "score",
    low: 0.2,
    high: 0.95,
    falsifier: "Clientes, ventaja de producto o unit economics empeoran pese a la tesis.",
    source: "Moat, demanda de clientes, ejecución, optionality",
  },
  {
    key: "demandSupply",
    label: "Demanda vs oferta",
    fmt: "score",
    low: 0.15,
    high: 0.95,
    falsifier: "La demanda desacelera o la oferta nueva llega antes de que pricing ajuste.",
    source: "Backlog, capacidad, utilización, inventario, pricing",
  },
  {
    key: "bottleneckPower",
    label: "Ventaja por escasez",
    fmt: "score",
    low: 0.1,
    high: 0.98,
    falsifier: "Los clientes encuentran sustitutos o la capacidad deja de ser escasa.",
    source: "Escasez, sustitutos, switching cost, lead times",
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
  ["twin", "Drivers", "¿Qué tendría que ser cierto?"],
  ["bayes", "Escenarios", "¿Cuánta incertidumbre hay que admitir?"],
  ["value", "Valor", "¿Hay margen de seguridad suficiente?"],
  ["expect", "Precio implícito", "¿Qué CAGR y ROIC descuenta el mercado?"],
  ["flows", "Presión de mercado", "¿Puede moverse por flujos y no por valor?"],
  ["calibration", "Calibración", "¿La lectura ya tiene historial suficiente?"],
];

const SIMPLE_MODEL_LABELS = {
  dcf: "Valor por caja futura (DCF)",
  roicFade: "Durabilidad de ROIC",
  reverseDcf: "Expectativas implícitas",
  residualIncome: "Retorno sobre book value",
  assetValue: "Piso de activos",
  unitEconomics: "Unit economics",
  bottleneck: "Ventaja por escasez",
  realOptions: "Opcionalidad futura",
  ownerEarnings: "Owner earnings",
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
      <div className={styles.yAxis}>Long-run ROIC</div>
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
  if (status === "ok") return "Revisión final completa";
  if (status === "rate_limited") return "Revisión local lista; la revisión final está en pausa por límite de uso";
  if (status === "error") return "Revisión local lista; falló la revisión final";
  if (status === "unavailable") return "Revisión local lista; no se requiere llamada externa";
  return "Revisión local lista";
}

function adoptionStatusLabel(status) {
  return (
    {
      ready: "Usar calibrado",
      guardrailed: "Usar con limites",
      shadow: "Mostrar como comparacion",
      observe: "Juntar resultados",
      blocked: "No usar",
      missing: "Sin contrato",
    }[status] || "Revisar"
  );
}

function branchLabel(branch) {
  return (
    {
      calibrated: "Valor calibrado",
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
      explanation: "Este modo muestra como funcionara la calibracion, pero no reemplaza resultados reales.",
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
      reason: valuationRouter.decision?.reason || "La mezcla de datos y metodos no da una lectura confiable.",
      nextStep: "Revisar fuentes, supuestos y calidad de datos.",
    };
  }
  if (!isFiniteNumber(upside)) {
    return {
      tier: "ABSTAIN",
      reason: "No hay suficiente informacion para estimar la brecha entre precio y valor.",
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
      reason: "La brecha de valor sale de una tesis mucho mas optimista que lo que el precio descuenta.",
      nextStep: "Validar crecimiento, ROIC, margen y reinversion antes de rankearla.",
    };
  }
  if (feasibility < 0.34) {
    return {
      tier: "ABSTAIN",
      reason: "La historia necesita demasiadas cosas saliendo bien y la brecha de valor no compensa esa fragilidad.",
      nextStep: "Revisar supuestos antes de tomar una postura.",
    };
  }
  if (upside > 0.16 && feasibility > 0.58 && quality > 0.58 && tripwires.length <= 3) {
    return {
      tier: "RANK",
      reason: "La brecha, la factibilidad y la calidad de datos permiten compararla contra otras ideas.",
      nextStep: "Rankearla contra la watchlist y definir falsificadores.",
    };
  }
  return {
    tier: "RESEARCH",
    reason: "La idea tiene elementos interesantes, pero todavia necesita evidencia concreta.",
    nextStep: "Revisar los puntos criticos antes de darle prioridad.",
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
      ? `El precio necesita cerca de ${fmtPct(impliedCagr)} de Revenue CAGR para que la historia cierre.`
      : `El precio no esta exigiendo crecimiento alto: Revenue CAGR implicito ${fmtPct(impliedCagr)}.`,
    `La tesis actual usa ${fmtPct(adjustedDrivers.revenueCagr)} de Revenue CAGR y ${fmtPct(adjustedDrivers.margin)} de Operating margin.`,
    thesisMuchHigherThanPrice
      ? "La brecha positiva viene de una tesis mucho mas optimista que el precio, no de un precio exigente."
      : isFiniteNumber(upside) && upside >= 0
      ? `El valor estimado queda ${fmtPct(upside)} sobre el precio actual.`
      : `El precio actual ya parece exigir mas que el caso base.`,
  ];

  const mustTrue = [
    roicBelowHurdle
      ? `ROIC esta bajo WACC: ${fmtPct(adjustedDrivers.roic)} vs ${fmtPct(adjustedDrivers.wacc)}. Hay que explicar como vuelve a crear valor.`
      : `ROIC debe mantenerse por encima de WACC: ${fmtPct(adjustedDrivers.roic)} vs ${fmtPct(adjustedDrivers.wacc)}.`,
    reinvestmentHeavy
      ? `La tesis reinvierte casi todo el FCF: ${fmtPct(adjustedDrivers.reinvestment)}. Debe probar retorno incremental alto.`
      : `La reinversion debe sostener crecimiento sin comerse el FCF: ${fmtPct(adjustedDrivers.reinvestment)} reinvertido.`,
    `La ventaja competitiva debe durar cerca de ${fmtValue(adjustedDrivers.moatHalfLife, "yrs")}.`,
  ];

  const evidenceFor = [
    quality >= 0.62 ? "Datos suficientemente rastreables para una primera lectura." : null,
    adjustedDrivers.thesisQuality >= 0.68 ? "Calidad de tesis por encima del punto medio." : null,
    adjustedDrivers.demandSupply >= 0.65 ? "Oferta/demanda apoya la historia actual." : null,
    adjustedDrivers.bottleneckPower >= 0.62 ? "Hay senales de escasez o switching cost." : null,
  ].filter(Boolean);

  const evidenceAgainst = [
    adjustedDrivers.modelRisk >= 0.4 ? "Desacuerdo alto entre metodos o supuestos." : null,
    feasibility < 0.5 ? "Factibilidad baja: la tesis necesita validacion antes de rankear." : null,
    thesisMuchHigherThanPrice ? "La tesis asume mucho mas crecimiento que el precio implicito." : null,
    roicBelowHurdle ? "ROIC esta por debajo de WACC." : null,
    reinvestmentHeavy ? "La reinversion consume casi todo el FCF." : null,
    tripwires.length ? `${tripwires.length} supuestos estan cerca de zona de alerta.` : null,
    missingDrivers.length ? "Faltan inputs especificos del ticker." : null,
  ].filter(Boolean);

  const review = [
    missingDrivers.length ? `Completar: ${missingDrivers.slice(0, 3).join(", ")}.` : null,
    adjustedDrivers.modelRisk >= 0.35 ? "Revisar por que los metodos discrepan." : null,
    thesisMuchHigherThanPrice ? "Comprobar si la empresa puede sostener una ruta muy superior a la implicita en precio." : null,
    roicBelowHurdle ? "Identificar que cambio haria que ROIC vuelva a superar WACC." : null,
    reinvestmentHeavy ? "Separar reinversion de mantenimiento vs crecimiento real." : null,
    adjustedDrivers.demandSupply < 0.62 ? "Buscar evidencia de demanda, capacidad, inventario o pricing." : null,
    liveSnapshot?.coverage?.braveConfigured === false ? "Agregar evidencia externa de noticias o catalizadores." : null,
    valuationRouter?.decision?.reason || null,
  ].filter(Boolean).slice(0, 4);

  const breaks = (tripwires.length ? tripwires : []).slice(0, 4).map((item) => item.falsifier);
  if (!breaks.length) {
    breaks.push("Dos reportes seguidos bajo la ruta de crecimiento asumida.");
    breaks.push("Margen bruto cae mas de 300 bps sin explicacion de mix o pricing.");
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
    <section className={styles.routerPanel} aria-label="Valuation method mix">
      <div>
        <span>Mezcla de métodos</span>
        <h2>Por qué usa estos lentes</h2>
        <p>
          No todas las empresas se leen igual. Un banco, una compañía de software y un proveedor
          de semiconductores no deberían pasar por el mismo DCF fijo.
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
          <strong>Métodos usados</strong>
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
      note: gate.memo?.explanation || "Define si la lectura calibrada puede usarse, verse solo como comparación o bloquearse.",
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
    <div className={styles.calibrationContract} aria-label="Contrato de calibracion contextual">
      <div>
        <span>Permiso de calibracion</span>
        <strong>{adoptionStatusLabel(gate.status)}</strong>
        <p>
          Este panel decide si el ajuste calibrado puede cambiar la lectura o si debe quedar solo como
          comparacion. Sin resultados reales suficientes, el valor original sigue siendo la lectura principal.
        </p>
        <div className={styles.branchMix}>
          <div>
            <span>Rama principal</span>
            <strong>{branchLabel(primaryBranch)}</strong>
          </div>
          <div>
            <span>Peso calibrado</span>
            <strong>{fmtPct(calibratedWeight, 0)}</strong>
          </div>
          <div>
            <span>Peso original</span>
            <strong>{fmtPct(rawWeight, 0)}</strong>
          </div>
          <div>
            <span>Solo comparacion</span>
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
      eyebrow: "Confiabilidad de inputs",
      title: "Fuentes y trazabilidad",
      copy:
        missingDrivers.length > 0
          ? "Faltan inputs en vivo, por lo que la valoración debe leerse como borrador."
          : "Los inputs centrales están presentes y se pueden rastrear a sus fuentes.",
      plain: "¿Podemos confiar en los números antes de leer la valoración?",
      technical: "Revisa SEC companyfacts, precio de mercado, tasa libre de riesgo, campos faltantes y linaje de fuentes.",
      metrics: [
        ["Filing SEC", liveSnapshot ? `${liveSnapshot.company?.form || "SEC"} / FY${fiscalYear}` : "Datos de ejemplo"],
        ["Política sectorial", assumptions.industry?.label || "Supuesto de ejemplo"],
        ["Precio", coverage.quoteSource || "Faltante"],
        ["Calidad de datos", fmtPct(quality, 0), quality >= 0.65 ? "good" : "warn"],
      ],
      bullets: [
        liveSnapshot
          ? `SEC companyfacts: ${coverage.secCompanyFacts ? "cargado" : "no cargado"}`
          : "Se usa una empresa de ejemplo hasta cargar un snapshot SEC real.",
        assumptions.riskFree
          ? `Ancla risk-free: ${fmtOptional(assumptions.riskFree.value, fmtPct)} desde ${assumptions.riskFree.source}.`
          : coverage.fredConfigured
            ? "La fuente de tasa libre de riesgo está configurada."
            : "La fuente de tasa libre de riesgo no está configurada.",
        assumptions.industry?.sicDescription ? `Industria SEC: ${assumptions.industry.sicDescription}.` : null,
        coverage.quoteSource ? `Fuente de precio disponible: ${coverage.quoteSource}.` : "La fuente de precio falta o no respondió.",
        isFiniteNumber(facts.revenue) ? `Revenue: ${factMoney(facts.revenue)}` : null,
        missingDrivers.length ? `Faltante: ${missingDrivers.join(", ")}` : null,
      ],
    },
    accounting: {
      eyebrow: "Caja y retornos",
      title: "FCF, ROIC y WACC",
      copy:
        "Los estados financieros se traducen a caja, márgenes y retorno sobre capital.",
      plain: "¿El negocio produce caja valiosa?",
      technical: "Compara FCF por acción, margen, ROIC, WACC, reinversión y crecimiento de largo plazo.",
      metrics: [
        ["FCF / share", fmtMoney(adjustedDrivers.baseFcf)],
        ["Revenue CAGR", fmtOptional(adjustedDrivers.revenueCagr, fmtPct)],
        ["Margen", fmtOptional(adjustedDrivers.margin, fmtPct)],
        ["ROIC - WACC", fmtOptional(adjustedDrivers.roic - adjustedDrivers.wacc, fmtPct), adjustedDrivers.roic >= adjustedDrivers.wacc ? "good" : "bad"],
      ],
      bullets: [
        assumptions.wacc && isFiniteNumber(assumptions.wacc.beta)
          ? `WACC build: beta ${assumptions.wacc.beta.toFixed(2)}, ERP ${fmtPct(assumptions.wacc.equityRiskPremium)}, debt weight ${fmtPct(assumptions.wacc.debtWeight)}.`
          : null,
        `Reinvestment rate: ${fmtOptional(adjustedDrivers.reinvestment, fmtPct)}.`,
        `Terminal growth: ${fmtOptional(adjustedDrivers.terminalGrowth, fmtPct)}.`,
        isFiniteNumber(adjustedDrivers.roic) && isFiniteNumber(adjustedDrivers.wacc) && adjustedDrivers.roic < adjustedDrivers.wacc
          ? "Alerta contable: ROIC no supera WACC."
          : "El negocio supera el umbral básico de ROIC.",
        isFiniteNumber(facts.operatingCashFlow) ? `Operating cash flow: ${factMoney(facts.operatingCashFlow)}.` : null,
        isFiniteNumber(facts.capex) ? `Capex: ${factMoney(facts.capex)}.` : null,
      ],
    },
    twin: {
      eyebrow: "Lógica del negocio",
      title: "Drivers de tesis",
      copy:
        "La tesis se separa en drivers que se pueden cambiar, probar y falsificar.",
      plain: "¿Qué tendría que ser cierto para que esta inversión funcione?",
      technical: "Conecta crecimiento, reinversión, ROIC fade, durabilidad de ventaja y pruebas de alerta.",
      metrics: [
        ["Escenario", mode],
        ["Evidencia de negocio", fmtValue(adjustedDrivers.thesisQuality, "score")],
        ["Demand / supply", fmtValue(adjustedDrivers.demandSupply, "score")],
        ["Ventaja por escasez", fmtValue(adjustedDrivers.bottleneckPower, "score")],
        ["Alertas", String(tripwires.length), tripwires.length > 3 ? "warn" : "neutral"],
      ],
      bullets: [
        `Current value path: ${fmtMoney(valuation)} versus price ${fmtMoney(adjustedDrivers.price)}.`,
        `Long-run ROIC ${fmtOptional(adjustedDrivers.terminalRoic, fmtPct)} is compared with WACC ${fmtOptional(adjustedDrivers.wacc, fmtPct)}.`,
        `Business evidence ${fmtValue(adjustedDrivers.thesisQuality, "score")} adjusts confidence in how long high ROIC can last.`,
        `Scarcity advantage ${fmtValue(adjustedDrivers.bottleneckPower, "score")} asks whether customers have good substitutes.`,
        activeFalsifiers[0] || "No warning test is currently at the edge of its range.",
        activeFalsifiers[1] || null,
      ],
    },
    bayes: {
      eyebrow: "Escenarios",
      title: "Confianza de escenario",
      copy:
        "Compara tu tesis con los supuestos que el precio ya trae dentro.",
      plain: "¿Cuánta confianza corresponde después de admitir incertidumbre?",
      technical: "Usa factibilidad, crecimiento implícito, probabilidad sobre precio y penalización por desacuerdo.",
      metrics: [
        ["Factibilidad", fmtPct(feasibility, 0), feasibility >= 0.55 ? "good" : "warn"],
        ["Sobre precio", fmtPct(distribution.probAbovePrice, 0)],
        ["CAGR implícito", fmtPct(impliedCagr)],
        ["Soporte de negocio", fmtValue((adjustedDrivers.thesisQuality + adjustedDrivers.demandSupply + adjustedDrivers.bottleneckPower) / 3, "score")],
      ],
      bullets: [
        `Expected 5Y IRR: ${fmtPct(expectedIrr)}.`,
        `Upside/downside: ${fmtPct(upside)}.`,
        isFiniteNumber(impliedCagr) && isFiniteNumber(adjustedDrivers.revenueCagr) && impliedCagr > adjustedDrivers.revenueCagr
          ? "El crecimiento implícito del mercado supera el input de tesis."
          : "Thesis growth is not below market-implied growth.",
        missingDrivers.length ? "El rango debe mantenerse amplio porque faltan datos en vivo." : null,
      ],
    },
    value: {
      eyebrow: "Valor",
      title: "Estimación de valor",
      copy: "El valor estimado se compara con precio, retorno esperado y desacuerdo entre métodos.",
      plain: "¿El precio actual deja margen de seguridad suficiente?",
      technical: "Ancla en DCF y ROIC fade; luego contrasta book value, piso de activos, owner earnings y downside.",
      metrics: [
        ["Valor / acción", fmtMoney(valuation)],
        ["Precio", fmtMoney(adjustedDrivers.price)],
        ["Upside", fmtPct(upside), upside >= 0 ? "good" : "bad"],
        ["IRR esperado", fmtPct(expectedIrr)],
      ],
      bullets: [
        "DCF and ROIC durability are the main checks; other methods show whether the result is fragile.",
        `Probability above price: ${fmtPct(distribution.probAbovePrice, 0)}.`,
      ],
    },
    expect: {
      eyebrow: "Precio implícito",
      title: "Lo que exige el precio",
      copy: "Muestra el crecimiento y ROIC necesarios para justificar el precio actual.",
      plain: "¿Qué supone ya el precio de la acción?",
      technical: "Reverse DCF despeja crecimiento implícito contra ROIC de largo plazo y WACC.",
      metrics: [
        ["CAGR implícito", fmtPct(impliedCagr)],
        ["CAGR tesis", fmtOptional(adjustedDrivers.revenueCagr, fmtPct)],
        ["Factibilidad", fmtPct(feasibility, 0)],
        ["Falsificadores", String(tripwires.length)],
      ],
      bullets: [
        "Use the grid below to see where market expectations become plausible or fragile.",
        assumptions.wacc ? `WACC queda acotado por la política ${assumptions.industry?.label || "seleccionada"} antes de leer el Reverse DCF.` : null,
        activeFalsifiers[0] || null,
      ],
    },
    flows: {
      eyebrow: "Presión de mercado",
      title: "Flujos y contexto",
      copy: "La mecánica de mercado se mantiene separada del valor económico del negocio.",
      plain: "¿La acción puede moverse por razones ajenas al valor del negocio?",
      technical: "Sigue beta, dilución/buybacks, presión pasiva, short interest y liquidez.",
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
      eyebrow: "Calibración",
      title: "Permiso de uso",
      copy: "La calibración decide si la lectura ajustada puede usarse, compararse o bloquearse.",
      plain: "¿La lectura tiene suficientes resultados pasados para ganar confianza?",
      technical: "Combina calidad de datos, desacuerdo, resultados realizados, segmento comparable y revisión final.",
      metrics: [
        ["Data quality", fmtPct(quality, 0)],
        ["Desacuerdo", fmtPct(adjustedDrivers.modelRisk, 0)],
        ["Uso permitido", adoptionStatusLabel(activeCalibrationGate.status)],
        ["Resultados medidos", activeCalibrationGate.evidence?.scoredRecords === undefined ? "Vista previa" : `${activeCalibrationGate.evidence.scoredRecords}/${activeCalibrationGate.evidence.minRecords || "?"}`],
      ],
      bullets: [
        "The original valuation stays primary until enough past predictions have been scored.",
        "Calibration is checked by horizon and business type, not only in aggregate.",
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
    <section className={styles.engineConsole} aria-label="Valuation engine console">
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
            {debateStatus.state === "loading" ? "Revisando" : "Correr revisión final"}
          </button>
          <small>Primero revisión local / máximo una llamada final</small>
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
          <strong>Review status</strong>
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
              <p>{finalAnalysis?.one_line_conclusion || finalAnalysis?.executive_judgment}</p>
            </div>
            <div className={styles.verdictBadges}>
              <mark>{final ? statusCopy(final.status) : "Veredicto local"}</mark>
              {researchability?.grade ? <mark>Ficha {researchability.grade}</mark> : null}
              {finalAnalysis?.composite_score ? <mark>{finalAnalysis.composite_score}/5</mark> : null}
            </div>
          </div>
          <div className={styles.committeeStrip}>
            <div>
              <span>Investigabilidad</span>
              <strong>{researchability?.label || "Ficha de fuentes pendiente"}</strong>
              <p>{researchability?.strategy || "Carga una empresa y corre la revisión final."}</p>
            </div>
            <div>
              <span>Bloqueos</span>
              <strong>{quickKill?.hard_fail ? "Bloqueo activado" : `${quickKill?.tally?.fail || 0} fallas / ${quickKill?.tally?.warn || 0} alertas`}</strong>
              <p>{quickKill?.hard_fail ? "La lectura bloquea tamaño hasta reparar el punto señalado." : "Sin bloqueo duro; lee las alertas antes de definir tamaño."}</p>
            </div>
            <div>
              <span>Evidencia próxima</span>
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
              <span>Seguimiento</span>
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
                <strong>Caso bull</strong>
                <BulletList items={bullCase} />
              </div>
            </article>
            <article className={styles.orchestratorCard}>
              <span>Cuestionamiento</span>
              <div>
                <strong>Caso bear</strong>
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
          label: "Industry policy",
          value: assumptionPolicy.industry?.label || "Empresa operativa amplia",
          note: assumptionPolicy.industry?.sicDescription || "Ticker y perfil SEC",
        },
        {
          label: "Risk-free anchor",
          value: fmtOptional(assumptionPolicy.riskFree?.value, fmtPct),
          note: assumptionPolicy.riskFree?.date
            ? `${assumptionPolicy.riskFree.source} / ${assumptionPolicy.riskFree.date}`
            : assumptionPolicy.riskFree?.source || "Fallback explícito",
        },
        {
          label: "WACC build",
          value: fmtOptional(assumptionPolicy.wacc?.value, fmtPct),
          note: isFiniteNumber(assumptionPolicy.wacc?.beta)
            ? `Beta ${assumptionPolicy.wacc.beta.toFixed(2)} + ERP ${fmtPct(assumptionPolicy.wacc.equityRiskPremium)}`
            : "Rate, beta, spread, tax",
        },
        {
          label: "Policy confidence",
          value: fmtOptional(assumptionPolicy.industry?.confidence, (value) => fmtPct(value, 0)),
          note: "Facts cargados + ciclicidad sectorial",
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
        message: "El ticker debe tener 1-12 letras, numeros, puntos o guiones.",
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
          <strong>Valuation OS</strong>
        </div>
        <div className={styles.companyCard}>
          <span>Company</span>
          <strong>{adjustedDrivers.ticker}</strong>
          <small>{adjustedDrivers.name}</small>
          <em>{adjustedDrivers.sector}</em>
        </div>
        <nav className={styles.engineNav} aria-label="Valuation engines">
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
            Combina brecha de valor, factibilidad, calidad de fuentes, evidencia de negocio, oferta/demanda y alertas.
          </p>
          <dl>
            <div>
              <dt>Alertas</dt>
              <dd>{tripwires.length} / {assumptionSchema.length}</dd>
            </div>
            <div>
              <dt>Factibilidad</dt>
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
            <h1>AURORA Valuation OS</h1>
            <p>
              Una mesa de valoración que muestra qué cree el precio, qué debe demostrar el negocio
              y qué evidencia debilitaría la tesis.
            </p>
            <div className={styles.heroSummary}>
              <span>Lectura</span>
              <strong>{plainRead}</strong>
              <span>{fmtPct(upside)} brecha de valor</span>
              <span>{fmtPct(feasibility, 0)} ajuste de tesis</span>
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
                {liveStatus.state === "loading" ? "Cargando" : "Cargar empresa"}
              </button>
            </form>
            <select value={companyKey} onChange={(event) => selectCompany(event.target.value)}>
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
                  {(operationalLadder.evidenceFor.length ? operationalLadder.evidenceFor : ["No hay evidencia positiva suficiente todavia."]).map((item) => (
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
                {(operationalLadder.review.length ? operationalLadder.review : ["Revisar el proximo reporte y comparar contra peers."]).map((item) => <li key={item}>{item}</li>)}
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
          <summary>Ver el analisis completo</summary>

        <section className={styles.orientationStrip} aria-label="Guía de lectura de AURORA">
          <div>
            <span>1 Fuentes</span>
            <strong>Filings, precio, tasas</strong>
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
            <strong>Supuestos + falsificadores</strong>
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
              <mark>ROIC fade</mark>
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
                <h3>{fmtPct(adjustedDrivers.roic)} Y5 ROIC</h3>
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
                  <th>Revenue CAGR</th>
                  <td>{fmtPct(impliedCagr)}</td>
                  <td>{fmtPct(adjustedDrivers.revenueCagr)}</td>
                </tr>
                <tr>
                  <th>Terminal ROIC</th>
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
                <span>Confiabilidad de inputs</span>
                <h3>{fmtPct(quality, 0)} usable</h3>
                <p>Muestra si la lectura usa datos vivos y rastreables.</p>
              </div>
              <mark>Latest SEC</mark>
            </div>
            <div className={styles.qualityDial} style={{ "--score": `${quality * 100}%` }}>
              <strong>{fmtPct(quality, 0)}</strong>
              <span>rastreable</span>
            </div>
            {liveSnapshot ? (
              <div className={styles.coverageList}>
                <div>
                  <span>SEC companyfacts</span>
                  <strong>cargado</strong>
                </div>
                <div>
                  <span>FRED</span>
                  <strong>{liveSnapshot.coverage?.fredConfigured ? "configurado" : "faltante"}</strong>
                </div>
                <div>
                  <span>Fuente de precio</span>
                  <strong>{liveSnapshot.coverage?.quoteSource || "faltante"}</strong>
                </div>
                <div>
                  <span>FMP key</span>
                  <strong>{liveSnapshot.coverage?.fmpConfigured ? "configurada" : "key local faltante"}</strong>
                </div>
              </div>
            ) : (
              <p>Los filings SEC son la fuente primaria; los feeds auxiliares son secundarios.</p>
            )}
          </article>
        </section>

        <section className={styles.bottomGrid}>
          <article className={styles.outputPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Lectura</span>
                <h2>Qué está diciendo ahora</h2>
                <p>The read combines price gap, thesis fit, input quality, and active warnings.</p>
              </div>
              <mark>{selectedEngine?.[1]}</mark>
            </div>
            <div className={styles.outputStrip}>
              <div>
                <span>Valor / acción</span>
                <strong>{fmtMoney(valuation)}</strong>
              </div>
              <div data-tone={isFiniteNumber(upside) && upside >= 0 ? "good" : "bad"}>
                <span>Brecha de valor</span>
                <strong>{fmtPct(upside)}</strong>
              </div>
              <div>
                <span>IRR esperado 5Y</span>
                <strong>{fmtPct(expectedIrr)}</strong>
              </div>
              <div>
                <span>Factibilidad</span>
                <strong>{fmtPct(feasibility, 0)}</strong>
              </div>
              <div>
                <span>Alertas activas</span>
                <strong>{tripwires.length}</strong>
              </div>
            </div>
            <p>
              Esto no es un target price único. Muestra qué exige el mercado, qué supuestos sostienen la tesis y qué alerta conviene vigilar primero.
            </p>
          </article>

          <article className={styles.flowPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Presión de mercado</span>
                <h2>Separada del valor del negocio</h2>
              </div>
              <mark>Contexto de trading</mark>
            </div>
            <div className={styles.flowStack}>
              {[
                ["ETF / compras pasivas", "Neutral", 0.48],
                ["Insiders / nuevas acciones", "Vigilar", 0.38],
                ["Soporte de buybacks", "Positivo", 0.64],
                ["Short interest / opciones", "Elevado", 0.57],
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

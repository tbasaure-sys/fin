import "server-only";

import { buildAuroraDecisionSystem } from "../aurora/decision-system.js";
import { buildIndicativeValuation } from "../aurora/indicative-valuation.js";
import { buildMosaicContext } from "../mosaic/context-contract.js";
import { explainValuationWithHuggingFace } from "./huggingface-valuation.js";
import { loadMacroBrainSnapshot } from "./macro-brain.js";
import { loadMosaicSnapshot } from "./mosaic-observatory.js";

export async function loadCurrentMosaicContext(options = {}) {
  const [mosaic, macro] = await Promise.all([
    options.mosaicSnapshot || loadMosaicSnapshot(),
    options.macroSnapshot || loadMacroBrainSnapshot(),
  ]);
  const rawMosaic = mosaic?.context?.raw;
  if (!rawMosaic || typeof rawMosaic !== "object") return mosaic?.context || null;
  return buildMosaicContext({
    mosaic: rawMosaic,
    macro: {
      run_date: macro?.runDate,
      generated_on: macro?.generatedOn,
      liquidity: {
        status: macro?.liquidity?.status,
        impulse: macro?.liquidity?.impulse,
        asOf: macro?.liquidity?.asOf,
        sourceIds: macro?.liquidity?.sourceIds,
        freshness: macro?.liquidity?.freshness,
        usable: macro?.liquidity?.usable,
        confidence: macro?.liquidity?.confidence,
      },
    },
    now: options.now || new Date().toISOString(),
  });
}

export async function attachAuroraDecisionSystem(payload, options = {}) {
  const hasMosaicOverride = Object.prototype.hasOwnProperty.call(options, "mosaicContext");
  let mosaicContext = hasMosaicOverride ? options.mosaicContext : null;
  if (!hasMosaicOverride) {
    try {
      mosaicContext = await loadCurrentMosaicContext();
    } catch {
      mosaicContext = null;
    }
  }
  const aurora = buildAuroraDecisionSystem({ research: payload, mosaicContext });
  const indicativeValuation = buildIndicativeValuation({ ...payload, aurora });
  const explainValuation = typeof options.explainValuation === "function"
    ? options.explainValuation
    : explainValuationWithHuggingFace;
  const explanation = await explainValuation(payload, indicativeValuation);
  return {
    ...payload,
    aurora: {
      ...aurora,
      indicativeValuation,
      explanation,
    },
  };
}

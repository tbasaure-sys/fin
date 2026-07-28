import "server-only";

import { buildAuroraDecisionSystem } from "../aurora/decision-system.js";
import { buildIndicativeValuation } from "../aurora/indicative-valuation.js";
import { buildMosaicContext } from "../mosaic/context-contract.js";
import { explainValuationWithHuggingFace } from "./huggingface-valuation.js";
import { loadMacroBrainSnapshot } from "./macro-brain.js";
import { loadMosaicSnapshot } from "./mosaic-observatory.js";

export async function loadCurrentMosaicContext() {
  const [mosaic, macro] = await Promise.all([
    loadMosaicSnapshot(),
    loadMacroBrainSnapshot(),
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
      },
    },
  });
}

export async function attachAuroraDecisionSystem(payload) {
  let mosaicContext = null;
  try {
    mosaicContext = await loadCurrentMosaicContext();
  } catch {
    mosaicContext = null;
  }
  const aurora = buildAuroraDecisionSystem({ research: payload, mosaicContext });
  const indicativeValuation = buildIndicativeValuation({ ...payload, aurora });
  const explanation = await explainValuationWithHuggingFace(payload, indicativeValuation);
  return {
    ...payload,
    aurora: {
      ...aurora,
      indicativeValuation,
      explanation,
    },
  };
}

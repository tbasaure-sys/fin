import "server-only";

import { composeBreakpointRun } from "../breakpoint/compose.js";
import { cleanBreakpointTicker } from "../breakpoint/contract.js";
import { buildBreakpointInputFromSnapshot, buildBreakpointSources } from "../breakpoint/snapshot-adapter.js";
import { runAuroraBeliefPipeline } from "../aurora-belief-pipeline.js";
import { buildValuationSnapshot } from "../../app/valuation-os-lab/api/snapshot/route.js";

export { buildBreakpointInputFromSnapshot } from "../breakpoint/snapshot-adapter.js";

function hasMinimumSnapshotCoverage(snapshot, input) {
  return Boolean(
    snapshot?.ok !== false
    && snapshot?.coverage?.secCompanyFacts
    && input?.market?.price > 0
    && input?.financials?.incomeStatements?.length >= 3
    && input?.financials?.cashFlows?.[0]?.operatingCashFlow > 0,
  );
}

export function createBreakpointService({ snapshotLoader, now = () => new Date().toISOString() } = {}) {
  if (typeof snapshotLoader !== "function") throw new Error("Breakpoint service requires a snapshot loader.");

  return {
    async run({ ticker, hurdleRate = 0.1, locale = "es" } = {}) {
      const symbol = cleanBreakpointTicker(ticker);
      if (!symbol) throw new Error("A valid ticker is required.");
      const snapshot = await snapshotLoader(symbol);
      const input = buildBreakpointInputFromSnapshot(snapshot);
      const sources = buildBreakpointSources(snapshot);

      if (!hasMinimumSnapshotCoverage(snapshot, input)) {
        return composeBreakpointRun({
          pipeline: {},
          snapshot: { ...snapshot, sources, company: { ...snapshot?.company, ticker: symbol } },
          ticker: symbol,
          hurdleRate,
          locale,
          now: now(),
        });
      }

      const builtAt = now();
      const pipeline = runAuroraBeliefPipeline(input, {
        asOfDate: snapshot.asOf || builtAt,
        ranAt: builtAt,
        builtAt,
      });
      return composeBreakpointRun({
        pipeline,
        snapshot: { ...snapshot, sources },
        hurdleRate,
        locale,
        now: builtAt,
      });
    },
  };
}

export function getLiveBreakpointService() {
  return createBreakpointService({ snapshotLoader: buildValuationSnapshot });
}

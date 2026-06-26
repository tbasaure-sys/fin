import assert from "node:assert/strict";
import test from "node:test";

import { buildAssumptionPolicy, classifyIndustry } from "../app/valuation-os-lab/assumption-policy.js";
import { parseTreasuryYieldCurve10Year } from "../app/valuation-os-lab/api/snapshot/route.js";

test("classifies ASML as semiconductor capital equipment", () => {
  assert.equal(
    classifyIndustry({
      name: "ASML HOLDING NV",
      sicDescription: "Semiconductors and related devices",
    }),
    "semiconductors",
  );
});

test("industry policy changes WACC and terminal ROIC across sectors", () => {
  const sharedInputs = {
    riskFreeRate: 0.042,
    roic: 0.13,
    capexToRevenue: 0.08,
    factsPresent: 8,
  };
  const semiconductor = buildAssumptionPolicy({
    ...sharedInputs,
    name: "ASML HOLDING NV",
    sicDescription: "Semiconductors and related devices",
  });
  const utility = buildAssumptionPolicy({
    ...sharedInputs,
    name: "Southern Co",
    sicDescription: "Electric services",
  });

  assert.equal(semiconductor.industryKey, "semiconductors");
  assert.equal(utility.industryKey, "utility");
  assert.ok(semiconductor.beta > utility.beta);
  assert.ok(semiconductor.wacc > utility.wacc);
  assert.ok(utility.terminalRoic <= utility.terminalRoicRange[1]);
});

test("assumption policy marks FRED-free fallback as an explicit USD anchor", () => {
  const policy = buildAssumptionPolicy({
    name: "Broad Co",
    sicDescription: "",
    riskFreeRate: null,
    roic: 0.11,
    capexToRevenue: 0.06,
    factsPresent: 4,
  });

  assert.equal(policy.riskFreeRate, 0.042);
  assert.match(policy.sources.join(" "), /fallback/i);
  assert.ok(policy.wacc >= policy.waccRange[0]);
  assert.ok(policy.wacc <= policy.waccRange[1]);
});

test("parses the latest Treasury 10Y yield from the official XML feed", () => {
  const xml = `
    <feed>
      <entry>
        <d:NEW_DATE m:type="Edm.DateTime">2026-06-25T00:00:00</d:NEW_DATE>
        <d:BC_10YEAR m:type="Edm.Double">4.44</d:BC_10YEAR>
      </entry>
      <entry>
        <d:NEW_DATE m:type="Edm.DateTime">2026-06-26T00:00:00</d:NEW_DATE>
        <d:BC_10YEAR m:type="Edm.Double">4.47</d:BC_10YEAR>
      </entry>
    </feed>
  `;

  assert.deepEqual(parseTreasuryYieldCurve10Year(xml), {
    date: "2026-06-26",
    value: 0.0447,
  });
});

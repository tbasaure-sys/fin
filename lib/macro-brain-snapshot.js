export const macroBrainSnapshot = {
  runDate: "2026-06-11",
  generatedOn: "2026-06-11T21:26:34.827873+00:00",
  observations: 99566,
  seriesCount: 20,
  shortRead:
    "Dollar pressure is mixed, copper has not confirmed the bullish case, and the market stress check is calm.",
  impulseChanges: [
    { label: "Gold", plain: "weaker", direction: "down", intensity: 1.88 },
    { label: "Colombia FX", plain: "less pressure", direction: "down", intensity: 1.79 },
    { label: "Credit", plain: "better", direction: "up", intensity: 1.18 },
    { label: "Chile FX", plain: "stronger", direction: "down", intensity: 1.11 },
    { label: "Brazil FX", plain: "weaker", direction: "up", intensity: 1.09 },
    { label: "Rates volatility", plain: "quieter", direction: "down", intensity: 0.96 },
  ],
  liquidity: {
    status: "Partial",
    summary:
      "The available liquidity data is still a headwind. One feed is missing, so this stays marked as partial.",
    direction: "negative",
    impulse: -35551,
    components: [
      { label: "Fed balance sheet", stance: "mild drag" },
      { label: "Treasury cash account", stance: "mild drain" },
      { label: "Reverse repo", stance: "waiting for feed" },
    ],
  },
  theses: [
    {
      id: "T1",
      title: "Strong dollar versus LatAm FX",
      expression: "Long DXY / long USDCLP-USDBRL basket",
      status: "Needs watching",
      state: "watch",
      confidence: 62,
      attention: 50,
      confirmations: 2,
      openQuestions: 1,
      contradictions: 2,
      why:
        "Brazil still helps the idea, but the broad dollar and Chile FX are pushing back.",
      canBreak: "Dollar keeps fading while LatAm FX strengthens.",
    },
    {
      id: "T2",
      title: "Structural floor in copper",
      expression: "Long copper / long Chile-linked beta",
      status: "Needs watching",
      state: "watch",
      confidence: 50,
      attention: 38,
      confirmations: 2,
      openQuestions: 1,
      contradictions: 1,
      why:
        "Chile FX and the dollar backdrop help, but copper itself has not joined in yet.",
      canBreak: "Copper momentum stays negative for another week.",
    },
    {
      id: "T3",
      title: "BCCh cuts before the Fed",
      expression: "Chile rates lower relative to US front-end",
      status: "Still open",
      state: "open",
      confidence: 56,
      attention: 50,
      confirmations: 0,
      openQuestions: 3,
      contradictions: 0,
      why:
        "Nothing is directly arguing against it, but some rate inputs are still missing.",
      canBreak: "Chile inflation reaccelerates or FX stress makes easing impractical.",
    },
  ],
  nextChecks: [
    { event: "US CPI", timing: "next release", value: 3.95 },
    { event: "China credit data", timing: "next release", value: 3.95 },
    { event: "US payrolls", timing: "Friday", value: 3.38 },
    { event: "CFTC positioning", timing: "Friday lag", value: 3.13 },
    { event: "Chile CPI / BCCh", timing: "next release", value: 2.68 },
  ],
  stability: {
    status: "Calm",
    rho: 0.35,
    range: "0.31-0.40",
    pressure: 7,
    fragileMode: ["USDCLP", "Copper", "Gold", "USDBRL"],
    read:
      "The stress check is not near its warning line. The main weak spot is still the dollar-Chile-copper link.",
  },
  ledger: {
    liveTheses: 3,
    rule:
      "Each idea is saved with a date, a market expression, a time frame, and the evidence that would change your mind.",
    question: "What would change your mind?",
  },
};

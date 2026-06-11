export const macroBrainSnapshot = {
  runDate: "2026-06-11",
  generatedOn: "2026-06-11T21:26:34.827873+00:00",
  observations: 99566,
  seriesCount: 20,
  dailyRead:
    "The system is not asking for more conviction today. It is asking which thesis can still carry doubt after the latest market moves.",
  impulseChanges: [
    { label: "Gold", plain: "lost momentum", direction: "down", intensity: 1.88 },
    { label: "Colombia FX", plain: "pressure cooled", direction: "down", intensity: 1.79 },
    { label: "Investment grade credit", plain: "improved", direction: "up", intensity: 1.18 },
    { label: "Chile FX", plain: "strengthened versus USD", direction: "down", intensity: 1.11 },
    { label: "Brazil FX", plain: "weakened versus USD", direction: "up", intensity: 1.09 },
    { label: "High yield credit", plain: "improved", direction: "up", intensity: 1.09 },
    { label: "Rates volatility", plain: "cooled", direction: "down", intensity: 0.96 },
    { label: "Dollar proxy", plain: "turned lower with persistence", direction: "down", intensity: 0.56 },
  ],
  liquidity: {
    status: "Partial read",
    summary:
      "US liquidity is still a headwind on the partial measure. The full measure waits for the missing reverse-repo feed.",
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
      status: "Watch closely",
      state: "conditional",
      confidence: 62,
      doubtUsed: 50,
      confirmations: 2,
      openQuestions: 1,
      contradictions: 2,
      why:
        "Brazil and copper still help the idea, but the broad dollar and Chile FX are already arguing back.",
      canBreak: "Dollar keeps fading while LatAm FX strengthens.",
    },
    {
      id: "T2",
      title: "Structural floor in copper",
      expression: "Long copper / long Chile-linked beta",
      status: "Watch closely",
      state: "conditional",
      confidence: 50,
      doubtUsed: 38,
      confirmations: 2,
      openQuestions: 1,
      contradictions: 1,
      why:
        "Chile FX and the dollar backdrop are less hostile, but copper itself has not confirmed the story yet.",
      canBreak: "Copper momentum stays negative for another week.",
    },
    {
      id: "T3",
      title: "BCCh cuts before the Fed",
      expression: "Chile rates lower relative to US front-end",
      status: "Licensed for now",
      state: "licensed",
      confidence: 56,
      doubtUsed: 50,
      confirmations: 0,
      openQuestions: 3,
      contradictions: 0,
      why:
        "No direct contradiction is active, but the rate inputs are incomplete, so the right posture is humble.",
      canBreak: "Chile inflation reaccelerates or FX stress makes easing impractical.",
    },
  ],
  defeaters: [
    { event: "US CPI", timing: "next release", value: 3.95 },
    { event: "China trade / credit impulse", timing: "next release", value: 3.95 },
    { event: "US payrolls", timing: "Friday", value: 3.38 },
    { event: "CFTC positioning", timing: "Friday lag", value: 3.13 },
    { event: "Chile CPI / BCCh", timing: "next release", value: 2.68 },
  ],
  stability: {
    status: "Regime looks stable today",
    rho: 0.35,
    range: "0.31-0.40",
    doubtUsed: 7,
    fragileMode: ["USDCLP", "Copper", "Gold", "USDBRL"],
    read:
      "The market state is not near the danger boundary. The fragile mode is still concentrated in dollar-Chile-copper links.",
  },
  ledger: {
    liveTheses: 3,
    rule:
      "Every thesis is opened before the outcome, with the market expression, horizon, confidence, asymmetry, and invalidation rule written down.",
    question: "What would make you flip today rather than merely reduce confidence?",
  },
};

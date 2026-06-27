function fmtPct(value, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "N/A";
}

function fmtMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  if (Math.abs(value) >= 1000) return `$${value.toFixed(0)}`;
  if (Math.abs(value) >= 100) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

function bullet(lines) {
  return lines.filter(Boolean).map((line) => `- ${line}`);
}

export function renderValuationMemo({ ctx = {}, debate = {}, analysis = {} }) {
  const quality = debate.context_pack?.dataQuality || ctx.contextPack?.dataQuality || {};
  const catalysts = debate.catalyst_pack?.dominantCatalysts || ctx.catalystPack?.dominantCatalysts || [];
  const title = `${ctx.ticker || "Ticker"} Valuation OS memo`;
  const lines = [
    `# ${title}`,
    "",
    `Decision: ${analysis.decision || "Watch"}`,
    `Action: ${analysis.action || "watch"}`,
    `Context quality: ${quality.overallScore ?? "N/A"}/100${quality.level ? ` (${quality.level})` : ""}`,
    "",
    "## One Line",
    analysis.one_line_conclusion || "No final conclusion available.",
    "",
    "## Valuation",
    ...bullet([
      `Fair value: ${fmtMoney(ctx.valuation)} versus price ${fmtMoney(ctx.drivers?.price)}.`,
      `Upside/downside: ${fmtPct(ctx.upside)}.`,
      `Expected IRR: ${fmtPct(ctx.expectedIrr)}.`,
      `Dominant model: ${ctx.router?.dominantModel?.label || "N/A"}.`,
    ]),
    "",
    "## Catalyst Map",
    ...(catalysts.length
      ? bullet(catalysts.map((item) => `${item.label}: ${fmtPct(item.score, 0)} (${item.stance}). ${item.evidence?.[0] || ""}`))
      : ["- No catalyst map available."]),
    "",
    "## Bull Case",
    ...bullet(analysis.bull_case || []),
    "",
    "## Bear Case",
    ...bullet(analysis.bear_case || []),
    "",
    "## Kill Criteria",
    ...bullet(analysis.kill_criteria || []),
    "",
    "## Open Questions",
    ...bullet(analysis.open_questions || []),
  ];

  return {
    title,
    format: "markdown",
    markdown: lines.join("\n").replace(/\n{3,}/g, "\n\n"),
    generatedAt: new Date().toISOString(),
  };
}

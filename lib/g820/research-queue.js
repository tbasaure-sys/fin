export function selectResearchQueue(companies, queue = 'all') {
  const rows = [...companies];
  if (queue !== 'discounts') return rows;
  return rows.filter((row) => {
    const mos = row.dailyPrice ? row.dailyPrice.actualMos : row.actualMos;
    return Number.isFinite(mos) && mos > 0
      && ['DATA_EXCEPTION', 'WATCH_FOR_PRICE', 'RESEARCH_NOW'].includes(row.category);
  }).sort((a, b) => ((b.dailyPrice?.safetySurplus ?? b.safetySurplus ?? -Infinity)
    - (a.dailyPrice?.safetySurplus ?? a.safetySurplus ?? -Infinity)) || a.ticker.localeCompare(b.ticker));
}

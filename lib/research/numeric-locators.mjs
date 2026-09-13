// Syntax classification only. Accepting a date or document locator does not
// establish that the source supports its period, amount, or interpretation.
const year = '(?:19|20)\\d{2}';
const day = '(?:0?[1-9]|[12]\\d|3[01])';
const month = '(?:enero|january|ene|jan|febrero|february|feb|marzo|march|mar|abril|april|abr|apr|mayo|may|junio|june|jun|julio|july|jul|agosto|august|ago|aug|septiembre|september|sept|sep|octubre|october|oct|noviembre|november|nov|diciembre|december|dic|dec)';
const dash = '[-\\u2010-\\u2013]';
const space = '(?:\\s+(?:(?:de|of)\\s+)?)';
const form = `(?:10${dash}[KQ]|8${dash}K)(?:/A)?`;
const patterns = [
  `(?:informe (?:anual|trimestral)|(?:annual|quarterly) report|${form})\\s+(?:Q[1-4]\\s+)?${year}`,
  `Q[1-4]\\s+${year}|${year}\\s+Q[1-4]`,
  `${year}-[01]\\d-[0-3]\\d`,
  `${day}${dash}${month}${dash}${year}`,
  `${day}${space}${month}\\b\\.?(?:${space}${year})?`,
  `${month}\\b\\.?${space}${year}`,
  `${month}\\b\\.?\\s+${day}(?:,?\\s+${year})?`,
  `(?:(?:trimestre|meses|año|ejercicio|período|periodo|quarter|months|year)(?:\\s+(?:de|del|of|in))?|en|in)\\s+${year}`,
  `(?:frente a|compared (?:with|to)|versus|vs\\.?)\\s+${year}`,
  '(?:Microsoft|Office)\\s*365',
  form,
  '(?:note|nota)\\s+\\d{1,3}',
  'item\\s+(?:1[0-6]|[1-9])[A-C]?',
];
const locators = new RegExp(`\\b(?:${patterns.join('|')})\\b`, 'giu');
const financialSuffix = /^\s*(?:[%$€£]|[.,]\d|mil\w*|bill\w*|trill\w*|bn\b|USD\b|EUR\b|GBP\b|d[oó]lares\b|dollars\b|euros\b|percent\b|por ciento\b)/iu;
const currencyPrefix = /(?:[$€£]|\b(?:USD|EUR|GBP))\s*$/iu;

export function hasNonLocatorDigits(text) {
  const remainder = text.replace(locators, (match, offset) => {
    if (currencyPrefix.test(text.slice(0, offset)) || financialSuffix.test(text.slice(offset + match.length))) return match;
    return ' ';
  });
  return /[0-9]/.test(remainder);
}

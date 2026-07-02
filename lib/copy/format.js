const LOCALE_BY_LANGUAGE = {
  en: "en-US",
  es: "es-CL",
};

function localeFor(language) {
  return LOCALE_BY_LANGUAGE[language] || LOCALE_BY_LANGUAGE.en;
}

function finiteNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function formatPercent(value, { language = "en", digits = 1, signed = false } = {}) {
  const number = finiteNumber(value);
  if (number === null) return "-";
  const formatter = new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    signDisplay: signed ? "always" : "auto",
    style: "percent",
  });
  return formatter.format(Math.abs(number) > 1.5 ? number / 100 : number);
}

export function formatNumber(value, { language = "en", digits = 1, signed = false } = {}) {
  const number = finiteNumber(value);
  if (number === null) return "-";
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    signDisplay: signed ? "always" : "auto",
  }).format(number);
}

export function formatCompactMoney(value, { language = "en", currency = "USD" } = {}) {
  const number = finiteNumber(value);
  if (number === null) return "-";
  return new Intl.NumberFormat(localeFor(language), {
    compactDisplay: "short",
    currency,
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(number);
}

export function cleanDisplayValue(value) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

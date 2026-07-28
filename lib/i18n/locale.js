export const LANGUAGE_COOKIE_KEY = "blsprime_language_preference";
export const LANGUAGE_REQUEST_HEADER = "x-bls-locale";

const SUPPORTED_LOCALES = new Set(["en", "es"]);
const SPANISH_ONLY_ROUTES = new Set(["/aurora", "/valuation-os-lab"]);

function normalizePathname(pathname) {
  return String(pathname || "/").replace(/\/+$/, "") || "/";
}

export function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.has(String(value || "").toLowerCase());
}

export function shouldPersistQueryLocale({ pathname = "/", queryLanguage } = {}) {
  if (!isSupportedLocale(queryLanguage)) return false;
  return !SPANISH_ONLY_ROUTES.has(normalizePathname(pathname));
}

export function normalizeLocale(value, fallback = "es") {
  const normalized = String(value || "").toLowerCase();
  return SUPPORTED_LOCALES.has(normalized) ? normalized : fallback;
}

export const DEFAULT_LOCALE = "es";

// Every route resolves to the same default. Previously /factorlab and /stress
// defaulted to "en" while the rest of the product defaulted to "es", which is
// what produced mixed-language views and an English first paint under lang="es".
export function routeDefaultLocale() {
  return DEFAULT_LOCALE;
}

export function resolveRequestLocale({
  pathname = "/",
  queryLanguage,
  cookieLanguage,
} = {}) {
  if (SPANISH_ONLY_ROUTES.has(normalizePathname(pathname))) return "es";
  if (isSupportedLocale(queryLanguage)) return normalizeLocale(queryLanguage);
  if (isSupportedLocale(cookieLanguage)) return normalizeLocale(cookieLanguage);
  return routeDefaultLocale(pathname);
}

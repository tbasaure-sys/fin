export const LANGUAGE_COOKIE_KEY = "blsprime_language_preference";
export const LANGUAGE_REQUEST_HEADER = "x-bls-locale";

const SUPPORTED_LOCALES = new Set(["en", "es"]);
const SPANISH_ONLY_ROUTES = new Set(["/aurora", "/valuation-os-lab"]);

export function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.has(String(value || "").toLowerCase());
}

export function normalizeLocale(value, fallback = "es") {
  const normalized = String(value || "").toLowerCase();
  return SUPPORTED_LOCALES.has(normalized) ? normalized : fallback;
}

export function routeDefaultLocale(pathname = "/") {
  const route = String(pathname || "/");
  if (SPANISH_ONLY_ROUTES.has(route)) return "es";
  if (route === "/factorlab" || route === "/stress") return "en";
  return "es";
}

export function resolveRequestLocale({
  pathname = "/",
  queryLanguage,
  cookieLanguage,
} = {}) {
  if (SPANISH_ONLY_ROUTES.has(String(pathname || "/"))) return "es";
  if (isSupportedLocale(queryLanguage)) return normalizeLocale(queryLanguage);
  if (isSupportedLocale(cookieLanguage)) return normalizeLocale(cookieLanguage);
  return routeDefaultLocale(pathname);
}

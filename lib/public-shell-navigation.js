const COPY = {
  es: {
    product: "Ejemplo",
    research: "Investigar",
    tools: "Herramientas",
    portfolios: "Carteras",
    methodology: "Método",
    signIn: "Iniciar sesión",
    signUp: "Crear cuenta",
  },
  en: {
    product: "Example",
    research: "Research",
    tools: "Tools",
    portfolios: "Portfolios",
    methodology: "Method",
    signIn: "Sign in",
    signUp: "Create account",
  },
};

// Public engines are presented together under "Tools" (the /product index).
const TOOL_ROUTES = ["/product", "/aurora", "/factorlab", "/g820", "/stress", "/macro-brain", "/channels", "/breakpoint", "/company"];

const TOOL_LINKS = {
  es: [
    { id: "aurora", label: "AURORA · Valoración", path: "/aurora" },
    { id: "factorlab", label: "FactorLab · Descubrimiento", path: "/factorlab" },
    { id: "g820", label: "G820 · Screener", path: "/g820" },
    { id: "stress", label: "Stress · Riesgo de cartera", path: "/stress" },
    { id: "macro-brain", label: "Macro Brain", path: "/macro-brain" },
    { id: "channels", label: "Channel Finder", path: "/channels" },
  ],
  en: [
    { id: "aurora", label: "AURORA · Valuation", path: "/aurora" },
    { id: "factorlab", label: "FactorLab · Discovery", path: "/factorlab" },
    { id: "g820", label: "G820 · Screener", path: "/g820" },
    { id: "stress", label: "Stress · Portfolio risk", path: "/stress" },
    { id: "macro-brain", label: "Macro Brain", path: "/macro-brain" },
    { id: "channels", label: "Channel Finder", path: "/channels" },
  ],
};

function normalizeLocale(locale) {
  return locale === "en" ? "en" : "es";
}

function matches(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function buildPublicNavigation({ locale, pathname = "/" } = {}) {
  const language = normalizeLocale(locale);
  const copy = COPY[language];

  return [
    { id: "product", label: copy.product, href: `/example?lang=${language}`, current: pathname === "/example" },
    { id: "research", label: copy.research, href: `/research?lang=${language}`, current: pathname === "/research" },
    { id: "tools", label: copy.tools, href: `/product?lang=${language}`, current: TOOL_ROUTES.some((route) => matches(pathname, route)) },
    { id: "portfolios", label: copy.portfolios, href: `/app/carteras?lang=${language}`, current: matches(pathname, "/app/carteras") },
    { id: "methodology", label: copy.methodology, href: `/methodology?lang=${language}`, current: pathname === "/methodology" },
  ];
}

export function buildToolLinks(locale) {
  const language = normalizeLocale(locale);
  return TOOL_LINKS[language].map((item) => ({ ...item, href: `${item.path}?lang=${language}` }));
}

export function buildPublicShellActions(locale) {
  const language = normalizeLocale(locale);
  const copy = COPY[language];

  return {
    signIn: {
      label: copy.signIn,
      href: `/login?intent=signin&lang=${language}`,
    },
    signUp: {
      label: copy.signUp,
      href: `/signup?lang=${language}`,
    },
  };
}

const COPY = {
  es: {
    product: "Ver ejemplo",
    research: "Investigar",
    g820: "G820 Screener",
    methodology: "Metodología",
    breakpoint: "Analizar una empresa",
    signIn: "Iniciar sesión",
    signUp: "Crear cuenta",
  },
  en: {
    product: "See example",
    research: "Research",
    g820: "G820 Screener",
    methodology: "Methodology",
    breakpoint: "Analyze a company",
    signIn: "Sign in",
    signUp: "Create workspace",
  },
};

function normalizeLocale(locale) {
  return locale === "en" ? "en" : "es";
}

export function buildPublicNavigation({ locale, pathname = "/" } = {}) {
  const language = normalizeLocale(locale);
  const copy = COPY[language];

  return [
    {
      id: "product",
      label: copy.product,
      href: `/example?lang=${language}`,
      current: pathname === '/example',
    },
    {
      id: "research",
      label: copy.research,
      href: `/research?lang=${language}`,
      current: pathname === "/research",
    },
    {
      id: "g820",
      label: copy.g820,
      href: `/g820?lang=${language}`,
      current: pathname === "/g820",
    },
    {
      id: "methodology",
      label: copy.methodology,
      href: `/methodology?lang=${language}`,
      current: pathname === "/methodology",
    },
  ];
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

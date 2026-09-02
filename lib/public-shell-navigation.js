const PRODUCT_PATHS = new Set(["/product", "/aurora", "/factorlab", "/g820", "/stress"]);

function isProductPath(pathname) {
  return PRODUCT_PATHS.has(pathname) || String(pathname || "").startsWith("/company/");
}

const COPY = {
  es: {
    product: "Producto",
    methodology: "Metodología",
    breakpoint: "Analizar una empresa",
    signIn: "Iniciar sesión",
    signUp: "Crear workspace",
  },
  en: {
    product: "Product",
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
      href: `/product?lang=${language}`,
      current: isProductPath(pathname),
    },
    {
      id: "methodology",
      label: copy.methodology,
      href: `/methodology?lang=${language}`,
      current: pathname === "/methodology",
    },
    {
      id: "breakpoint",
      label: copy.breakpoint,
      href: `/?lang=${language}#breakpoint`,
      current: false,
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

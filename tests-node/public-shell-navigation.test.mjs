import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicNavigation,
  buildPublicShellActions,
  buildToolLinks,
} from "../lib/public-shell-navigation.js";

test("the public shell keeps Spanish context and groups engine routes under Tools", () => {
  const navigation = buildPublicNavigation({ locale: "es", pathname: "/factorlab" });

  assert.deepEqual(navigation, [
    { id: "product", label: "Ejemplo", href: "/example?lang=es", current: false },
    { id: "research", label: "Investigar", href: "/research?lang=es", current: false },
    { id: "tools", label: "Herramientas", href: "/product?lang=es", current: true },
    { id: "portfolios", label: "Carteras", href: "/app/carteras?lang=es", current: false },
    { id: "methodology", label: "Método", href: "/methodology?lang=es", current: false },
  ]);
});

test("the public shell emits complete English navigation without losing locale", () => {
  const navigation = buildPublicNavigation({ locale: "en", pathname: "/methodology" });

  assert.deepEqual(navigation, [
    { id: "product", label: "Example", href: "/example?lang=en", current: false },
    { id: "research", label: "Research", href: "/research?lang=en", current: false },
    { id: "tools", label: "Tools", href: "/product?lang=en", current: false },
    { id: "portfolios", label: "Portfolios", href: "/app/carteras?lang=en", current: false },
    { id: "methodology", label: "Method", href: "/methodology?lang=en", current: true },
  ]);
});

test("auth actions use real routes and preserve the selected language", () => {
  assert.deepEqual(buildPublicShellActions("es"), {
    signIn: { label: "Iniciar sesión", href: "/login?intent=signin&lang=es" },
    signUp: { label: "Crear cuenta", href: "/signup?lang=es" },
  });

  assert.deepEqual(buildPublicShellActions("en"), {
    signIn: { label: "Sign in", href: "/login?intent=signin&lang=en" },
    signUp: { label: "Create account", href: "/signup?lang=en" },
  });
});

test("unsupported locale input falls back to Spanish instead of producing mixed links", () => {
  const navigation = buildPublicNavigation({ locale: "pt", pathname: "/" });

  assert.equal(navigation[0].label, "Ejemplo");
  assert.equal(navigation[0].href, "/example?lang=es");
  assert.equal(buildPublicShellActions("pt").signIn.href, "/login?intent=signin&lang=es");
});

test("every public engine, including G820, is reachable and marks Tools as current", () => {
  for (const pathname of ["/g820", "/aurora", "/stress", "/company/MSFT", "/breakpoint/MSFT"]) {
    const navigation = buildPublicNavigation({ locale: "es", pathname });
    assert.equal(navigation.find((item) => item.id === "tools").current, true, pathname);
  }
  const tools = buildToolLinks("es");
  assert.equal(tools.find((item) => item.id === "g820").href, "/g820?lang=es");
  assert.equal(tools.length, 6);
});

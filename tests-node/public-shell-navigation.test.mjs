import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicNavigation,
  buildPublicShellActions,
} from "../lib/public-shell-navigation.js";

test("the public shell keeps Spanish context and identifies product engine routes", () => {
  const navigation = buildPublicNavigation({ locale: "es", pathname: "/factorlab" });

  assert.deepEqual(navigation, [
    { id: "product", label: "Ver ejemplo", href: "/example?lang=es", current: false },
    { id: "research", label: "Investigar", href: "/research?lang=es", current: false },
    { id: "g820", label: "G820 Screener", href: "/g820?lang=es", current: false },
    { id: "methodology", label: "Metodología", href: "/methodology?lang=es", current: false },
  ]);
});

test("the public shell emits complete English navigation without losing locale", () => {
  const navigation = buildPublicNavigation({ locale: "en", pathname: "/methodology" });

  assert.deepEqual(navigation, [
    { id: "product", label: "See example", href: "/example?lang=en", current: false },
    { id: "research", label: "Research", href: "/research?lang=en", current: false },
    { id: "g820", label: "G820 Screener", href: "/g820?lang=en", current: false },
    { id: "methodology", label: "Methodology", href: "/methodology?lang=en", current: true },
  ]);
});

test("auth actions use real routes and preserve the selected language", () => {
  assert.deepEqual(buildPublicShellActions("es"), {
    signIn: { label: "Iniciar sesión", href: "/login?intent=signin&lang=es" },
    signUp: { label: "Crear cuenta", href: "/signup?lang=es" },
  });

  assert.deepEqual(buildPublicShellActions("en"), {
    signIn: { label: "Sign in", href: "/login?intent=signin&lang=en" },
    signUp: { label: "Create workspace", href: "/signup?lang=en" },
  });
});

test("unsupported locale input falls back to Spanish instead of producing mixed links", () => {
  const navigation = buildPublicNavigation({ locale: "pt", pathname: "/" });

  assert.equal(navigation[0].label, "Ver ejemplo");
  assert.equal(navigation[0].href, "/example?lang=es");
  assert.equal(buildPublicShellActions("pt").signIn.href, "/login?intent=signin&lang=es");
});

test("G820 is treated as a product engine route", () => {
  const navigation = buildPublicNavigation({ locale: "es", pathname: "/g820" });
  assert.equal(navigation.find((item) => item.id === "product").current, false);
  assert.equal(navigation.find((item) => item.id === "g820").current, true);
  assert.equal(navigation.find((item) => item.id === "g820").href, "/g820?lang=es");
});

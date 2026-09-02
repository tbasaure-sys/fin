import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicNavigation,
  buildPublicShellActions,
} from "../lib/public-shell-navigation.js";

test("the public shell keeps Spanish context and identifies product engine routes", () => {
  const navigation = buildPublicNavigation({ locale: "es", pathname: "/factorlab" });

  assert.deepEqual(navigation, [
    { id: "product", label: "Producto", href: "/product?lang=es", current: true },
    { id: "methodology", label: "Metodología", href: "/methodology?lang=es", current: false },
    { id: "breakpoint", label: "Analizar una empresa", href: "/?lang=es#breakpoint", current: false },
  ]);
});

test("the public shell emits complete English navigation without losing locale", () => {
  const navigation = buildPublicNavigation({ locale: "en", pathname: "/methodology" });

  assert.deepEqual(navigation, [
    { id: "product", label: "Product", href: "/product?lang=en", current: false },
    { id: "methodology", label: "Methodology", href: "/methodology?lang=en", current: true },
    { id: "breakpoint", label: "Analyze a company", href: "/?lang=en#breakpoint", current: false },
  ]);
});

test("auth actions use real routes and preserve the selected language", () => {
  assert.deepEqual(buildPublicShellActions("es"), {
    signIn: { label: "Iniciar sesión", href: "/login?intent=signin&lang=es" },
    signUp: { label: "Crear workspace", href: "/signup?lang=es" },
  });

  assert.deepEqual(buildPublicShellActions("en"), {
    signIn: { label: "Sign in", href: "/login?intent=signin&lang=en" },
    signUp: { label: "Create workspace", href: "/signup?lang=en" },
  });
});

test("unsupported locale input falls back to Spanish instead of producing mixed links", () => {
  const navigation = buildPublicNavigation({ locale: "pt", pathname: "/" });

  assert.equal(navigation[0].label, "Producto");
  assert.equal(navigation[0].href, "/product?lang=es");
  assert.equal(buildPublicShellActions("pt").signIn.href, "/login?intent=signin&lang=es");
});

test("G820 is treated as a product engine route", () => {
  const navigation = buildPublicNavigation({ locale: "es", pathname: "/g820" });
  assert.equal(navigation[0].current, true);
});

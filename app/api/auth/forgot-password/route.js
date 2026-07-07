import { NextResponse } from "next/server";

import { requestPasswordReset } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeResetErrorCode(error) {
  const raw = String(error?.message || error || "").toLowerCase();
  if (
    raw.includes("enotfound") ||
    raw.includes("econnrefused") ||
    raw.includes("econnreset") ||
    raw.includes("neondberror") ||
    raw.includes("database_url") ||
    raw.includes("reset email failed")
  ) {
    return "service_unavailable";
  }
  if (raw.includes("bls_prime_auth_secret") || raw.includes("neon storage must be enabled")) {
    return "not_configured";
  }
  if (raw.includes("valid email")) return "validation";
  return "generic";
}

function internalResetPath(resetUrl, requestUrl) {
  // Reduce la URL de reset a una ruta interna verificable antes de exponerla.
  try {
    const parsed = new URL(String(resetUrl || ""), requestUrl);
    if (!parsed.pathname.startsWith("/reset-password")) return "";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
}

export async function POST(request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "");
  const language = String(formData.get("lang") || "").toLowerCase() === "en" ? "en" : "es";

  try {
    const result = await requestPasswordReset({
      email,
      requestUrl: request.url,
    });
    const url = new URL("/forgot-password", request.url);
    url.searchParams.set("lang", language);
    url.searchParams.set("sent", "1");
    if (result.delivery === "dev-link" && result.resetUrl) {
      const devPath = internalResetPath(result.resetUrl, request.url);
      if (devPath) url.searchParams.set("devResetUrl", devPath);
    }
    return NextResponse.redirect(url, 303);
  } catch (error) {
    const url = new URL("/forgot-password", request.url);
    url.searchParams.set("lang", language);
    url.searchParams.set("error", normalizeResetErrorCode(error));
    return NextResponse.redirect(url, 303);
  }
}

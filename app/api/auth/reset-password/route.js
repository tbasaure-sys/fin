import { NextResponse } from "next/server";

import {
  completePasswordReset,
  getSessionCookieName,
  getSessionCookieOptions,
} from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeResetErrorCode(error) {
  const raw = String(error?.message || error || "").toLowerCase();
  if (
    raw.includes("enotfound") ||
    raw.includes("econnrefused") ||
    raw.includes("econnreset") ||
    raw.includes("neondberror") ||
    raw.includes("database_url")
  ) {
    return "service_unavailable";
  }
  if (raw.includes("bls_prime_auth_secret") || raw.includes("neon storage must be enabled")) {
    return "service_unavailable";
  }
  if (raw.includes("token") || raw.includes("expired") || raw.includes("invalid link") || raw.includes("reset link")) {
    return "invalid_token";
  }
  if (raw.includes("password") && (raw.includes("8") || raw.includes("short") || raw.includes("characters"))) {
    return "validation";
  }
  return "generic";
}

export async function POST(request) {
  const formData = await request.formData();
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const language = String(formData.get("lang") || "").toLowerCase() === "en" ? "en" : "es";

  if (password !== confirmPassword) {
    const url = new URL("/reset-password", request.url);
    url.searchParams.set("token", token);
    url.searchParams.set("lang", language);
    url.searchParams.set("error", "mismatch");
    return NextResponse.redirect(url, 303);
  }

  try {
    const session = await completePasswordReset({ token, password });
    const response = NextResponse.redirect(new URL("/app", request.url), 303);
    response.cookies.set(
      getSessionCookieName(),
      session.token,
      getSessionCookieOptions(session.expiresAt),
    );
    return response;
  } catch (error) {
    const url = new URL("/reset-password", request.url);
    url.searchParams.set("token", token);
    url.searchParams.set("lang", language);
    url.searchParams.set("error", normalizeResetErrorCode(error));
    return NextResponse.redirect(url, 303);
  }
}

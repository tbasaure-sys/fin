import { NextResponse } from "next/server";

import {
  getSessionCookieName,
  getSessionCookieOptions,
  signInWithPassword,
} from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeAuthErrorCode(error) {
  const raw = String(error?.message || error || "");

  // Database not configured or unreachable
  if (
    raw.includes("ENOTFOUND") ||
    raw.includes("ECONNREFUSED") ||
    raw.includes("ECONNRESET") ||
    raw.includes("SSL SYSCALL") ||
    raw.includes("password authentication failed") ||
    raw.includes("database") && raw.includes("does not exist") ||
    raw.includes("NeonDbError") ||
    raw.includes("DATABASE_URL") ||
    raw.includes("Neon storage must be enabled")
  ) {
    return "service_unavailable";
  }

  // Auth secret not set
  if (raw.includes("BLS_PRIME_AUTH_SECRET")) {
    return "not_configured";
  }

  if (
    raw.includes("Enter a valid email address") ||
    raw.includes("Enter your password") ||
    raw.includes("at least 8 characters")
  ) {
    return "validation";
  }

  if (raw.includes("already exists")) return "account_exists";
  if (raw.includes("needs a password")) return "needs_password";
  if (
    raw.includes("No account exists") ||
    raw.includes("Incorrect password")
  ) {
    return "invalid_credentials";
  }

  return "generic";
}

function safeNextPath(value) {
  const raw = String(value || "/app");
  // Solo rutas internas: bloquea "//host" (protocol-relative) y "/\" que algunos
  // navegadores tratan como inicio de URL absoluta.
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/app";
}

export async function POST(request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "");
  const name = String(formData.get("name") || "");
  const password = String(formData.get("password") || "");
  const intent = String(formData.get("intent") || "signin");
  const language = String(formData.get("lang") || "es") === "en" ? "en" : "es";
  const next = safeNextPath(formData.get("next"));

  try {
    const session = await signInWithPassword({ email, name, password, intent });
    const response = NextResponse.redirect(new URL(next, request.url), 303);
    response.cookies.set(
      getSessionCookieName(),
      session.token,
      getSessionCookieOptions(session.expiresAt),
    );
    return response;
  } catch (error) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", next);
    url.searchParams.set("intent", intent === "signup" ? "signup" : "signin");
    url.searchParams.set("lang", language);
    url.searchParams.set("error", normalizeAuthErrorCode(error));
    return NextResponse.redirect(url, 303);
  }
}

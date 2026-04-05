import { NextResponse } from "next/server";

import {
  getSessionCookieName,
  getSessionCookieOptions,
  signInWithPassword,
} from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeAuthError(error) {
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
    raw.includes("DATABASE_URL")
  ) {
    return "The workspace database is not reachable. Please contact the administrator.";
  }

  // Auth secret not set
  if (raw.includes("BLS_PRIME_AUTH_SECRET")) {
    return "The workspace is not fully configured yet. Please contact the administrator.";
  }

  return raw || "Could not sign in. Please try again.";
}

export async function POST(request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "");
  const name = String(formData.get("name") || "");
  const password = String(formData.get("password") || "");
  const intent = String(formData.get("intent") || "signin");
  const next = String(formData.get("next") || "/app");

  try {
    const session = await signInWithPassword({ email, name, password, intent });
    const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/app", request.url), 303);
    response.cookies.set(
      getSessionCookieName(),
      session.token,
      getSessionCookieOptions(session.expiresAt),
    );
    return response;
  } catch (error) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", next.startsWith("/") ? next : "/app");
    url.searchParams.set("error", normalizeAuthError(error));
    return NextResponse.redirect(url, 303);
  }
}

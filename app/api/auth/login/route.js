import { NextResponse } from "next/server";

import {
  getSessionCookieName,
  getSessionCookieOptions,
  signInWithPassword,
} from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    url.searchParams.set("error", String(error?.message || error || "Could not sign in."));
    return NextResponse.redirect(url, 303);
  }
}

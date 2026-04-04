import { NextResponse } from "next/server";

import {
  completePasswordReset,
  getSessionCookieName,
  getSessionCookieOptions,
} from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const formData = await request.formData();
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    const url = new URL("/reset-password", request.url);
    url.searchParams.set("token", token);
    url.searchParams.set("error", "Passwords do not match.");
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
    url.searchParams.set("error", String(error?.message || error || "Could not reset password."));
    return NextResponse.redirect(url, 303);
  }
}

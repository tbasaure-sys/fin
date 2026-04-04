import { NextResponse } from "next/server";

import { requestPasswordReset } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "");

  try {
    const result = await requestPasswordReset({
      email,
      requestUrl: request.url,
    });
    const url = new URL("/forgot-password", request.url);
    url.searchParams.set("sent", "1");
    if (result.delivery === "dev-link" && result.resetUrl) {
      url.searchParams.set("devResetUrl", result.resetUrl);
    }
    return NextResponse.redirect(url, 303);
  } catch (error) {
    const url = new URL("/forgot-password", request.url);
    url.searchParams.set("error", String(error?.message || error || "Could not start password reset."));
    return NextResponse.redirect(url, 303);
  }
}

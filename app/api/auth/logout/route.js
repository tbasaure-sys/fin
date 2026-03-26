import { NextResponse } from "next/server";

import {
  clearSessionByToken,
  getSessionCookieName,
  getSessionCookieOptions,
} from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const token = request.cookies.get(getSessionCookieName())?.value || "";
  await clearSessionByToken(token);

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(getSessionCookieName(), "", {
    ...getSessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
  return response;
}

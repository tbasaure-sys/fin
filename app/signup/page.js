import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LANGUAGE_REQUEST_HEADER, normalizeLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  const locale = normalizeLocale(headers().get(LANGUAGE_REQUEST_HEADER), "es");
  redirect(`/login?intent=signup&lang=${locale}`);
}

import { redirect } from "next/navigation";

export default function AuroraPage({ searchParams }) {
  const ticker = String(searchParams?.ticker || "").trim().toUpperCase();
  const query = /^[A-Z0-9.-]{1,12}$/.test(ticker) ? `?ticker=${encodeURIComponent(ticker)}` : "";
  redirect(`/valuation-os-lab${query}`);
}

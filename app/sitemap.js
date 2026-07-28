const RAW_BASE_URL = process.env.BLS_PRIME_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.blsprime.com";
const BASE_URL = (/^[a-z][a-z\d+.-]*:\/\//i.test(RAW_BASE_URL) ? RAW_BASE_URL : `https://${RAW_BASE_URL}`).replace(/\/$/, "");
const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/breakpoint/ASML", changeFrequency: "weekly", priority: 0.95 },
  { path: "/aurora", changeFrequency: "weekly", priority: 0.9 },
  { path: "/factorlab", changeFrequency: "weekly", priority: 0.8 },
  { path: "/stress", changeFrequency: "weekly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.4 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
];

export default function sitemap() {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map(({ path, ...route }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    ...route,
  }));
}

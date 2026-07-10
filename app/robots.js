export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/login", "/forgot-password", "/reset-password", "/recover", "/api"],
      },
    ],
    sitemap: "https://www.blsprime.com/sitemap.xml",
  };
}

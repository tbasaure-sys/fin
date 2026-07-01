const rawAppName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "BLS Prime";
const appName = /allocator workspace/i.test(rawAppName) ? "BLS Prime" : rawAppName;

export default function manifest() {
  return {
    name: appName,
    short_name: "BLS Prime",
    description:
      "AURORA valuation, factor, and macro research tools for investment decisions.",
    start_url: "/aurora",
    scope: "/",
    display: "standalone",
    background_color: "#0b0f16",
    theme_color: "#0b0f16",
    orientation: "portrait",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}

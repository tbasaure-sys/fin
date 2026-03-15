// API_BASE is injected at deploy time via the Vercel serverless proxy (api/[...path].js).
// When serving directly from Railway (self-hosted), leave API_BASE empty ("").
// When serving the Vercel frontend that proxies to a Railway backend, also leave
// API_BASE empty — all /api/* calls are caught by the Vercel rewrite rule and
// forwarded to the Railway backend via META_ALLOCATOR_BACKEND_URL.
window.META_ALLOCATOR_CONFIG = window.META_ALLOCATOR_CONFIG || {
  API_BASE: "",
};

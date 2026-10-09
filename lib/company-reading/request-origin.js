// Next may normalize request.url to localhost behind a proxy. Compare the
// browser Origin with the actual HTTP Host; never trust x-forwarded-host here.
export function hasSameRequestOrigin(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || /[\s/\\]/.test(host)) return false;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
    return parsed.origin === new URL(`${parsed.protocol}//${host}`).origin;
  } catch { return false; }
}

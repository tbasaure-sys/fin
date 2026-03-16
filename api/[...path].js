export default async function handler(req, res) {
  const backendBase = process.env.META_ALLOCATOR_BACKEND_URL;

  if (!backendBase) {
    res.status(500).json({
      error: "META_ALLOCATOR_BACKEND_URL is not configured on Vercel.",
    });
    return;
  }

  const normalizedBase = /^https?:\/\//i.test(backendBase)
    ? backendBase
    : `https://${backendBase}`;
  const pathParam = req.query?.path;
  const rawPath = Array.isArray(pathParam)
    ? pathParam.join("/")
    : typeof pathParam === "string"
      ? pathParam
      : "";
  const query = new URLSearchParams(req.query ?? {});
  query.delete("path");
  const search = query.toString();
  const backendUrl = `${normalizedBase.replace(/\/$/, "")}/api/${rawPath}${search ? `?${search}` : ""}`;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];

  const init = {
    method: req.method,
    headers,
  };

  if (req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())) {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    init.body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  try {
    const upstream = await fetch(backendUrl, init);
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (error) {
    res.status(502).json({
      error: "Backend proxy failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

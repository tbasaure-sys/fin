const LOCAL_FILE_URI = /file:\/{1,3}[^\s"'<>]*/i;
const PUBLIC_HTTP_URL = /https?:\/\/[^\s"'<>]+/gi;
const WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:[\\/][^\s"'<>]*/;
const UNC_PATH = /(?:\\\\|\/\/)[^\\/\s"'<>]+[\\/][^\s"'<>]*/;
const UNIX_ABSOLUTE_PATH = /(?:^|[\s([{"'=,:;])\/(?!\/|\s)[^\s"'<>]+/;
const LOCAL_METADATA_SUFFIXES = new Set([
  "dir",
  "directory",
  "file",
  "location",
  "path",
  "root",
  "uri",
  "url",
]);

function normalizeKey(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isLocalMetadataKey(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return false;

  const tokens = normalized.split("_").filter(Boolean);
  if (tokens.includes("workstation")) return true;
  if (tokens.includes("hostname")) return true;
  if (tokens.some((token, index) => token === "host" && tokens[index + 1] === "name")) return true;

  const suffix = tokens.at(-1);
  if (suffix === "path" && (tokens.includes("source") || tokens.includes("raw") || tokens.includes("filesystem"))) {
    return true;
  }
  return LOCAL_METADATA_SUFFIXES.has(suffix)
    && (tokens.includes("cache") || tokens.includes("local"));
}

function containsAbsoluteFilesystemPath(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (LOCAL_FILE_URI.test(text)) return true;

  // Public URLs may contain slash-delimited paths. Remove those spans before
  // looking for local filesystem references elsewhere in the same message.
  const withoutPublicUrls = text.replace(PUBLIC_HTTP_URL, "");
  return WINDOWS_ABSOLUTE_PATH.test(withoutPublicUrls)
    || UNC_PATH.test(withoutPublicUrls)
    || UNIX_ABSOLUTE_PATH.test(withoutPublicUrls);
}

function sanitizeNode(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeNode(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isLocalMetadataKey(key))
        .map(([key, child]) => [key, sanitizeNode(child)])
        .filter(([, child]) => child !== undefined),
    );
  }

  if (typeof value === "string" && containsAbsoluteFilesystemPath(value)) {
    return undefined;
  }

  return value;
}

export function sanitizePublicSnapshotPayload(payload) {
  return sanitizeNode(payload);
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const SAFE_STRUCTURED_FIELDS = new Set([
  "requestId",
  "operation",
  "method",
  "endpoint",
  "status",
  "durationMs",
  "errorCode",
  "jobId",
  "fileId",
  "chatId",
  "messageId",
  "sourceId",
  "count",
  "messageCount",
  "fileCount",
  "rows",
  "probed",
  "updated",
  "elapsedMs",
  "hasMore",
  "hasVideoFiles",
  "transcodeEnabled",
  "uploadType",
  "routes",
]);

const boundedText = (value, maxLength = 256) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength);

export function normalizeRequestId(value) {
  const normalized = String(value ?? "").trim();
  return REQUEST_ID_PATTERN.test(normalized) ? normalized : "";
}

export function safeErrorCode(error, fallback = "error") {
  const raw = boundedText(error?.code || error?.name || fallback, 128);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw) ? raw : fallback;
}

function sanitizeRouteCounts(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 100).map((row) => ({
    route: boundedText(row?.route, 300),
    count: Math.max(0, Number(row?.count || 0) || 0),
  }));
}

export function sanitizeStructuredFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
  const result = {};
  for (const [key, rawValue] of Object.entries(fields)) {
    if (!SAFE_STRUCTURED_FIELDS.has(key)) continue;
    if (key === "routes") {
      const routes = sanitizeRouteCounts(rawValue);
      if (routes) result.routes = routes;
      continue;
    }
    if (["status", "durationMs", "count", "messageCount", "fileCount", "rows", "probed", "elapsedMs"].includes(key)) {
      const value = Number(rawValue);
      if (Number.isFinite(value)) result[key] = Math.max(0, Math.round(value));
      continue;
    }
    if (["updated", "hasMore", "hasVideoFiles", "transcodeEnabled"].includes(key)) {
      result[key] = Boolean(rawValue);
      continue;
    }
    result[key] = boundedText(rawValue, key === "endpoint" ? 500 : 256);
  }
  return result;
}

export function buildHttpRequestLog({
  requestId,
  method,
  endpoint,
  status,
  durationMs,
  errorCode = "",
  service = "ouj-chat",
}) {
  const safeMethod = boundedText(method || "GET", 16).toUpperCase();
  const safeEndpoint = boundedText(endpoint || "/", 500).split("?")[0] || "/";
  const safeStatus = Math.max(0, Math.round(Number(status || 0) || 0));
  const rawErrorCode = boundedText(errorCode, 128);
  const safeErrorCode = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(rawErrorCode)
    ? rawErrorCode
    : "";
  return {
    event: "http.request",
    service: boundedText(service, 64) || "ouj-chat",
    requestId: normalizeRequestId(requestId),
    operation: `${safeMethod} ${safeEndpoint}`,
    method: safeMethod,
    endpoint: safeEndpoint,
    status: safeStatus,
    durationMs: Math.max(0, Math.round(Number(durationMs || 0) || 0)),
    errorCode: safeErrorCode,
  };
}

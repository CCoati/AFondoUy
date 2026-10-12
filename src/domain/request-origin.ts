/** Checks browser Origin against the request host and explicitly configured site URLs. */
export function isAllowedRequestOrigin(
  origin: string | null,
  requestUrl: string,
  configuredSiteUrls: readonly (string | undefined)[],
  isDevelopment = false,
) {
  if (!origin) return false;

  let normalizedOrigin: string;
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.origin !== origin) return false;
    normalizedOrigin = parsed.origin;
  } catch {
    return false;
  }

  const allowedOrigins = new Set<string>();
  for (const value of [requestUrl, ...configuredSiteUrls]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") allowedOrigins.add(parsed.origin);
    } catch {
      // Ignore malformed optional configuration and keep the check fail-closed.
    }
  }

  if (isDevelopment) {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
  }

  return allowedOrigins.has(normalizedOrigin);
}

/**
 * Only follow `?next=` to a path on this site. `//host` and `/\host` are protocol-relative
 * in browsers, so they'd leave the site: an open redirect a phishing link could abuse.
 */
export function safeNext(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\x00-\x1f\\]/.test(value)) {
    return fallback
  }
  try {
    const parsed = new URL(value, "https://example.invalid")
    if (parsed.origin !== "https://example.invalid") return fallback
  } catch {
    return fallback
  }
  return value
}

/**
 * Only follow `?next=` to a path on this site. `//host` and `/\host` are protocol-relative
 * in browsers, so they'd leave the site: an open redirect a phishing link could abuse.
 */
export function safeNext(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback
  }
  return value
}

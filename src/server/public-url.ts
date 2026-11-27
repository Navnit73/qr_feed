import "server-only"
import { env } from "@/server/env"

export function appBaseUrl(): string {
  return env().BETTER_AUTH_URL.replace(/\/+$/, "")
}

/** Absolute link to an app path for emails. Falls back to localhost when env isn't loaded (tests). */
export function appUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  try {
    return `${appBaseUrl()}${p}`
  } catch {
    return `http://localhost:3000${p}`
  }
}

/** The link printed in a QR code. Uses tenant custom domain when configured (P9). */
export function publicQrUrl(shortCode: string, customDomain?: string) {
  const domain = customDomain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
  if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return `https://${domain}/f/${shortCode}`
  }
  return `${appBaseUrl()}/f/${shortCode}`
}

/** The public link printed in a custom survey QR code (`/s/<shortCode>`). */
export function publicSurveyUrl(shortCode: string, customDomain?: string) {
  const domain = customDomain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
  if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return `https://${domain}/s/${shortCode}`
  }
  return `${appBaseUrl()}/s/${shortCode}`
}

/** Client IP for rate limiting. Prefers trusted single-value proxy headers over client-supplied XFF hops. */
export function clientIp(headers: Headers) {
  const direct =
    headers.get("cf-connecting-ip") ??
    headers.get("x-vercel-forwarded-for")?.split(",")[0] ??
    headers.get("x-real-ip")
  if (direct && direct.trim()) return direct.trim()

  const xff = headers.get("x-forwarded-for")
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }
  return "unknown"
}

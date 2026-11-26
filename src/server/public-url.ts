import "server-only"
import { env } from "@/server/env"

/** The link printed in a QR code. One place, so a custom domain (P9) changes it everywhere. */
export function publicQrUrl(shortCode: string) {
  return `${env().BETTER_AUTH_URL}/f/${shortCode}`
}

/** Client IP for rate limiting. Behind a proxy the first X-Forwarded-For hop is the visitor. */
export function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0] ??
    headers.get("x-real-ip") ??
    "unknown"
  ).trim()
}

import "server-only"

/**
 * Cloudflare Turnstile check for the public form. With no secret configured (local dev, tests)
 * it passes; with one, a missing or failed token blocks the submission. It fails closed if
 * Cloudflare can't be reached.
 */
export async function verifyTurnstile({
  secret,
  token,
  ip,
}: {
  secret: string | undefined
  token: string | null | undefined
  ip: string
}): Promise<boolean> {
  if (!secret) return true
  if (!token) return false
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    })
    const body = (await res.json()) as { success?: boolean }
    return body.success === true
  } catch {
    return false
  }
}

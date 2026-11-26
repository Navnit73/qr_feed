import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { env } from "@/server/env"
import { clientIp } from "@/server/public-url"
import { rateLimit } from "@/server/rate-limit"
import { storePublicAttachment } from "@/server/storage"

export const POST = withApi(async (req: Request) => {
  const e = env()
  const form = await req.formData()
  const code = String(form.get("code") ?? "").trim()
  const file = form.get("file")

  if (!code) throw new ApiError("VALIDATION", "Missing QR code.")
  if (!(file instanceof File)) throw new ApiError("VALIDATION", "Please choose an image file.")

  if (e.INTAKE_RATE_LIMIT !== "off") {
    const ip = clientIp(req.headers)
    const [byIp, byQr] = await Promise.all([
      rateLimit({ key: `upload:ip:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 }),
      rateLimit({ key: `upload:qr:${code}`, limit: 80, windowMs: 10 * 60 * 1000 }),
    ])
    if (!byIp.ok || !byQr.ok) {
      throw new ApiError("RATE_LIMITED", "Too many uploads from here. Try again shortly.")
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const saved = await storePublicAttachment(code, { filename: file.name || "photo.jpg", buffer })
  return ok(saved, { status: 201 })
})

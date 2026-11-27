import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import { getQrCode } from "@/server/modules/qr-codes"
import { getTenant } from "@/server/modules/tenants"
import { publicQrUrl } from "@/server/public-url"
import { qrPng, qrSvg } from "@/server/qr-image"

/** QR image for signed-in staff: /api/qr/<id>/svg or /png, `?download=1` to save it. */
export async function GET(request: Request, { params }: RouteContext<"/api/qr/[id]/[format]">) {
  const { id, format } = await params
  if (format !== "svg" && format !== "png") return fail("NOT_FOUND", "Unknown format.")
  try {
    const ctx = await requireApiTenantContext()
    const [{ qr, locationPath }, tenant] = await Promise.all([
      getQrCode(ctx, id),
      getTenant(ctx.tenantId),
    ])
    const url = publicQrUrl(qr.shortCode, tenant?.branding?.customDomain)
    const etag = `"qr-${qr.shortCode}-${format}-${tenant?.branding?.customDomain ?? "default"}"`
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          "cache-control": "private, max-age=3600, must-revalidate",
        },
      })
    }

    const name = `qr-${locationPath
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}.${format}`
    const headers: Record<string, string> = {
      "content-type": format === "svg" ? "image/svg+xml" : "image/png",
      "cache-control": "private, max-age=3600, must-revalidate",
      etag,
    }
    if (new URL(request.url).searchParams.has("download")) {
      headers["content-disposition"] = `attachment; filename="${name}"`
    }
    const body = format === "svg" ? await qrSvg(url) : new Uint8Array(await qrPng(url))
    return new Response(body, { headers })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message)
    throw err
  }
}

import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import { getSurvey } from "@/server/modules/surveys"
import { getTenant } from "@/server/modules/tenants"
import { publicSurveyUrl } from "@/server/public-url"
import { qrPng, qrSvg } from "@/server/qr-image"

/** QR image for a custom survey: /api/surveys/<id>/qr/svg or /png, `?download=1` to save. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/surveys/[id]/qr/[format]">,
) {
  const { id, format } = await params
  if (format !== "svg" && format !== "png") return fail("NOT_FOUND", "Unknown format.")
  try {
    const ctx = await requireApiTenantContext()
    const [survey, tenant] = await Promise.all([getSurvey(ctx, id), getTenant(ctx.tenantId)])
    const url = publicSurveyUrl(survey.shortCode, tenant?.branding?.customDomain)
    const etag = `"survey-qr-${survey.shortCode}-${format}-${tenant?.branding?.customDomain ?? "default"}"`
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          "cache-control": "private, max-age=3600, must-revalidate",
        },
      })
    }

    const slug =
      survey.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "survey"
    const headers: Record<string, string> = {
      "content-type": format === "svg" ? "image/svg+xml" : "image/png",
      "cache-control": "private, max-age=3600, must-revalidate",
      etag,
    }
    if (new URL(request.url).searchParams.has("download")) {
      headers["content-disposition"] = `attachment; filename="survey-qr-${slug}.${format}"`
    }
    const body = format === "svg" ? await qrSvg(url) : new Uint8Array(await qrPng(url))
    return new Response(body, { headers })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message)
    throw err
  }
}

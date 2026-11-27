import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import { exportSurveyResponsesCsv } from "@/server/modules/surveys"

export async function GET(_request: Request, { params }: RouteContext<"/api/surveys/[id]/export">) {
  const { id } = await params
  try {
    const ctx = await requireApiTenantContext()
    const { filename, csv } = await exportSurveyResponsesCsv(ctx, id)
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message)
    throw err
  }
}

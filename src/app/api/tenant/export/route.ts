import { NextResponse } from "next/server"
import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { requireTenantContext } from "@/server/auth/session"
import { exportTenantData } from "@/server/modules/platform"

export async function GET() {
  try {
    const ctx = await requireTenantContext()
    const data = await exportTenantData(ctx)
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="qrfeed-export-${data.tenant.slug}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.details)
    return fail("INTERNAL", "Could not export tenant data.")
  }
}

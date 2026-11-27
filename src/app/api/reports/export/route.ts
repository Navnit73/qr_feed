import { NextResponse } from "next/server"
import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import { exportReportCsv } from "@/server/modules/reports"

const TYPES = new Set(["tickets", "audit_log", "rca", "summary"] as const)

export async function GET(req: Request) {
  try {
    const ctx = await requireApiTenantContext()
    const url = new URL(req.url)
    const rawType = url.searchParams.get("type") ?? "tickets"
    const type = TYPES.has(rawType as never)
      ? (rawType as "tickets" | "audit_log" | "rca" | "summary")
      : "tickets"
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30))
    const branchId = url.searchParams.get("branchId") || undefined
    const format = url.searchParams.get("format") === "excel" ? "excel" : "csv"
    const csv = await exportReportCsv(ctx, type, days, branchId)
    // Excel requires a UTF-8 BOM to render Hindi/Arabic/accented characters cleanly.
    const body = format === "excel" ? `\uFEFF${csv}` : csv

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="qrfeed-${type}-${days}d.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.details)
    return fail("INTERNAL", "Could not export report.")
  }
}

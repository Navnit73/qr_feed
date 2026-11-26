import { NextRequest, NextResponse } from "next/server"
import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { requireTenantContext } from "@/server/auth/session"
import { readAttachmentBytes, readPublicAttachmentBytes } from "@/server/storage"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = req.nextUrl.searchParams.get("token")
    const data = token
      ? await readPublicAttachmentBytes(id, token)
      : await readAttachmentBytes(await requireTenantContext(), id)

    return new NextResponse(new Uint8Array(data.buffer), {
      status: 200,
      headers: {
        "Content-Type": data.contentType,
        "Content-Disposition": `inline; filename="${data.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.details)
    return fail("NOT_FOUND", "Attachment not found.")
  }
}

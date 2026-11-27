import { NextRequest, NextResponse } from "next/server"
import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import { readAttachmentBytes, readPublicAttachmentBytes } from "@/server/storage"

function safeDispositionFilename(name: string) {
  return name.replace(/["\\\r\n\x00-\x1f\x7f]/g, "_").slice(0, 120) || "attachment"
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = req.nextUrl.searchParams.get("token")
    const etag = `"file-${id}"`
    const data = token
      ? await readPublicAttachmentBytes(id, token)
      : await readAttachmentBytes(await requireApiTenantContext(), id)

    // Attachment bytes are immutable per ID — honour If-None-Match after verifying authorization.
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=86400, immutable",
        },
      })
    }

    return new NextResponse(new Uint8Array(data.buffer), {
      status: 200,
      headers: {
        "Content-Type": data.contentType,
        "Content-Disposition": `inline; filename="${safeDispositionFilename(data.filename)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400, immutable",
        ETag: etag,
      },
    })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.details)
    return fail("NOT_FOUND", "Attachment not found.")
  }
}

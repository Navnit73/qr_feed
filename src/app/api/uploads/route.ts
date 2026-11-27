import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { requireApiTenantContext } from "@/server/auth/session"
import { MAX_IMAGE_BYTES } from "@/server/image-sanitize"
import type { AttachmentScope } from "@/server/repositories"
import { storeTenantAttachment } from "@/server/storage"

const SCOPES = new Set<AttachmentScope>(["ticket", "comment", "rca", "capa", "audit"])

export const POST = withApi(async (req: Request) => {
  const ctx = await requireApiTenantContext()
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ApiError("BAD_REQUEST", "Expected multipart/form-data upload.")
  }
  const file = form.get("file")
  const scopeRaw = String(form.get("scope") ?? "comment") as AttachmentScope
  const branchIdRaw = form.get("branchId") ? String(form.get("branchId")) : undefined
  const entityIdRaw = form.get("entityId") ? String(form.get("entityId")) : undefined

  if (!(file instanceof File)) throw new ApiError("VALIDATION", "Please choose an image file.")
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError("VALIDATION", "Image must be under 5 MB.")
  }
  const scope: AttachmentScope = SCOPES.has(scopeRaw) ? scopeRaw : "comment"
  const branchId =
    branchIdRaw && ObjectId.isValid(branchIdRaw) ? new ObjectId(branchIdRaw) : undefined
  const entityId =
    entityIdRaw && ObjectId.isValid(entityIdRaw) ? new ObjectId(entityIdRaw) : undefined

  const buffer = Buffer.from(await file.arrayBuffer())
  const saved = await storeTenantAttachment(ctx, {
    branchId,
    filename: file.name || "attachment.jpg",
    buffer,
    scope,
    entityId,
  })

  return ok(
    {
      id: saved._id.toHexString(),
      url: `/api/files/${saved._id.toHexString()}`,
      filename: saved.filename,
      contentType: saved.contentType,
      size: saved.size,
    },
    { status: 201 },
  )
})

import "server-only"
import { createHash, createHmac, randomBytes } from "node:crypto"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { env } from "@/server/env"
import { sanitizeImage } from "@/server/image-sanitize"
import { resolvePublicQr } from "@/server/modules/qr-codes"
import { attachments, tickets, type AttachmentScope } from "@/server/repositories"

const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex")
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest()

export type S3Config = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * Returns S3/R2 config when cloud object storage credentials are present, else null (uses local
 * storage under `.data/uploads` or `STORAGE_LOCAL_DIR`). Works identically for Cloudflare R2
 * (set STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com, STORAGE_REGION=auto) and
 * AWS S3 (set STORAGE_REGION=ap-south-1, STORAGE_ENDPOINT optional).
 */
export function getS3Config(): S3Config | null {
  try {
    const e = env()
    if (!e.STORAGE_BUCKET || !e.STORAGE_ACCESS_KEY_ID || !e.STORAGE_SECRET_ACCESS_KEY) return null
    const region = e.STORAGE_REGION || "auto"
    const endpoint = e.STORAGE_ENDPOINT || `https://s3.${region}.amazonaws.com`
    return {
      endpoint: endpoint.replace(/\/+$/, ""),
      region,
      bucket: e.STORAGE_BUCKET,
      accessKeyId: e.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY,
    }
  } catch {
    return null
  }
}

function localStorageDir(): string {
  if (process.env.STORAGE_LOCAL_DIR) return process.env.STORAGE_LOCAL_DIR
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return path.join(os.tmpdir(), "qr-feed-test-uploads")
  }
  return path.join(process.cwd(), ".data", "uploads")
}

function safeLocalPath(storageKey: string): string {
  const base = path.resolve(/*turbopackIgnore: true*/ localStorageDir())
  const full = path.resolve(/*turbopackIgnore: true*/ base, storageKey)
  if (!full.startsWith(base + path.sep)) {
    throw new ApiError("VALIDATION", "Invalid storage key.")
  }
  return full
}

// ── AWS Signature V4 (Cloudflare R2 + AWS S3 compatible, zero extra deps) ───────────

function amzDate(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  return { amz: iso, dateStamp: iso.slice(0, 8) }
}

function signingKey(secret: string, dateStamp: string, region: string, service = "s3") {
  const kDate = hmac(`AWS4${secret}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, "aws4_request")
}

function encodeS3Key(key: string) {
  return key
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")
}

function s3SignedHeaders(
  cfg: S3Config,
  method: "GET" | "PUT" | "DELETE",
  key: string,
  payloadHash: string,
  contentType?: string,
  now = new Date(),
) {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${encodeS3Key(key)}`)
  const { amz, dateStamp } = amzDate(now)
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  }
  if (contentType) headers["content-type"] = contentType
  const sortedKeys = Object.keys(headers).sort()
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k]}\n`).join("")
  const signedHeaders = sortedKeys.join(";")
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(canonicalRequest)].join("\n")
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, dateStamp, cfg.region))
    .update(stringToSign)
    .digest("hex")

  return {
    url: url.toString(),
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  }
}

/** Generates a short-lived presigned GET or PUT URL for S3/R2 (default 5 minutes). */
export function createPresignedS3Url(
  cfg: S3Config,
  method: "GET" | "PUT",
  key: string,
  expiresSeconds = 300,
  now = new Date(),
): string {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${encodeS3Key(key)}`)
  const { amz, dateStamp } = amzDate(now)
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  })
  params.sort()
  const canonicalRequest = [
    method,
    url.pathname,
    params.toString(),
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n")
  const stringToSign = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(canonicalRequest)].join("\n")
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, dateStamp, cfg.region))
    .update(stringToSign)
    .digest("hex")
  params.set("X-Amz-Signature", signature)
  return `${url.origin}${url.pathname}?${params.toString()}`
}

async function putObject(key: string, body: Buffer, contentType: string) {
  const cfg = getS3Config()
  if (cfg) {
    const req = s3SignedHeaders(cfg, "PUT", key, sha256Hex(body), contentType)
    const res = await fetch(req.url, {
      method: "PUT",
      headers: req.headers,
      body: new Uint8Array(body),
    })
    if (!res.ok) throw new ApiError("INTERNAL", "Could not store image.")
    return
  }
  const dest = safeLocalPath(key)
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, body)
}

async function getObject(key: string): Promise<Buffer> {
  const cfg = getS3Config()
  if (cfg) {
    const req = s3SignedHeaders(cfg, "GET", key, sha256Hex(""))
    const res = await fetch(req.url, { method: "GET", headers: req.headers })
    if (!res.ok) throw new ApiError("NOT_FOUND", "File not found.")
    return Buffer.from(await res.arrayBuffer())
  }
  try {
    return await readFile(/*turbopackIgnore: true*/ safeLocalPath(key))
  } catch {
    throw new ApiError("NOT_FOUND", "File not found.")
  }
}

export async function deleteObject(key: string) {
  const cfg = getS3Config()
  if (cfg) {
    const req = s3SignedHeaders(cfg, "DELETE", key, sha256Hex(""))
    await fetch(req.url, { method: "DELETE", headers: req.headers }).catch(() => {})
    return
  }
  await unlink(safeLocalPath(key)).catch(() => {})
}

function cleanFilename(name: string, ext: string) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 60)
  return `${base || "photo"}.${ext}`
}

// ── Public & Tenant Attachment Services ──────────────────────────────────────────────

export async function storePublicAttachment(
  shortCode: string,
  file: { filename: string; buffer: Buffer },
) {
  const pub = await resolvePublicQr(shortCode)
  if (!pub) throw new ApiError("NOT_FOUND", "This QR code is no longer active.")

  const clean = sanitizeImage(file.buffer)
  const id = randomBytes(16).toString("hex")
  const claimToken = randomBytes(24).toString("base64url")
  const storageKey = `${pub.tenantId.toHexString()}/public/${id}.${clean.ext}`

  await putObject(storageKey, clean.buffer, clean.contentType)

  const sys: TenantContext = {
    tenantId: pub.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const doc = await attachments.forTenant(sys).insertOne({
    branchId: pub.branchId,
    storageKey,
    filename: cleanFilename(file.filename, clean.ext),
    contentType: clean.contentType,
    size: clean.buffer.length,
    uploadedBy: "public",
    scope: "ticket",
    claimTokenHash: sha256Hex(claimToken),
    claimed: false,
  })

  return {
    attachmentId: doc._id.toHexString(),
    claimToken,
    filename: doc.filename,
    contentType: doc.contentType,
    size: doc.size,
  }
}

/** Validates and claims pre-uploaded public attachments during ticket creation. */
export async function claimPublicAttachments(
  sys: TenantContext,
  ids: string[],
  tokens: string[],
  ticketId: ObjectId,
): Promise<string[]> {
  if (!ids.length) return []
  const claimed: string[] = []
  const repo = attachments.forTenant(sys)

  for (let i = 0; i < Math.min(ids.length, 3); i++) {
    const id = ids[i]
    const token = tokens[i]
    if (!id || !token) continue
    const doc = await repo.findById(id)
    if (!doc || doc.claimed || doc.claimTokenHash !== sha256Hex(token)) continue
    await repo.updateOne({ _id: doc._id }, { $set: { claimed: true, entityId: ticketId } })
    claimed.push(doc._id.toHexString())
  }
  return claimed
}

export async function storeTenantAttachment(
  ctx: TenantContext,
  input: {
    branchId?: ObjectId
    filename: string
    buffer: Buffer
    scope: AttachmentScope
    entityId?: ObjectId
  },
) {
  if (input.branchId && !inBranchScope(ctx.branchScope, input.branchId)) {
    throw new ApiError("FORBIDDEN", "You don't have access to that branch.")
  }
  const clean = sanitizeImage(input.buffer)
  const id = randomBytes(16).toString("hex")
  const storageKey = `${ctx.tenantId.toHexString()}/${input.scope}/${id}.${clean.ext}`

  await putObject(storageKey, clean.buffer, clean.contentType)

  return attachments.forTenant(ctx).insertOne({
    ...(input.branchId ? { branchId: input.branchId } : {}),
    storageKey,
    filename: cleanFilename(input.filename, clean.ext),
    contentType: clean.contentType,
    size: clean.buffer.length,
    uploadedBy: ctx.actorId,
    scope: input.scope,
    ...(input.entityId ? { entityId: input.entityId } : {}),
    claimed: true,
  })
}

export async function readAttachmentBytes(ctx: TenantContext, attachmentId: string) {
  const doc = await attachments.forTenant(ctx).findById(attachmentId)
  if (!doc) throw new ApiError("NOT_FOUND", "Attachment not found.")
  if (doc.branchId && !inBranchScope(ctx.branchScope, doc.branchId)) {
    throw new ApiError("FORBIDDEN", "You don't have access to this attachment.")
  }
  const buffer = await getObject(doc.storageKey)
  return { buffer, contentType: doc.contentType, filename: doc.filename }
}

/** Allows a reporter with their private tracking token to view photos on their ticket. */
export async function readPublicAttachmentBytes(attachmentId: string, trackingToken: string) {
  if (!trackingToken || trackingToken.length < 20) {
    throw new ApiError("FORBIDDEN", "Access denied.")
  }
  const ticket = await tickets.unscoped().findOne({ trackingTokenHashes: sha256Hex(trackingToken) })
  if (!ticket || !(ticket.attachments ?? []).includes(attachmentId)) {
    throw new ApiError("NOT_FOUND", "Attachment not found.")
  }
  const sys: TenantContext = {
    tenantId: ticket.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }
  const doc = await attachments.forTenant(sys).findById(attachmentId)
  if (!doc) throw new ApiError("NOT_FOUND", "Attachment not found.")
  const buffer = await getObject(doc.storageKey)
  return { buffer, contentType: doc.contentType, filename: doc.filename }
}

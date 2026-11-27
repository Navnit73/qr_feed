import { NextResponse } from "next/server"
import { ApiError } from "@/lib/api/errors"
import { fail } from "@/lib/api/response"
import { parseInput } from "@/lib/api/validation"
import { requireApiTenantContext } from "@/server/auth/session"
import { getBranch } from "@/server/modules/branches"
import { listQrCodes } from "@/server/modules/qr-codes"
import { getTenant } from "@/server/modules/tenants"
import { publicQrUrl } from "@/server/public-url"
import { qrPng } from "@/server/qr-image"
import { locations } from "@/server/repositories"
import { objectId } from "@/server/validation"

// Minimal CRC-32 + STORE ZIP builder (zero dependencies; PNGs are already deflate-compressed).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function buildZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0, true)
    local.setUint16(8, 0, true) // STORE
    local.setUint16(10, 0, true)
    local.setUint16(12, 0, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)

    localParts.push(new Uint8Array(local.buffer), nameBytes, entry.data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, 0, true)
    central.setUint16(14, 0, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, size, true)
    central.setUint32(24, size, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint16(30, 0, true)
    central.setUint16(32, 0, true)
    central.setUint16(34, 0, true)
    central.setUint16(36, 0, true)
    central.setUint32(38, 0, true)
    central.setUint32(42, offset, true)

    centralParts.push(new Uint8Array(central.buffer), nameBytes)
    offset += 30 + nameBytes.length + size
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true)
  eocd.setUint16(6, 0, true)
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true)
  eocd.setUint16(20, 0, true)

  const total = offset + centralSize + 22
  const out = new Uint8Array(total)
  let pos = 0
  for (const part of [...localParts, ...centralParts, new Uint8Array(eocd.buffer)]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

/** Bulk ZIP download of all active QR PNG stickers for a branch (phase.md §4.2, P2). */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/branches/[branchId]/qr-zip">,
) {
  try {
    const ctx = await requireApiTenantContext()
    const { branchId: branchIdRaw } = await params
    const branchId = parseInput(objectId, branchIdRaw)
    const [branch, qrs, locs, tenant] = await Promise.all([
      getBranch(ctx, branchId),
      listQrCodes(ctx, branchId),
      locations
        .forTenant(ctx)
        .find({ branchId, status: "active" }, { projection: { _id: 1, path: 1, code: 1 } }),
      getTenant(ctx.tenantId),
    ])

    const locMap = new Map(locs.map((l) => [l._id.toHexString(), l]))
    const activeEntries = qrs
      .map((q) => ({ qr: q, loc: locMap.get(q.locationId.toHexString()) }))
      .filter((x): x is { qr: (typeof qrs)[number]; loc: NonNullable<typeof x.loc> } => !!x.loc)
      .slice(0, 200)

    if (activeEntries.length === 0) {
      return fail("NOT_FOUND", "No active QR codes in this branch to download.")
    }

    const customDomain = tenant?.branding?.customDomain
    const usedNames = new Set<string>()
    const files = await Promise.all(
      activeEntries.map(async ({ qr, loc }) => {
        const base =
          (loc.code ? `${loc.code}-` : "") +
          loc.path
            .join("-")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
        let filename = `${base || qr.shortCode}.png`
        if (usedNames.has(filename)) filename = `${base}-${qr.shortCode}.png`
        usedNames.add(filename)
        const png = await qrPng(publicQrUrl(qr.shortCode, customDomain))
        return { name: filename, data: new Uint8Array(png) }
      }),
    )

    const zip = buildZip(files)
    const safeBranch = branch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "branch"
    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="qr-codes-${safeBranch}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message)
    return fail("INTERNAL", "Could not generate QR ZIP archive.")
  }
}

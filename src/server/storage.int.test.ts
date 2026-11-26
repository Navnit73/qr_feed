import { describe, expect, it } from "vitest"
import { resolveTenantContext } from "@/server/auth/context"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { readAttachmentBytes, storePublicAttachment, storeTenantAttachment } from "@/server/storage"
import { setupTestDb, testContext } from "@/test/db"

setupTestDb()

function makeJpegWithGps(): Buffer {
  const soi = Buffer.from([0xff, 0xd8])
  const app1Data = Buffer.from("Exif\0\0GPS_PRIVATE_28.61_77.20", "utf8")
  const app1Len = Buffer.alloc(2)
  app1Len.writeUInt16BE(app1Data.length + 2)
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), app1Len, app1Data])
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x11, 0x22])
  const eoi = Buffer.from([0xff, 0xd9])
  return Buffer.concat([soi, app1, sos, eoi])
}

describe("attachments & storage (F-2.3 / T-UP-1)", () => {
  it("sanitizes EXIF GPS, stores files tenant-scoped, and links public uploads to tickets", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "owner", email: "o@up.test", name: "Owner" },
      { orgName: "Upload Hotel", industry: "hotel", branchName: "Goa", timezone: "Asia/Kolkata" },
    )
    const ctx = (await resolveTenantContext("owner", tenant._id))!
    const loc = await createLocation(ctx, {
      branchId: branch._id,
      type: "location",
      name: "Poolside",
    })
    const qr = await createQrCode(ctx, loc._id)
    const cats = await listCategories(ctx, "hotel")

    const uploaded = await storePublicAttachment(qr.shortCode, {
      filename: "wet-floor.jpg",
      buffer: makeJpegWithGps(),
    })

    const stored = await readAttachmentBytes(ctx, uploaded.attachmentId)
    expect(stored.contentType).toBe("image/jpeg")
    expect(stored.buffer.toString("utf8")).not.toContain("GPS_PRIVATE")

    // Another tenant cannot read this attachment
    const otherTenant = testContext()
    await expect(readAttachmentBytes(otherTenant, uploaded.attachmentId)).rejects.toThrow()

    const result = await submitFeedback(
      qr.shortCode,
      {
        categoryId: cats[0]._id.toHexString(),
        description: "Wet tiles near steps",
        consent: "on",
        attachmentIds: [uploaded.attachmentId],
        attachmentTokens: [uploaded.claimToken],
      },
      { ip: "127.0.0.1", limits: null },
    )
    expect(result.number).toMatch(/^TKT-/)

    // Staff upload works too
    const staffUpload = await storeTenantAttachment(ctx, {
      branchId: branch._id,
      filename: "fixed.jpg",
      buffer: makeJpegWithGps(),
      scope: "comment",
    })
    const staffBytes = await readAttachmentBytes(ctx, staffUpload._id.toHexString())
    expect(staffBytes.buffer.toString("utf8")).not.toContain("GPS_PRIVATE")
  })
})

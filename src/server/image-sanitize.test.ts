// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { sanitizeImage, MAX_IMAGE_BYTES } from "./image-sanitize"

/** Builds a minimal valid JPEG containing an APP1 EXIF/GPS segment with an identifiable GPS marker. */
function makeJpegWithExif(gpsPayload = "GPS_LAT_28.6139_LON_77.2090"): Buffer {
  const soi = Buffer.from([0xff, 0xd8])
  // APP0 JFIF
  const app0Data = Buffer.from("JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00", "binary")
  const app0Len = Buffer.alloc(2)
  app0Len.writeUInt16BE(app0Data.length + 2)
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0]), app0Len, app0Data])

  // APP1 EXIF containing sensitive GPS coordinates
  const app1Data = Buffer.from(`Exif\0\0${gpsPayload}`, "utf8")
  const app1Len = Buffer.alloc(2)
  app1Len.writeUInt16BE(app1Data.length + 2)
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), app1Len, app1Data])

  // COM comment segment (metadata)
  const comData = Buffer.from("Camera Serial 999", "utf8")
  const comLen = Buffer.alloc(2)
  comLen.writeUInt16BE(comData.length + 2)
  const com = Buffer.concat([Buffer.from([0xff, 0xfe]), comLen, comData])

  // SOS + minimal scan bytes + EOI
  const sosHeader = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])
  const scanData = Buffer.from([0x12, 0x34, 0x56, 0x78])
  const eoi = Buffer.from([0xff, 0xd9])

  return Buffer.concat([soi, app0, app1, com, sosHeader, scanData, eoi])
}

/** Builds a minimal valid PNG with an eXIf + tEXt chunk that must be stripped. */
function makePngWithExif(secret = "GPS_SECRET_COORD"): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4) // dummy crc for structure test
    return Buffer.concat([len, Buffer.from(type, "ascii"), data, crc])
  }
  const ihdr = chunk("IHDR", Buffer.alloc(13))
  const exif = chunk("eXIf", Buffer.from(secret, "utf8"))
  const text = chunk("tEXt", Buffer.from(`Author\0${secret}`, "utf8"))
  const idat = chunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00]))
  const iend = chunk("IEND", Buffer.alloc(0))
  return Buffer.concat([sig, ihdr, exif, text, idat, iend])
}

/** Builds a minimal RIFF WebP with an EXIF chunk that must be stripped. */
function makeWebpWithExif(secret = "GPS_WEBP_LOCATION"): Buffer {
  const chunk = (fourcc: string, data: Buffer) => {
    const size = Buffer.alloc(4)
    size.writeUInt32LE(data.length)
    const pad = data.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0)
    return Buffer.concat([Buffer.from(fourcc, "ascii"), size, data, pad])
  }
  const vp8 = chunk("VP8 ", Buffer.from([0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00]))
  const exif = chunk("EXIF", Buffer.from(secret, "utf8"))
  const payload = Buffer.concat([Buffer.from("WEBP", "ascii"), vp8, exif])
  const riffSize = Buffer.alloc(4)
  riffSize.writeUInt32LE(payload.length)
  return Buffer.concat([Buffer.from("RIFF", "ascii"), riffSize, payload])
}

describe("sanitizeImage (T-UP-1)", () => {
  it("strips APP1 EXIF/GPS and COM metadata from JPEGs while keeping image data", () => {
    const raw = makeJpegWithExif("GPS_28.6139_77.2090")
    expect(raw.toString("utf8")).toContain("GPS_28.6139_77.2090")

    const out = sanitizeImage(raw)
    expect(out.contentType).toBe("image/jpeg")
    expect(out.ext).toBe("jpg")
    expect(out.buffer[0]).toBe(0xff)
    expect(out.buffer[1]).toBe(0xd8)
    expect(out.buffer.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]))
    expect(out.buffer.toString("utf8")).not.toContain("GPS_28.6139_77.2090")
    expect(out.buffer.toString("utf8")).not.toContain("Camera Serial")
  })

  it("strips eXIf and tEXt chunks from PNGs while keeping IHDR/IDAT/IEND", () => {
    const raw = makePngWithExif("SECRET_EXIF_DATA")
    expect(raw.toString("utf8")).toContain("SECRET_EXIF_DATA")

    const out = sanitizeImage(raw)
    expect(out.contentType).toBe("image/png")
    expect(out.ext).toBe("png")
    expect(out.buffer.toString("utf8")).not.toContain("SECRET_EXIF_DATA")
    expect(out.buffer.toString("ascii")).toContain("IHDR")
    expect(out.buffer.toString("ascii")).toContain("IDAT")
    expect(out.buffer.toString("ascii")).toContain("IEND")
  })

  it("strips EXIF chunks from WebP images and updates RIFF length", () => {
    const raw = makeWebpWithExif("SECRET_WEBP_GPS")
    expect(raw.toString("utf8")).toContain("SECRET_WEBP_GPS")

    const out = sanitizeImage(raw)
    expect(out.contentType).toBe("image/webp")
    expect(out.ext).toBe("webp")
    expect(out.buffer.toString("utf8")).not.toContain("SECRET_WEBP_GPS")
    expect(out.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF")
    expect(out.buffer.readUInt32LE(4)).toBe(out.buffer.length - 8)
  })

  it("rejects non-image payloads even if they look like text or SVG", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    )
    expect(() => sanitizeImage(svg)).toThrow(ApiError)
    expect(() => sanitizeImage(Buffer.alloc(0))).toThrow(ApiError)
  })

  it("rejects files over the size limit", () => {
    const big = Buffer.concat([makeJpegWithExif(), Buffer.alloc(MAX_IMAGE_BYTES + 10)])
    expect(() => sanitizeImage(big)).toThrow(/MB/i)
  })
})

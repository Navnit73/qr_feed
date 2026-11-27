import "server-only"
import { ApiError } from "@/lib/api/errors"

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

export type SanitizedImage = {
  buffer: Buffer
  contentType: "image/jpeg" | "image/png" | "image/webp"
  ext: "jpg" | "png" | "webp"
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_KEEP_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "sRGB", "cHRM"])

/**
 * Validates image magic bytes and size, then strips EXIF, GPS, XMP, and text metadata
 * (phase.md §10) so uploaded guest/staff photos never leak device location or serials.
 */
export function sanitizeImage(raw: Buffer, maxBytes = MAX_IMAGE_BYTES): SanitizedImage {
  if (!raw || raw.length === 0) {
    throw new ApiError("VALIDATION", "Please choose an image file.")
  }
  if (raw.length > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10
    throw new ApiError("VALIDATION", `Image must be under ${mb} MB.`)
  }

  if (raw.length >= 3 && raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff) {
    return { buffer: stripJpegMetadata(raw), contentType: "image/jpeg", ext: "jpg" }
  }
  if (raw.length >= 8 && raw.subarray(0, 8).equals(PNG_SIG)) {
    return { buffer: stripPngMetadata(raw), contentType: "image/png", ext: "png" }
  }
  if (
    raw.length >= 12 &&
    raw.subarray(0, 4).toString("ascii") === "RIFF" &&
    raw.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { buffer: stripWebpMetadata(raw), contentType: "image/webp", ext: "webp" }
  }

  throw new ApiError("VALIDATION", "Only JPEG, PNG and WebP images are supported.")
}

function stripJpegMetadata(buf: Buffer): Buffer {
  const parts: Buffer[] = [buf.subarray(0, 2)] // SOI (FF D8)
  let offset = 2
  let sawSos = false
  let sawEoi = false

  while (offset + 1 < buf.length) {
    if (buf[offset] !== 0xff) {
      throw new ApiError("VALIDATION", "This JPEG image appears corrupted.")
    }
    // Skip repeated 0xFF fill bytes
    while (offset < buf.length && buf[offset] === 0xff) offset++
    if (offset >= buf.length) break
    const marker = buf[offset]
    offset++

    // Standalone markers without length: EOI (D9), TEM (01), RST0-7 (D0-D7)
    if (marker === 0xd9) {
      parts.push(Buffer.from([0xff, 0xd9]))
      sawEoi = true
      break
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(Buffer.from([0xff, marker]))
      continue
    }

    if (offset + 2 > buf.length) {
      throw new ApiError("VALIDATION", "This JPEG image appears corrupted.")
    }
    const length = buf.readUInt16BE(offset)
    if (length < 2 || offset + length > buf.length) {
      throw new ApiError("VALIDATION", "This JPEG image appears corrupted.")
    }
    const segmentEnd = offset + length

    // Start of Scan (DA): header followed by entropy-coded scan until the next non-RST marker
    if (marker === 0xda) {
      sawSos = true
      let scanPos = segmentEnd
      while (scanPos < buf.length) {
        if (buf[scanPos] !== 0xff) {
          scanPos++
          continue
        }
        let next = scanPos + 1
        while (next < buf.length && buf[next] === 0xff) next++
        if (next >= buf.length) {
          scanPos = buf.length
          break
        }
        const m = buf[next]
        // Byte-stuffed literal 0xFF (FF 00) and restart markers (FF D0..D7) belong to scan data
        if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) {
          scanPos = next + 1
          continue
        }
        // Any other marker ends this scan
        break
      }
      parts.push(Buffer.from([0xff, 0xda]), buf.subarray(offset, scanPos))
      offset = scanPos
      continue
    }

    // Drop APP1 (E1: EXIF/XMP/GPS), APP2-APP15 (E2-EF: ICC/IPTC/Adobe), COM (FE: comments).
    // Keep APP0 (E0: JFIF) and all decoding tables / frame headers.
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe
    if (!isMetadata) {
      parts.push(Buffer.from([0xff, marker]), buf.subarray(offset, segmentEnd))
    }
    offset = segmentEnd
  }

  if (!sawSos || !sawEoi) {
    throw new ApiError("VALIDATION", "This JPEG image appears corrupted.")
  }
  return Buffer.concat(parts)
}

function stripPngMetadata(buf: Buffer): Buffer {
  const parts: Buffer[] = [buf.subarray(0, 8)]
  let offset = 8
  let sawIhdr = false
  let sawIend = false

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii")
    const totalChunk = 12 + length
    if (offset + totalChunk > buf.length) {
      throw new ApiError("VALIDATION", "This PNG image appears corrupted.")
    }

    if (type === "IHDR") sawIhdr = true
    if (type === "IEND") sawIend = true
    if (PNG_KEEP_CHUNKS.has(type)) {
      parts.push(buf.subarray(offset, offset + totalChunk))
    }
    offset += totalChunk
    if (type === "IEND") break
  }

  if (!sawIhdr || !sawIend) {
    throw new ApiError("VALIDATION", "This PNG image appears corrupted.")
  }
  return Buffer.concat(parts)
}

function stripWebpMetadata(buf: Buffer): Buffer {
  const chunks: Buffer[] = []
  let offset = 12 // Skip "RIFF" + size + "WEBP"
  let hasImageChunk = false

  while (offset + 8 <= buf.length) {
    const fourcc = buf.subarray(offset, offset + 4).toString("ascii")
    const size = buf.readUInt32LE(offset + 4)
    const padded = size + (size % 2)
    const chunkEnd = offset + 8 + padded
    if (chunkEnd > buf.length) {
      throw new ApiError("VALIDATION", "This WebP image appears corrupted.")
    }

    if (fourcc === "VP8 " || fourcc === "VP8L" || fourcc === "VP8X") hasImageChunk = true
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const slice = Buffer.from(buf.subarray(offset, chunkEnd))
      // Clear EXIF (bit 3) and XMP (bit 2) flags in VP8X extended header if present.
      if (fourcc === "VP8X" && slice.length >= 12) {
        slice[8] = slice[8] & ~0x0c
      }
      chunks.push(slice)
    }
    offset = chunkEnd
  }

  if (!hasImageChunk) {
    throw new ApiError("VALIDATION", "This WebP image appears corrupted.")
  }

  const payload = Buffer.concat([Buffer.from("WEBP", "ascii"), ...chunks])
  const header = Buffer.alloc(8)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(payload.length, 4)
  return Buffer.concat([header, payload])
}

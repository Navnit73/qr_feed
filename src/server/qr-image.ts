import "server-only"
import QRCode from "qrcode"

// Black on white with a 4-module quiet zone: brand colours scan worse on cheap printers and
// in dim washrooms, and "M" error correction survives scuffed stickers.
const OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 4,
  color: { dark: "#000000", light: "#ffffff" },
} as const

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: "svg" })
}

export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPTIONS, type: "png", width: 1024 })
}

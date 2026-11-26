/**
 * Client-side image compression before upload (phase.md §6.4).
 * Resizes large camera photos to ≤1600px on the longest edge and re-encodes to JPEG,
 * reducing cellular upload size and stripping browser-decoded EXIF client-side too
 * (the server always re-strips EXIF independently).
 */
export async function compressImageFile(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") return file
  if (!file.type.startsWith("image/")) return file
  if (file.size < 250 * 1024) return file // Already small enough

  try {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = reject
        el.src = url
      })
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1))
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return file
      ctx.drawImage(img, 0, 0, width, height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      )
      if (!blob || blob.size >= file.size) return file
      const base = file.name.replace(/\.[^.]+$/, "") || "photo"
      return new File([blob], `${base}.jpg`, { type: "image/jpeg" })
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return file
  }
}

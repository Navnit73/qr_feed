"use client"

import { useRef, useState } from "react"
import { Icon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { compressImageFile } from "@/lib/image-compress"

export type UploadedPhoto = {
  id: string
  claimToken?: string
  filename: string
  previewUrl: string
}

type Props = {
  mode: "public" | "staff"
  shortCode?: string
  scope?: "ticket" | "comment" | "rca" | "capa" | "audit"
  branchId?: string
  entityId?: string
  maxFiles?: number
  label?: string
  hint?: string
  removeLabel?: string
  uploadingLabel?: string
  onChange?: (photos: UploadedPhoto[]) => void
}

/**
 * Mobile-first photo picker with client-side compression and server-side EXIF stripping.
 * Emits hidden form inputs (`attachmentIds`, `attachmentTokens`) so standard forms submit cleanly.
 */
export function PhotoUpload({
  mode,
  shortCode,
  scope = "comment",
  branchId,
  entityId,
  maxFiles = 3,
  label = "Add photos (optional)",
  hint = "Up to 3 photos, max 5 MB each. Location metadata is stripped automatically.",
  removeLabel = "Remove photo",
  uploadingLabel = "Uploading photo…",
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(next: UploadedPhoto[]) {
    setPhotos(next)
    onChange?.(next)
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setError(null)
    const remaining = maxFiles - photos.length
    if (remaining <= 0) {
      setError(`You can attach up to ${maxFiles} photos.`)
      return
    }
    const picked = Array.from(fileList).slice(0, remaining)
    setUploading(true)

    const added: UploadedPhoto[] = []
    try {
      for (const rawFile of picked) {
        const file = await compressImageFile(rawFile)
        const fd = new FormData()
        fd.append("file", file)
        let endpoint = "/api/uploads"
        if (mode === "public") {
          endpoint = "/api/public/upload"
          fd.append("code", shortCode ?? "")
        } else {
          fd.append("scope", scope)
          if (branchId) fd.append("branchId", branchId)
          if (entityId) fd.append("entityId", entityId)
        }

        const res = await fetch(endpoint, { method: "POST", body: fd })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message ?? "Could not upload photo.")
        }

        const previewUrl = URL.createObjectURL(file)
        added.push({
          id: mode === "public" ? json.data.attachmentId : json.data.id,
          claimToken: mode === "public" ? json.data.claimToken : undefined,
          filename: json.data.filename,
          previewUrl,
        })
      }
      update([...photos, ...added])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload photo.")
      if (added.length > 0) update([...photos, ...added])
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function remove(id: string) {
    const target = photos.find((p) => p.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    update(photos.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {photos.length}/{maxFiles}
        </span>
      </div>

      {photos.map((p) => (
        <span key={p.id} className="hidden">
          <input type="hidden" name="attachmentIds" value={p.id} />
          {p.claimToken && <input type="hidden" name="attachmentTokens" value={p.claimToken} />}
        </span>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        {photos.map((p) => (
          <div key={p.id} className="relative size-20 overflow-hidden rounded-xl border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt={p.filename} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p.id)}
              aria-label={`${removeLabel} ${p.filename}`}
              className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-foreground text-background hover:bg-destructive hover:text-destructive-foreground"
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
        ))}

        {photos.length < maxFiles && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="xl"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="camera" data-icon="inline-start" />
              {uploading ? uploadingLabel : label}
            </Button>
          </>
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

/** Copies text (or the current page URL) and says so. */
export function CopyButton({
  text,
  label = "Copy link",
  copiedLabel = "Copied",
}: {
  text?: string
  label?: string
  copiedLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <Button
      type="button"
      variant="outline"
      size="xl"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text ?? window.location.href.split("?")[0])
          setCopied(true)
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => setCopied(false), 2000)
        } catch {
          // Clipboard access denied or unavailable in non-secure context
        }
      }}
    >
      {copied ? copiedLabel : label}
    </Button>
  )
}

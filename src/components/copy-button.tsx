"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

/** Copies text (or the current page URL) and says so. */
export function CopyButton({ text, label = "Copy link" }: { text?: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="xl"
      onClick={async () => {
        await navigator.clipboard.writeText(text ?? window.location.href.split("?")[0])
        setCopied(true)
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  )
}

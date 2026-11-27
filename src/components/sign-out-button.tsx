"use client"

import { useState } from "react"
import { Icon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function SignOutButton({
  redirectTo,
  compact = false,
}: {
  redirectTo?: string
  compact?: boolean
}) {
  const [pending, setPending] = useState(false)
  return (
    <Button
      variant="outline"
      size={compact ? "icon-xl" : "xl"}
      className={compact ? undefined : "w-full"}
      loading={pending}
      aria-label={compact ? "Sign out" : undefined}
      onClick={async () => {
        setPending(true)
        try {
          await fetch("/api/auth/clear-session-cookies", { method: "POST" }).catch(() => {})
          await authClient.signOut().catch(() => {})
        } finally {
          window.location.assign(
            redirectTo ? `/sign-in?next=${encodeURIComponent(redirectTo)}` : "/sign-in",
          )
        }
      }}
    >
      {!pending && <Icon name="signOut" data-icon={compact ? undefined : "inline-start"} />}
      {!compact && "Sign out"}
    </Button>
  )
}

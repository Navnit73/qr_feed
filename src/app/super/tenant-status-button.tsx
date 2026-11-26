"use client"

import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import { setTenantStatusAction } from "./actions"

export function TenantStatusButton({
  id,
  name,
  status,
}: {
  id: string
  name: string
  status: "active" | "suspended"
}) {
  const swal = useSweetAlert()
  const suspending = status === "active"
  return (
    <Button
      variant={suspending ? "outline" : "ghost"}
      size="sm"
      onClick={() =>
        swal.fire({
          tone: suspending ? "warning" : "question",
          title: suspending ? `Suspend ${name}?` : `Reactivate ${name}?`,
          text: suspending
            ? "Every member loses access at once. Data is kept, and you can reactivate any time."
            : "Members can sign in again straight away.",
          confirmText: suspending ? "Suspend" : "Reactivate",
          cancelText: "Cancel",
          confirmVariant: suspending ? "destructive" : "default",
          onConfirm: async () => {
            const res = await setTenantStatusAction(id, suspending ? "suspended" : "active")
            if (res && !res.ok) throw new Error(res.error.message)
          },
        })
      }
    >
      {suspending ? "Suspend" : "Reactivate"}
    </Button>
  )
}

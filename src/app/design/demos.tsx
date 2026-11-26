"use client"

import { useState } from "react"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert, type SweetAlertTone } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false)
  return (
    <Button
      variant="inverse"
      loading={loading}
      onClick={async () => {
        setLoading(true)
        await wait(1500)
        setLoading(false)
      }}
    >
      {loading ? "Saving…" : "Save changes"}
    </Button>
  )
}

export function ModalDemo() {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline">
          <Icon name="location" data-icon="inline-start" /> Add location
        </Button>
      }
      title="Add location"
      description="Each location gets its own QR code. You can move it later."
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Add location</Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="location-name">Location name</Label>
        <Input id="location-name" placeholder="Washroom F2" />
      </div>
    </Modal>
  )
}

const toneDemos: { tone: SweetAlertTone; title: string; text: string }[] = [
  { tone: "success", title: "Ticket closed", text: "TKT-2026-000123 was verified and closed." },
  { tone: "warning", title: "SLA at risk", text: "This ticket breaches its L1 SLA in 12 minutes." },
  { tone: "error", title: "Upload failed", text: "The photo is over 10 MB. Try a smaller one." },
  { tone: "info", title: "QR code ready", text: "Print it and stick it at the location." },
  { tone: "question", title: "Escalate to L2?", text: "The L2 supervisor will be notified." },
]

export function SweetAlertDemo() {
  const swal = useSweetAlert()

  async function deleteBranch() {
    const { isConfirmed } = await swal.fire({
      tone: "warning",
      title: "Delete Hotel Delhi?",
      text: "Its 14 locations and QR codes stop working. This can't be undone.",
      confirmText: "Delete",
      cancelText: "Keep it",
      confirmVariant: "destructive",
      onConfirm: () => wait(800),
    })
    if (isConfirmed) {
      await swal.fire({
        tone: "success",
        title: "Branch deleted",
        text: "Hotel Delhi was removed.",
      })
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {toneDemos.map((d) => (
        <Button
          key={d.tone}
          variant="outline"
          onClick={() =>
            swal.fire({ ...d, cancelText: d.tone === "question" ? "Not now" : undefined })
          }
        >
          <Icon name={d.tone} data-icon="inline-start" />
          <span className="capitalize">{d.tone}</span>
        </Button>
      ))}
      <Button variant="destructive" onClick={deleteBranch}>
        Delete branch
      </Button>
    </div>
  )
}

export function ShellPrimitivesDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Sheet>
        <SheetTrigger render={<Button variant="outline" />}>
          <Icon name="sidebar" data-icon="inline-start" /> Open drawer
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Quick details</SheetTitle>
            <SheetDescription>
              Slide-over drawers use semantic tokens and zero shadows.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <Icon name="settings" data-icon="inline-start" /> Actions menu
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Ticket actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Icon name="verify" /> Verify resolution
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive">
            <Icon name="error" /> Cancel ticket
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

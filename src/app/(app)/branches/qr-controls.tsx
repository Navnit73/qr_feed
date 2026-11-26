"use client"

import { useState, useTransition } from "react"
import { CopyButton } from "@/components/copy-button"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createQrAction,
  generateQrCodesAction,
  regenerateQrAction,
  revokeQrAction,
} from "./actions"

export type QrInfo = { id: string; url: string; scanCount: number }

export function CreateQrButton({
  locationId,
  branchId,
  name,
}: {
  locationId: string
  branchId: string
  name: string
}) {
  const [pending, start] = useTransition()
  const swal = useSweetAlert()
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      aria-label={`Create QR for ${name}`}
      onClick={() =>
        start(async () => {
          const res = await createQrAction(locationId, branchId)
          if (res && !res.ok)
            await swal.fire({
              tone: "error",
              title: "Couldn't create the QR code",
              text: res.error.message,
            })
        })
      }
    >
      <Icon name="qr" data-icon="inline-start" /> Create QR
    </Button>
  )
}

/** Shows a location's QR: preview, public link, downloads, regenerate and revoke. */
export function QrButton({
  qr,
  name,
  path,
  branchId,
  canManage,
}: {
  qr: QrInfo
  name: string
  path: string
  branchId: string
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  const swal = useSweetAlert()

  const confirm = (kind: "regenerate" | "revoke") =>
    swal.fire({
      tone: "warning",
      title: kind === "revoke" ? `Revoke the QR for ${name}?` : `Replace the QR for ${name}?`,
      text:
        kind === "revoke"
          ? "Scans of the printed code will stop working straight away."
          : "The printed code stops working. Print and put up the new one.",
      confirmText: kind === "revoke" ? "Revoke" : "Regenerate",
      cancelText: "Cancel",
      confirmVariant: "destructive",
      onConfirm: async () => {
        const res =
          kind === "revoke"
            ? await revokeQrAction(qr.id, branchId)
            : await regenerateQrAction(qr.id, branchId)
        if (res && !res.ok) throw new Error(res.error.message)
        setOpen(false)
      },
    })

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={`QR code · ${name}`}
      description={`Scanned ${qr.scanCount} ${qr.scanCount === 1 ? "time" : "times"}.`}
      trigger={
        <Button variant="outline" size="sm" aria-label={`QR code for ${name}`}>
          <Icon name="qr" data-icon="inline-start" /> QR
        </Button>
      }
    >
      <div className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image */}
        <img
          src={`/api/qr/${qr.id}/svg`}
          alt={`QR code for ${path}`}
          width={220}
          height={220}
          className="mx-auto rounded-xl border bg-white p-2"
        />
        <div className="space-y-2">
          <Label htmlFor={`qr-link-${qr.id}`}>Public link</Label>
          <div className="flex gap-2">
            <Input
              id={`qr-link-${qr.id}`}
              readOnly
              value={qr.url}
              className="h-11 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton text={qr.url} label="Copy" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`/api/qr/${qr.id}/svg?download=1`}
            className={buttonVariants({ variant: "outline", size: "xl" })}
          >
            Download SVG
          </a>
          <a
            href={`/api/qr/${qr.id}/png?download=1`}
            className={buttonVariants({ variant: "outline", size: "xl" })}
          >
            Download PNG
          </a>
        </div>
        {canManage && (
          <div className="flex justify-between gap-2 border-t pt-4">
            <Button variant="ghost" size="lg" onClick={() => confirm("regenerate")}>
              Regenerate
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="text-destructive"
              onClick={() => confirm("revoke")}
            >
              Revoke
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function GenerateQrCodesButton({ branchId }: { branchId: string }) {
  const [pending, start] = useTransition()
  const swal = useSweetAlert()
  return (
    <Button
      variant="outline"
      size="xl"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await generateQrCodesAction(branchId)
          if (!res || !res.ok) {
            await swal.fire({
              tone: "error",
              title: "Couldn't generate codes",
              text: res?.error.message,
            })
          } else if (res.data === 0) {
            await swal.fire({ tone: "info", title: "Every location already has a QR code" })
          }
        })
      }
    >
      <Icon name="qr" data-icon="inline-start" /> Generate QR codes
    </Button>
  )
}

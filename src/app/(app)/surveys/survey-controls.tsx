"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { CopyButton } from "@/components/copy-button"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { regenerateSurveyQrAction, setSurveyStatusAction } from "./actions"

export type SurveyQrInfo = {
  id: string
  title: string
  shortCode: string
  url: string
  scanCount: number
}

export function SurveyQrButton({
  survey,
  canRegenerate,
  size = "lg",
}: {
  survey: SurveyQrInfo
  canRegenerate: boolean
  size?: "sm" | "lg" | "xl"
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const swal = useSweetAlert()

  const confirmRegenerate = () =>
    swal.fire({
      tone: "warning",
      title: `Replace QR code for "${survey.title}"?`,
      text: "Previously printed QR codes for this survey will stop working immediately. Existing responses are kept.",
      confirmText: "Regenerate QR",
      cancelText: "Cancel",
      confirmVariant: "destructive",
      onConfirm: async () => {
        const res = await regenerateSurveyQrAction(survey.id)
        if (!res || !res.ok) throw new Error(res?.error.message ?? "Could not regenerate QR.")
        router.refresh()
        setOpen(false)
      },
    })

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={`Survey QR · ${survey.title}`}
      description={`Scanned ${survey.scanCount} ${survey.scanCount === 1 ? "time" : "times"} · Code ${survey.shortCode}`}
      trigger={
        <Button variant="secondary" size={size} aria-label={`QR code for ${survey.title}`}>
          <Icon name="qr" data-icon="inline-start" />
          <span>QR code</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic SVG */}
        <img
          src={`/api/surveys/${survey.id}/qr/svg?v=${survey.shortCode}`}
          alt={`QR code for ${survey.title}`}
          width={220}
          height={220}
          className="mx-auto rounded-xl border bg-white p-2"
        />
        <div className="space-y-2">
          <Label htmlFor={`survey-link-${survey.id}`}>Public patient / guest link</Label>
          <div className="flex gap-2">
            <Input
              id={`survey-link-${survey.id}`}
              readOnly
              value={survey.url}
              className="h-11 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <CopyButton text={survey.url} label="Copy" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`/api/surveys/${survey.id}/qr/svg?download=1&v=${survey.shortCode}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Icon name="download" data-icon="inline-start" /> Download SVG
          </a>
          <a
            href={`/api/surveys/${survey.id}/qr/png?download=1&v=${survey.shortCode}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Icon name="download" data-icon="inline-start" /> Download PNG
          </a>
          <Link
            href={`/print/surveys/${survey.id}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Icon name="print" data-icon="inline-start" /> Print poster
          </Link>
          <a
            href={`/s/${survey.shortCode}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "default", size: "lg" })}
          >
            <Icon name="eye" data-icon="inline-start" /> Open form
          </a>
        </div>
        {canRegenerate && (
          <div className="flex justify-end border-t pt-3">
            <Button variant="ghost" size="sm" onClick={confirmRegenerate}>
              <Icon name="refresh" data-icon="inline-start" /> Regenerate QR code
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function SurveyStatusButton({
  surveyId,
  status,
  size = "lg",
}: {
  surveyId: string
  status: "active" | "paused" | "archived"
  size?: "sm" | "lg"
}) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const swal = useSweetAlert()
  const nextStatus = status === "active" ? "paused" : "active"

  return (
    <Button
      variant="outline"
      size={size}
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await setSurveyStatusAction(surveyId, nextStatus)
          if (!res || !res.ok) {
            await swal.fire({
              tone: "error",
              title: "Could not update survey",
              text: res?.error.message ?? "Please try again.",
            })
            return
          }
          router.refresh()
        })
      }
    >
      <Icon name={status === "active" ? "pause" : "play"} data-icon="inline-start" />
      {status === "active" ? "Pause" : "Activate"}
    </Button>
  )
}

export function ArchiveSurveyButton({ surveyId, title }: { surveyId: string; title: string }) {
  const router = useRouter()
  const swal = useSweetAlert()
  return (
    <Button
      variant="ghost"
      size="lg"
      className="text-destructive"
      onClick={() =>
        swal.fire({
          tone: "warning",
          title: `Archive "${title}"?`,
          text: "The survey QR code will stop accepting new responses. Historical data remains preserved in the database.",
          confirmText: "Archive survey",
          cancelText: "Cancel",
          confirmVariant: "destructive",
          onConfirm: async () => {
            const res = await setSurveyStatusAction(surveyId, "archived")
            if (!res || !res.ok) throw new Error(res?.error.message ?? "Could not archive survey.")
            router.push("/surveys")
            router.refresh()
          },
        })
      }
    >
      <Icon name="archive" data-icon="inline-start" /> Archive
    </Button>
  )
}

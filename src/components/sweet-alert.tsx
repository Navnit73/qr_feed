"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Icon, type IconName } from "@/components/icons"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SweetAlertTone = "success" | "warning" | "error" | "info" | "question"

export type SweetAlertOptions = {
  title: string
  text?: ReactNode
  tone?: SweetAlertTone
  confirmText?: string
  /** Giving a cancel label also shows the cancel button. */
  cancelText?: string
  showCancel?: boolean
  confirmVariant?: "default" | "destructive" | "warning" | "inverse"
  /**
   * Runs when the user confirms. The alert stays open with a spinner until it resolves,
   * and shows the error message in place if it throws, so the user can retry or cancel.
   */
  onConfirm?: () => Promise<unknown> | unknown
}

export type SweetAlertResult = { isConfirmed: boolean }

type SweetAlertApi = {
  fire: (options: SweetAlertOptions) => Promise<SweetAlertResult>
  /** Shorthand for a question with Cancel. Resolves to true when confirmed. */
  confirm: (options: SweetAlertOptions) => Promise<boolean>
}

// Tone → icon and tint. The tint is a soft status wash, the same recipe as Badge and Alert.
const tones: Record<SweetAlertTone, { icon: IconName; tint: string }> = {
  success: { icon: "success", tint: "bg-success/10 text-success ring-success/5" },
  warning: { icon: "warning", tint: "bg-warning/10 text-warning ring-warning/5" },
  error: { icon: "error", tint: "bg-destructive/10 text-destructive ring-destructive/5" },
  info: { icon: "info", tint: "bg-info/10 text-info ring-info/5" },
  question: { icon: "question", tint: "bg-muted text-foreground ring-foreground/5" },
}

const SweetAlertContext = createContext<SweetAlertApi | null>(null)

export function useSweetAlert(): SweetAlertApi {
  const ctx = useContext(SweetAlertContext)
  if (!ctx) throw new Error("useSweetAlert() must be used inside <SweetAlertProvider>.")
  return ctx
}

/** Mount once near the root. Screens then call `useSweetAlert().fire({...})`. */
export function SweetAlertProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<SweetAlertOptions | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolver = useRef<((r: SweetAlertResult) => void) | null>(null)

  const settle = useCallback((isConfirmed: boolean) => {
    resolver.current?.({ isConfirmed })
    resolver.current = null
    setOpen(false)
    setBusy(false)
  }, [])

  const fire = useCallback(
    (next: SweetAlertOptions) =>
      new Promise<SweetAlertResult>((resolve) => {
        // One alert at a time: a new one dismisses whatever was showing.
        resolver.current?.({ isConfirmed: false })
        resolver.current = resolve
        setOptions(next)
        setError(null)
        setBusy(false)
        setOpen(true)
      }),
    [],
  )

  const api = useMemo<SweetAlertApi>(
    () => ({
      fire,
      confirm: async (o) =>
        (await fire({ tone: "question", cancelText: "Cancel", ...o, showCancel: true }))
          .isConfirmed,
    }),
    [fire],
  )

  async function handleConfirm() {
    if (!options?.onConfirm) return settle(true)
    setBusy(true)
    setError(null)
    try {
      await options.onConfirm()
      settle(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const tone = tones[options?.tone ?? "info"]
  const showCancel = options?.showCancel ?? Boolean(options?.cancelText)
  const confirmVariant =
    options?.confirmVariant ?? (options?.tone === "error" ? "destructive" : "default")

  return (
    <SweetAlertContext.Provider value={api}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Escape and Cancel close it; ignore them while onConfirm is running.
          if (!next && !busy) settle(false)
        }}
      >
        {options && (
          <AlertDialogContent
            data-tone={options.tone ?? "info"}
            className="max-w-[calc(100%-2rem)] gap-0 p-6 text-center"
          >
            <div
              aria-hidden
              className={cn(
                "mx-auto mb-4 grid size-16 animate-in place-items-center rounded-full ring-8 duration-300 zoom-in-50",
                tone.tint,
              )}
            >
              <Icon name={tone.icon} className="size-8" />
            </div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight text-balance">
              {options.title}
            </AlertDialogTitle>
            {options.text && (
              <AlertDialogDescription className="mt-2 text-pretty">
                {options.text}
              </AlertDialogDescription>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
              {showCancel && (
                <AlertDialogCancel size="xl" disabled={busy}>
                  {options.cancelText ?? "Cancel"}
                </AlertDialogCancel>
              )}
              <Button size="xl" variant={confirmVariant} loading={busy} onClick={handleConfirm}>
                {options.confirmText ?? "OK"}
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </SweetAlertContext.Provider>
  )
}

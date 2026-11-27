"use client"

import { useActionState, useState } from "react"
import { FormField, FormMessage, SubmitButton } from "@/components/form"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import { anonymiseNowAction, deleteTenantAction, saveRetentionAction } from "./actions"

export function PrivacyControls({ retentionDays, slug }: { retentionDays: number; slug: string }) {
  const [retState, retAction] = useActionState(saveRetentionAction, null)
  const [delState, delAction] = useActionState(deleteTenantAction, null)
  const [daysValue, setDaysValue] = useState(String(retentionDays))
  const [anonMsg, setAnonMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const swal = useSweetAlert()

  const activeDays = Math.min(3650, Math.max(30, Number(daysValue) || retentionDays))

  return (
    <div className="space-y-8">
      <form action={retAction} className="max-w-md space-y-3">
        <FormField
          label="Data retention window (days)"
          name="retentionDays"
          type="number"
          min={30}
          max={3650}
          value={daysValue}
          onChange={(e) => setDaysValue(e.target.value)}
          hint="Reporter contact details on closed tickets older than this window can be anonymised."
          state={retState}
        />
        <FormMessage state={retState} success="Retention policy updated." />
        <div className="flex flex-wrap gap-2">
          <SubmitButton size="lg">Save policy</SubmitButton>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() =>
              swal.fire({
                tone: "warning",
                title: "Anonymise eligible reporter PII?",
                text: `Reporter names, emails and phone numbers on closed tickets older than ${activeDays} days will be permanently stripped.`,
                confirmText: "Anonymise now",
                cancelText: "Cancel",
                confirmVariant: "destructive",
                onConfirm: async () => {
                  const r = await anonymiseNowAction(activeDays)
                  if (r?.ok) {
                    setAnonMsg({
                      text: `Anonymised ${r.data.count} closed ticket(s).`,
                      isError: false,
                    })
                  } else if (r) {
                    setAnonMsg({ text: r.error.message, isError: true })
                    throw new Error(r.error.message)
                  }
                },
              })
            }
          >
            Anonymise eligible PII now
          </Button>
        </div>
        {anonMsg && (
          <p className={anonMsg.isError ? "text-sm text-destructive" : "text-sm text-success"}>
            {anonMsg.text}
          </p>
        )}
      </form>

      <div className="max-w-md space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
        <h3 className="font-semibold text-destructive">Danger zone · Delete organisation</h3>
        <p className="text-sm text-muted-foreground">
          Suspends access immediately and logs a GDPR/DPDP deletion request in the immutable audit
          chain. Type <code className="font-mono text-foreground">{slug}</code> to confirm.
        </p>
        <form action={delAction} className="space-y-3">
          <FormField
            label="Organisation slug"
            name="confirmSlug"
            placeholder={slug}
            required
            state={delState}
          />
          <FormMessage state={delState} success="Deletion requested and workspace suspended." />
          <SubmitButton variant="destructive" size="lg">
            Request organisation deletion
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}

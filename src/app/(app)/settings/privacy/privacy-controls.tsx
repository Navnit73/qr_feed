"use client"

import { useActionState, useState, useTransition } from "react"
import { FormField, FormMessage, SubmitButton } from "@/components/form"
import { Button } from "@/components/ui/button"
import { anonymiseNowAction, deleteTenantAction, saveRetentionAction } from "./actions"

export function PrivacyControls({ retentionDays, slug }: { retentionDays: number; slug: string }) {
  const [retState, retAction] = useActionState(saveRetentionAction, null)
  const [delState, delAction] = useActionState(deleteTenantAction, null)
  const [pending, startTransition] = useTransition()
  const [anonMsg, setAnonMsg] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <form action={retAction} className="max-w-md space-y-3">
        <FormField
          label="Data retention window (days)"
          name="retentionDays"
          type="number"
          min={30}
          max={3650}
          defaultValue={retentionDays}
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
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await anonymiseNowAction(retentionDays)
                if (r?.ok) setAnonMsg(`Anonymised ${r.data.count} closed ticket(s).`)
              })
            }
          >
            Anonymise eligible PII now
          </Button>
        </div>
        {anonMsg && <p className="text-sm text-success">{anonMsg}</p>}
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

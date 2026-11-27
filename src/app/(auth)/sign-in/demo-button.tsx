"use client"

import { useActionState } from "react"
import { FormMessage } from "@/components/form"
import { Icon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { demoSignInAction } from "./actions"

/** One-click button that provisions (if needed) and signs straight into the Sunrise Hospital demo. */
export function DemoSignInButton({ next }: { next: string }) {
  const [state, action, pending] = useActionState(demoSignInAction, null)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="next" value={next} />
      <Button
        type="submit"
        variant="secondary"
        size="xl"
        loading={pending}
        className="w-full font-semibold"
      >
        {!pending && <Icon name="sparkles" data-icon="inline-start" />}
        Try live demo (1-click)
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Explores Sunrise Hospital with sample tickets, QR codes, RCA &amp; audits.
      </p>
      <FormMessage state={state} />
    </form>
  )
}

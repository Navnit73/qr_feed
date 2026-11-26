"use client"

import { useActionState } from "react"
import { FormMessage, FormTextarea, RadioCards, RatingInput, SubmitButton } from "@/components/form"
import type { GuestStrings } from "@/lib/i18n"
import { submitClosureFeedbackAction } from "./actions"

export function ClosureFeedbackForm({ token, strings }: { token: string; strings: GuestStrings }) {
  const bound = submitClosureFeedbackAction.bind(null, token)
  const [state, action] = useActionState(bound, null)

  if (state?.ok) {
    return (
      <div className="mt-6 rounded-2xl border border-success/40 bg-success/10 p-4 text-center text-sm font-medium text-success">
        {strings.closureThanks}
      </div>
    )
  }

  return (
    <form action={action} className="mt-6 space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <h3 className="text-base font-semibold">{strings.closurePromptTitle}</h3>
        <p className="text-sm text-muted-foreground">{strings.closurePromptBody}</p>
      </div>
      <RadioCards
        legend={strings.closurePromptTitle}
        name="resolved"
        defaultValue="yes"
        state={state}
        options={[
          { value: "yes", label: strings.yesResolved },
          { value: "no", label: strings.noStillIssue },
        ]}
      />
      <RatingInput label={strings.howWasIt} name="rating" state={state} />
      <FormTextarea label={strings.closureCommentLabel} name="comment" state={state} />
      <FormMessage state={state} />
      <SubmitButton className="w-full">{strings.submitClosureFeedback}</SubmitButton>
    </form>
  )
}

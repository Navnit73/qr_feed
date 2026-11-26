"use client"

import { useActionState } from "react"
import { FormMessage, SubmitButton } from "@/components/form"
import { acceptInviteAction } from "./actions"

export function AcceptInvite({ token }: { token: string }) {
  const [state, action] = useActionState(() => acceptInviteAction(token), null)
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <SubmitButton className="w-full">Accept invite</SubmitButton>
    </form>
  )
}

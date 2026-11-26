"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { FormMessage } from "@/components/form"
import { Button } from "@/components/ui/button"
import { useHydrated } from "@/lib/use-hydrated"
import type { ApiResponse } from "@/lib/api/errors"

type State = ApiResponse<unknown> | null

/**
 * Better Auth's client calls run in the browser (they set the session cookie), so these forms
 * submit with JS rather than server actions. `onSubmit` returns an error message or nothing.
 */
export function AuthForm({
  submitLabel,
  onSubmit,
  children,
  success,
}: {
  submitLabel: string
  onSubmit: (form: FormData) => Promise<string | void>
  children: (state: State) => ReactNode
  success?: string
}) {
  const [state, setState] = useState<State>(null)
  const [pending, setPending] = useState(false)
  const hydrated = useHydrated()

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    try {
      const error = await onSubmit(new FormData(e.currentTarget))
      setState(
        error
          ? { ok: false, error: { code: "UNAUTHORIZED", message: error } }
          : { ok: true, data: null },
      )
    } catch {
      setState({ ok: false, error: { code: "NETWORK", message: "Couldn't reach the server." } })
    } finally {
      setPending(false)
    }
  }

  return (
    // method="post" + disabled until hydrated: a submit before React loads must never fall back
    // to a GET, which would put the password in the URL (BUG-005).
    <form onSubmit={handle} method="post" className="space-y-4">
      {children(state)}
      <FormMessage state={state} success={success} />
      <Button type="submit" size="xl" className="w-full" loading={pending} disabled={!hydrated}>
        {submitLabel}
      </Button>
    </form>
  )
}

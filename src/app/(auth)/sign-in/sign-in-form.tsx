"use client"

import { useRouter } from "next/navigation"
import { FormField } from "@/components/form"
import { authClient } from "@/lib/auth-client"
import { AuthForm } from "../auth-form"

export function SignInForm({ next }: { next: string }) {
  const router = useRouter()
  return (
    <AuthForm
      submitLabel="Sign in"
      onSubmit={async (form) => {
        const { error } = await authClient.signIn.email({
          email: String(form.get("email")),
          password: String(form.get("password")),
        })
        // One message for both cases, so the form doesn't reveal which emails have accounts.
        if (error) return "Invalid email or password."
        router.push(next)
        router.refresh()
      }}
    >
      {(state) => (
        <>
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            state={state}
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            state={state}
          />
        </>
      )}
    </AuthForm>
  )
}

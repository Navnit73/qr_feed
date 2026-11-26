"use client"

import { useRouter } from "next/navigation"
import { FormField } from "@/components/form"
import { authClient } from "@/lib/auth-client"
import { AuthForm } from "../auth-form"

export function SignUpForm({ next, email }: { next: string; email?: string }) {
  const router = useRouter()
  return (
    <AuthForm
      submitLabel="Create account"
      onSubmit={async (form) => {
        const { error } = await authClient.signUp.email({
          name: String(form.get("name")),
          email: String(form.get("email")),
          password: String(form.get("password")),
        })
        if (error) return error.message ?? "Couldn't create the account."
        router.push(next)
        router.refresh()
      }}
    >
      {(state) => (
        <>
          <FormField
            label="Full name"
            name="name"
            icon="user"
            placeholder="Asha Rao"
            autoComplete="name"
            required
            state={state}
          />
          <FormField
            label="Email"
            name="email"
            type="email"
            icon="mail"
            placeholder="you@company.com"
            autoComplete="email"
            defaultValue={email}
            required
            state={state}
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            icon="lock"
            revealable
            autoComplete="new-password"
            minLength={10}
            hint="At least 10 characters."
            required
            state={state}
          />
        </>
      )}
    </AuthForm>
  )
}

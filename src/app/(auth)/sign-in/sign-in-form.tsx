"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
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
            icon="mail"
            placeholder="you@company.com"
            autoComplete="email"
            required
            state={state}
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            icon="lock"
            revealable
            placeholder="Your password"
            labelAction={
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            }
            autoComplete="current-password"
            required
            state={state}
          />
        </>
      )}
    </AuthForm>
  )
}

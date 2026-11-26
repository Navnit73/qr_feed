"use client"

import Link from "next/link"
import { FormField } from "@/components/form"
import { authClient } from "@/lib/auth-client"
import { AuthForm } from "../auth-form"

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        We&apos;ll email you a link to choose a new one.
      </p>
      <AuthForm
        submitLabel="Send reset link"
        // Same answer whether or not the account exists, so emails can't be probed.
        success="If that email has an account, a reset link is on its way."
        onSubmit={async (form) => {
          await authClient.requestPasswordReset({
            email: String(form.get("email")),
            redirectTo: "/reset-password",
          })
        }}
      >
        {(state) => (
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
        )}
      </AuthForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  )
}

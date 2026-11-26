"use client"

import { useRouter } from "next/navigation"
import { FormField } from "@/components/form"
import { authClient } from "@/lib/auth-client"
import { AuthForm } from "../auth-form"

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  return (
    <AuthForm
      submitLabel="Save password"
      onSubmit={async (form) => {
        const { error } = await authClient.resetPassword({
          token,
          newPassword: String(form.get("password")),
        })
        if (error) return error.message ?? "This reset link is invalid or has expired."
        router.push("/sign-in")
      }}
    >
      {(state) => (
        <FormField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          hint="At least 10 characters. Signs you out everywhere else."
          required
          state={state}
        />
      )}
    </AuthForm>
  )
}

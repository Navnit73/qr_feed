import { Alert, AlertTitle } from "@/components/ui/alert"
import { Icon } from "@/components/icons"
import { ResetPasswordForm } from "./reset-form"

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams
  const validToken = typeof token === "string" && token.trim().length > 0 ? token.trim() : null
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Choose a new password</h1>
      {validToken ? (
        <ResetPasswordForm token={validToken} />
      ) : (
        <Alert variant="destructive">
          <Icon name="error" />
          <AlertTitle>This reset link is invalid or has expired.</AlertTitle>
        </Alert>
      )}
    </>
  )
}

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Icon } from "@/components/icons"
import { ResetPasswordForm } from "./reset-form"

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Choose a new password</h1>
      {typeof token === "string" ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert variant="destructive">
          <Icon name="error" />
          <AlertTitle>This reset link is invalid or has expired.</AlertTitle>
        </Alert>
      )}
    </>
  )
}

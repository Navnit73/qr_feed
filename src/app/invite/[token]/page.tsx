import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Suspense } from "react"
import { Skeleton } from "@/components/skeleton"
import { Icon } from "@/components/icons"
import { SignOutButton } from "@/components/sign-out-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { getCurrentUser } from "@/server/auth/session"
import { findPendingInvite } from "@/server/modules/members"
import { roleLabel } from "@/server/rbac/labels"
import { roles as rolesRepo } from "@/server/repositories"
import { AcceptInvite } from "./accept-button"

export const metadata: Metadata = { title: "Accept invite · QR Feed", robots: { index: false } }

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 sm:p-8">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <Invite params={params} />
        </Suspense>
      </div>
    </main>
  )
}

async function Invite({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  await connection() // invites expire, so check them at request time
  const { token } = await params
  const invite = await findPendingInvite(token).catch((err) => {
    if (err instanceof ApiError) return null
    throw err
  })
  return invite ? (
    <InviteBody token={token} invite={invite} />
  ) : (
    <Alert variant="destructive">
      <Icon name="error" />
      <AlertTitle>This invite link is invalid or has expired.</AlertTitle>
      <AlertDescription>Ask your admin to send a new one.</AlertDescription>
    </Alert>
  )
}

async function InviteBody({
  token,
  invite: { invite, tenant },
}: {
  token: string
  invite: Awaited<ReturnType<typeof findPendingInvite>>
}) {
  const needsCustom = invite.roles.some((r) => r.startsWith("custom:"))
  const [user, customRoles] = await Promise.all([
    getCurrentUser(),
    needsCustom
      ? rolesRepo
          .forTenant({
            tenantId: tenant._id,
            actorId: "public",
            roles: [],
            permissions: new Set(),
            branchScope: "all",
          })
          .find({}, { projection: { name: 1 } })
      : [],
  ])
  const customRoleNames = new Map(customRoles.map((r) => [r._id.toHexString(), r.name]))
  const here = `/invite/${token}`
  const linkClass = buttonVariants({ size: "xl", className: "w-full" })

  return (
    <>
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon name="users" className="size-6" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-balance">Join {tenant.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This invite is for <span className="font-medium text-foreground">{invite.email}</span>.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {invite.roles.map((r) => (
          <Badge key={r} variant="muted">
            {roleLabel(r, customRoleNames)}
          </Badge>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {!user ? (
          <>
            <Link
              href={`/sign-up?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}
              className={linkClass}
            >
              Create account
            </Link>
            <Link
              href={`/sign-in?next=${encodeURIComponent(here)}`}
              className={buttonVariants({ size: "xl", variant: "outline", className: "w-full" })}
            >
              Sign in
            </Link>
          </>
        ) : user.email.toLowerCase() !== invite.email ? (
          <>
            <Alert variant="warning">
              <Icon name="warning" />
              <AlertTitle>You&apos;re signed in as {user.email}</AlertTitle>
              <AlertDescription>
                Sign out, then sign in as {invite.email} to accept.
              </AlertDescription>
            </Alert>
            <SignOutButton redirectTo={here} />
          </>
        ) : (
          <AcceptInvite token={token} />
        )}
      </div>
    </>
  )
}

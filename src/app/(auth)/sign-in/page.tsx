import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Icon } from "@/components/icons"
import { buttonVariants } from "@/components/ui/button"
import { safeNext } from "@/lib/safe-next"
import { getCurrentUser } from "@/server/auth/session"
import { SignInForm } from "./sign-in-form"

export const metadata: Metadata = { title: "Sign in · QR Feed" }

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams
  const target = safeNext(typeof next === "string" ? next : null, "/dashboard")
  if (await getCurrentUser()) redirect(target)
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        Sign in to manage tickets, audits and QR codes for your locations.
      </p>
      <SignInForm next={target} />
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        New to QR Feed?
        <span className="h-px flex-1 bg-border" />
      </div>
      <Link
        href={`/sign-up?next=${encodeURIComponent(target)}`}
        className={buttonVariants({ variant: "outline", size: "xl", className: "w-full" })}
      >
        Create an account <Icon name="arrowRight" data-icon="inline-end" />
      </Link>
    </>
  )
}

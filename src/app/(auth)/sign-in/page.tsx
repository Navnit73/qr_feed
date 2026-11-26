import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
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
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Welcome back to QR Feed.</p>
      <SignInForm next={target} />
      <div className="mt-6 space-y-2 text-center text-sm">
        <p>
          <Link href="/forgot-password" className="font-medium text-success hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p className="text-muted-foreground">
          New here?{" "}
          <Link
            href={`/sign-up?next=${encodeURIComponent(target)}`}
            className="font-medium text-success hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </>
  )
}

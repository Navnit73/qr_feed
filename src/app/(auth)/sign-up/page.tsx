import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { safeNext } from "@/lib/safe-next"
import { getCurrentUser } from "@/server/auth/session"
import { SignUpForm } from "./sign-up-form"

export const metadata: Metadata = { title: "Create account · QR Feed" }

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next, email } = await searchParams
  const target = safeNext(typeof next === "string" ? next : null, "/onboarding")
  if (await getCurrentUser()) redirect(target)
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 mb-8 text-muted-foreground">
        Turn every QR scan into a ticket your team resolves on time.
      </p>
      <SignUpForm next={target} email={typeof email === "string" ? email : undefined} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(target)}`}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}

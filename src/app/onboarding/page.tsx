import type { Metadata } from "next"
import { timeZoneOptions } from "@/lib/time-zones"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Skeleton } from "@/components/skeleton"
import { Eyebrow } from "@/components/section"
import { getTenantContext, requireUser } from "@/server/auth/session"
import { INDUSTRIES } from "@/server/modules/tenants"
import { OnboardingForm } from "./onboarding-form"

export const metadata: Metadata = { title: "Set up your organisation · QR Feed" }

export default function OnboardingPage(props: PageProps<"/onboarding">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-16 h-96 w-full max-w-lg" />}>
      <Onboarding {...props} />
    </Suspense>
  )
}

async function Onboarding({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser("/onboarding")
  const { new: creatingAnother } = await searchParams
  // Members go straight to their dashboard unless they asked to create another organisation.
  if (!creatingAnother && (await getTenantContext())) redirect("/dashboard")

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <Eyebrow>Step 2 of 2</Eyebrow>
          <h1 className="text-[clamp(1.85rem,6.4vw,2.5rem)] leading-[1.08] font-bold tracking-tight text-balance">
            Set up your organisation
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Hi {user.name.split(" ")[0]}. Add your organisation and its first site. You can add more
            branches later.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-6 sm:p-8">
          <OnboardingForm industries={[...INDUSTRIES]} timeZones={timeZoneOptions()} />
        </div>
      </div>
    </main>
  )
}

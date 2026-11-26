"use client"

import { useActionState, useEffect, useRef } from "react"
import { FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { modernTimeZone } from "@/lib/time-zones"
import { createOrganizationAction } from "./actions"

const INDUSTRY_LABELS: Record<string, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  hotel: "Hotel",
  mall: "Mall / retail",
  manufacturing: "Manufacturing",
  other: "Something else",
}

export function OnboardingForm({
  industries,
  timeZones,
}: {
  industries: string[]
  timeZones: string[]
}) {
  const [state, action] = useActionState(createOrganizationAction, null)
  const tz = useRef<HTMLSelectElement>(null)

  // Default to the browser's zone after hydration, so server and client HTML match.
  useEffect(() => {
    const guess = modernTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (tz.current && timeZones.includes(guess)) tz.current.value = guess
  }, [timeZones])

  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Organisation name"
        name="orgName"
        placeholder="Acme Hotels"
        required
        state={state}
      />
      <FormSelect
        label="Industry"
        name="industry"
        state={state}
        options={industries.map((value) => ({ value, label: INDUSTRY_LABELS[value] ?? value }))}
        hint="We use it to suggest feedback categories."
      />
      <FormField
        label="First branch"
        name="branchName"
        placeholder="Hotel Delhi"
        required
        state={state}
      />
      <FormSelect
        ref={tz}
        label="Time zone"
        name="timezone"
        defaultValue="UTC"
        state={state}
        options={timeZones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
        hint="SLA timers count business hours in this zone."
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Create organisation</SubmitButton>
    </form>
  )
}

"use client"

import { useActionState } from "react"
import { FormField, FormMessage, FormTextarea, SubmitButton } from "@/components/form"
import { saveBrandingAction } from "./actions"

export function BrandingForm({
  initial,
}: {
  initial: {
    logoUrl?: string
    primaryColor?: string
    customDomain?: string
    emailSenderDomain?: string
    publicDisclaimer?: string
  }
}) {
  const [state, action] = useActionState(saveBrandingAction, null)
  return (
    <form action={action} className="max-w-xl space-y-4">
      <FormField
        label="Logo URL"
        name="logoUrl"
        type="url"
        defaultValue={initial.logoUrl ?? ""}
        placeholder="https://cdn.example.com/logo.png"
        hint="Displayed at the top of your public QR feedback form."
        state={state}
      />
      <FormField
        label="Brand primary colour (hex)"
        name="primaryColor"
        defaultValue={initial.primaryColor ?? ""}
        placeholder="#65a30d"
        hint="Leave blank to use QR Feed's default indigo accent."
        state={state}
      />
      <FormField
        label="Custom domain / subdomain"
        name="customDomain"
        defaultValue={initial.customDomain ?? ""}
        placeholder="feedback.yourhotel.com"
        hint="Point a CNAME record to your QR Feed deployment."
        state={state}
      />
      <FormField
        label="Email sender domain"
        name="emailSenderDomain"
        defaultValue={initial.emailSenderDomain ?? ""}
        placeholder="notifications.yourhotel.com"
        state={state}
      />
      <FormTextarea
        label="Public form disclaimer (optional)"
        name="publicDisclaimer"
        defaultValue={initial.publicDisclaimer ?? ""}
        placeholder="Please avoid sharing sensitive personal or medical identifiers."
        rows={3}
        state={state}
      />
      <FormMessage state={state} success="Branding updated." />
      <SubmitButton size="lg">Save branding</SubmitButton>
    </form>
  )
}

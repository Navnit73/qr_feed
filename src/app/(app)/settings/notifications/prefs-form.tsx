"use client"

import { useActionState } from "react"
import { FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { savePrefsAction } from "./actions"

export function NotificationPrefsForm({
  prefs,
  timeZones,
}: {
  prefs: {
    channels: { in_app: boolean; email: boolean; sms: boolean; whatsapp: boolean; push: boolean }
    events: {
      assigned: boolean
      newTicket: boolean
      escalated: boolean
      verification: boolean
      capaDue: boolean
      digest: boolean
    }
    digestMode: "instant" | "daily" | "weekly"
    quietHours: { enabled: boolean; start: string; end: string; timezone: string }
  }
  timeZones: string[]
}) {
  const [state, action] = useActionState(savePrefsAction, null)

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Channels</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["ch_in_app", "In-app notification bell", prefs.channels.in_app],
            ["ch_email", "Email notifications", prefs.channels.email],
            ["ch_sms", "SMS alerts (escalations)", prefs.channels.sms],
            ["ch_whatsapp", "WhatsApp alerts", prefs.channels.whatsapp],
            ["ch_push", "Browser push alerts", prefs.channels.push],
          ].map(([name, label, checked]) => (
            <label
              key={String(name)}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 text-sm"
            >
              <input
                type="checkbox"
                name={String(name)}
                defaultChecked={Boolean(checked)}
                className="size-4 accent-(--primary)"
              />
              <span>{String(label)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Events</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["ev_assigned", "My tickets: assigned, remarks & closed", prefs.events.assigned],
            ["ev_newTicket", "New unassigned tickets in my branches", prefs.events.newTicket],
            ["ev_escalated", "SLA warnings & escalations", prefs.events.escalated],
            ["ev_verification", "Submitted for verification / reopened", prefs.events.verification],
            ["ev_capaDue", "CAPA action reminders", prefs.events.capaDue],
            ["ev_digest", "Scheduled summary digests", prefs.events.digest],
          ].map(([name, label, checked]) => (
            <label
              key={String(name)}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 text-sm"
            >
              <input
                type="checkbox"
                name={String(name)}
                defaultChecked={Boolean(checked)}
                className="size-4 accent-(--primary)"
              />
              <span>{String(label)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <FormSelect
        label="Delivery cadence"
        name="digestMode"
        defaultValue={prefs.digestMode}
        options={[
          { value: "instant", label: "Instant alerts as events happen" },
          { value: "daily", label: "Daily batched digest (except L2/L3 escalations)" },
          { value: "weekly", label: "Weekly batched digest" },
        ]}
        state={state}
      />

      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="qh_enabled"
            defaultChecked={prefs.quietHours.enabled}
            className="size-4 accent-(--primary)"
          />
          <span>Enable quiet hours</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            label="Start"
            name="qh_start"
            type="time"
            defaultValue={prefs.quietHours.start}
            state={state}
          />
          <FormField
            label="End"
            name="qh_end"
            type="time"
            defaultValue={prefs.quietHours.end}
            state={state}
          />
          <FormSelect
            label="Time zone"
            name="qh_timezone"
            defaultValue={prefs.quietHours.timezone}
            options={timeZones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
            state={state}
          />
        </div>
      </div>

      <FormMessage state={state} success="Notification preferences saved." />
      <SubmitButton size="lg">Save preferences</SubmitButton>
    </form>
  )
}

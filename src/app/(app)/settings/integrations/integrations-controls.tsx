"use client"

import { useActionState, useState, useTransition } from "react"
import { CopyButton } from "@/components/copy-button"
import { CheckboxGroup, FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  createApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  pingWebhookAction,
  revokeApiKeyAction,
  saveIntegrationsSettingsAction,
} from "./actions"

export function CreateApiKeyDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Create API key"
      description="Use as `Authorization: Bearer qrf_…` against `/api/v1/tickets` and `/api/v1/locations`."
      trigger={
        <Button size="lg">
          <Icon name="apiKey" data-icon="inline-start" /> New API key
        </Button>
      }
    >
      {open && <ApiKeyForm onDone={() => setOpen(false)} />}
    </Modal>
  )
}

function ApiKeyForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(createApiKeyAction, null)
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Copy this key now. We store only its SHA-256 hash and cannot show it again.
        </p>
        <div className="flex gap-2">
          <Input
            readOnly
            aria-label="Generated API key"
            value={state.data.rawKey}
            className="h-11 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton text={state.data.rawKey} label="Copy" />
        </div>
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    )
  }
  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Key name"
        name="name"
        placeholder="e.g. PowerBI Connector"
        required
        state={state}
      />
      <CheckboxGroup
        legend="Scopes"
        name="scopes"
        defaultValue={["ticket:read", "location:read"]}
        options={[
          { value: "ticket:read", label: "ticket:read" },
          { value: "ticket:create", label: "ticket:create" },
          { value: "location:read", label: "location:read" },
          { value: "report:read", label: "report:read" },
        ]}
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Generate key</SubmitButton>
      </div>
    </form>
  )
}

export function RevokeKeyButton({ id }: { id: string }) {
  const swal = useSweetAlert()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        swal.fire({
          tone: "warning",
          title: "Revoke this API key?",
          text: "Any integration using this key will lose access immediately.",
          confirmText: "Revoke",
          cancelText: "Keep it",
          confirmVariant: "destructive",
          onConfirm: async () => {
            const res = await revokeApiKeyAction(id)
            if (res && !res.ok) throw new Error(res.error.message)
          },
        })
      }
    >
      Revoke
    </Button>
  )
}

export function CreateWebhookDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Add webhook endpoint"
      description="Signed with HMAC-SHA256 in the `X-QRFeed-Signature` header."
      trigger={
        <Button size="lg" variant="outline">
          <Icon name="webhook" data-icon="inline-start" /> Add webhook
        </Button>
      }
    >
      {open && <WebhookForm onDone={() => setOpen(false)} />}
    </Modal>
  )
}

function WebhookForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(createWebhookAction, null)
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Signing secret (shown once):</p>
        <div className="flex gap-2">
          <Input
            readOnly
            aria-label="Webhook signing secret"
            value={state.data.secret}
            className="h-11 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton text={state.data.secret} label="Copy" />
        </div>
        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    )
  }
  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Name"
        name="name"
        placeholder="Zapier / Ops bridge"
        required
        state={state}
      />
      <FormField
        label="Endpoint URL"
        name="url"
        type="url"
        placeholder="https://hooks.example.com/qrfeed"
        required
        state={state}
      />
      <CheckboxGroup
        legend="Events"
        name="events"
        defaultValue={["ticket.created", "sla.escalated"]}
        options={[
          { value: "ticket.created", label: "ticket.created" },
          { value: "ticket.closed", label: "ticket.closed" },
          { value: "sla.escalated", label: "sla.escalated" },
          { value: "rca.approved", label: "rca.approved" },
        ]}
        state={state}
      />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Add webhook</SubmitButton>
      </div>
    </form>
  )
}

export function WebhookRowActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  const [resMsg, setResMsg] = useState<{ text: string; isError: boolean } | null>(null)
  const swal = useSweetAlert()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() => {
          setResMsg(null)
          startTransition(async () => {
            const r = await pingWebhookAction(id)
            if (r?.ok) {
              setResMsg({
                text: r.data.ok ? `HTTP ${r.data.statusCode}` : `Failed (${r.data.statusCode})`,
                isError: !r.data.ok,
              })
            } else if (r) {
              setResMsg({ text: r.error.message, isError: true })
            }
          })
        }}
      >
        Test ping
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          swal.fire({
            tone: "warning",
            title: "Delete this webhook?",
            text: "Events will no longer be delivered to this endpoint.",
            confirmText: "Delete",
            cancelText: "Keep it",
            confirmVariant: "destructive",
            onConfirm: async () => {
              const r = await deleteWebhookAction(id)
              if (r && !r.ok) throw new Error(r.error.message)
            },
          })
        }
      >
        Delete
      </Button>
      {resMsg && (
        <span
          className={resMsg.isError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {resMsg.text}
        </span>
      )}
    </div>
  )
}

export function ConnectorsAndSsoForm({
  settings,
}: {
  settings: {
    slackWebhookUrl?: string
    teamsWebhookUrl?: string
    whatsappEnabled?: boolean
    sso?: {
      enabled: boolean
      provider: "oidc" | "saml"
      issuerUrl?: string
      clientId?: string
      domain?: string
    }
  }
}) {
  const [state, action] = useActionState(saveIntegrationsSettingsAction, null)
  return (
    <form action={action} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Slack Incoming Webhook URL"
          name="slackWebhookUrl"
          type="url"
          defaultValue={settings.slackWebhookUrl ?? ""}
          placeholder="https://hooks.slack.com/services/…"
          state={state}
        />
        <FormField
          label="Microsoft Teams Webhook URL"
          name="teamsWebhookUrl"
          type="url"
          defaultValue={settings.teamsWebhookUrl ?? ""}
          placeholder="https://outlook.office.com/webhook/…"
          state={state}
        />
      </div>
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="whatsappEnabled"
          defaultChecked={Boolean(settings.whatsappEnabled)}
          className="size-4 accent-(--primary)"
        />
        <span>Enable WhatsApp escalation alerts (via Twilio/Gupshup credentials)</span>
      </label>

      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="ssoEnabled"
            defaultChecked={Boolean(settings.sso?.enabled)}
            className="size-4 accent-(--primary)"
          />
          <span>Enterprise SSO (OIDC / SAML 2.0)</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect
            label="Protocol"
            name="ssoProvider"
            defaultValue={settings.sso?.provider ?? "oidc"}
            options={[
              { value: "oidc", label: "OpenID Connect (Okta, Entra ID, Google)" },
              { value: "saml", label: "SAML 2.0" },
            ]}
            state={state}
          />
          <FormField
            label="Verified email domain"
            name="ssoDomain"
            defaultValue={settings.sso?.domain ?? ""}
            placeholder="hospital.org"
            state={state}
          />
          <FormField
            label="Issuer / Metadata URL"
            name="ssoIssuerUrl"
            defaultValue={settings.sso?.issuerUrl ?? ""}
            placeholder="https://idp.example.com/.well-known/openid-configuration"
            state={state}
          />
          <FormField
            label="Client ID / Entity ID"
            name="ssoClientId"
            defaultValue={settings.sso?.clientId ?? ""}
            state={state}
          />
        </div>
      </div>

      <FormMessage state={state} success="Integrations & SSO saved." />
      <SubmitButton size="lg">Save connectors</SubmitButton>
    </form>
  )
}

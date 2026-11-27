import "server-only"
import { env } from "@/server/env"

export type Mail = {
  to: string
  subject: string
  text: string
  html?: string
  from?: string
  replyTo?: string
  /** Resend de-duplicates retries with the same key for 24h, so a retried job can't double-send. */
  idempotencyKey?: string
}
export type SmsMessage = { to: string; body: string; channel?: "sms" | "whatsapp" }
export type MailConfig = { apiKey?: string; from?: string }
export type MailResult = { delivered: boolean; provider: string; id?: string }

const DEFAULT_FROM = "QR Feed <notifications@qrfeed.local>"

// Vitest has no inbox; tests read what would have been sent from here.
const outbox: Mail[] = []

/** Test helper: returns and clears the mail captured while no Resend key is configured. */
export function takeTestOutbox(): Mail[] {
  return outbox.splice(0, outbox.length)
}

function mailConfigFromEnv(): MailConfig {
  try {
    const e = env()
    return { apiKey: e.RESEND_API_KEY, from: e.MAIL_FROM }
  } catch {
    // Allow tests without full env
    return {}
  }
}

/**
 * Transactional email via the Resend HTTP API (`RESEND_API_KEY`, `MAIL_FROM` with a domain
 * verified in Resend). Without a key it logs to the console in dev, so flows work zero-config,
 * and is suppressed in production. Never throws: callers fire-and-forget notifications.
 */
export async function sendMail(
  mail: Mail,
  config: MailConfig = mailConfigFromEnv(),
): Promise<MailResult> {
  if (config.apiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...(mail.idempotencyKey ? { "Idempotency-Key": mail.idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify({
          from: mail.from ?? config.from ?? DEFAULT_FROM,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          ...(mail.html ? { html: mail.html } : {}),
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        // e.g. 403 "domain not verified", 422 bad from-address, 429 rate limit.
        const detail = (await res.text().catch(() => "")).slice(0, 300)
        console.error(`[mail] Resend rejected "${mail.subject}" (${res.status}): ${detail}`)
        return { delivered: false, provider: "resend" }
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string }
      return { delivered: true, provider: "resend", ...(body.id ? { id: body.id } : {}) }
    } catch (err) {
      console.error(`[mail] Resend request failed for "${mail.subject}": ${String(err)}`)
      return { delivered: false, provider: "resend" }
    }
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(`[mail] RESEND_API_KEY not configured; suppressed email to=${mail.to}`)
    return { delivered: false, provider: "unconfigured" }
  }
  if (process.env.VITEST) {
    outbox.push(mail)
  } else if (process.env.NODE_ENV !== "test") {
    console.info(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`)
  }
  return { delivered: true, provider: "console" }
}

/**
 * SMS / WhatsApp delivery via Twilio REST API when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are set;
 * logs cleanly in dev/test when unconfigured.
 */
export async function sendSms(msg: SmsMessage): Promise<{ delivered: boolean; provider: string }> {
  let sid: string | undefined
  let token: string | undefined
  let from: string | undefined
  try {
    const e = env()
    sid = e.TWILIO_ACCOUNT_SID
    token = e.TWILIO_AUTH_TOKEN
    from = msg.channel === "whatsapp" ? e.TWILIO_WHATSAPP_FROM : e.TWILIO_FROM
  } catch {
    // Allow tests without full env
  }

  if (sid && token && from) {
    const to =
      msg.channel === "whatsapp" && !msg.to.startsWith("whatsapp:") ? `whatsapp:${msg.to}` : msg.to
    const fromAddr =
      msg.channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from
    try {
      const body = new URLSearchParams({ To: to, From: fromAddr, Body: msg.body })
      const auth = Buffer.from(`${sid}:${token}`).toString("base64")
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      return { delivered: res.ok, provider: "twilio" }
    } catch {
      return { delivered: false, provider: "twilio" }
    }
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(`[${msg.channel ?? "sms"}] Twilio not configured; suppressed message to=${msg.to}`)
    return { delivered: false, provider: "unconfigured" }
  }
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    console.info(`[${msg.channel ?? "sms"}] to=${msg.to} body="${msg.body}"`)
  }
  return { delivered: true, provider: "console" }
}

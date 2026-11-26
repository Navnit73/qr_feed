import "server-only"
import { env } from "@/server/env"

export type Mail = { to: string; subject: string; text: string; html?: string; from?: string }
export type SmsMessage = { to: string; body: string; channel?: "sms" | "whatsapp" }

/**
 * Transactional email delivery. Uses Resend HTTP API when RESEND_API_KEY is configured;
 * otherwise logs to console in non-production/local environments so flows work zero-config.
 */
export async function sendMail(mail: Mail): Promise<{ delivered: boolean; provider: string }> {
  let apiKey: string | undefined
  let defaultFrom = "QR Feed <notifications@qrfeed.local>"
  try {
    const e = env()
    apiKey = e.RESEND_API_KEY
    defaultFrom = e.MAIL_FROM
  } catch {
    // Allow tests without full env
  }

  if (apiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: mail.from ?? defaultFrom,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          ...(mail.html ? { html: mail.html } : {}),
        }),
      })
      return { delivered: res.ok, provider: "resend" }
    } catch {
      return { delivered: false, provider: "resend" }
    }
  }

  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
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
      })
      return { delivered: res.ok, provider: "twilio" }
    } catch {
      return { delivered: false, provider: "twilio" }
    }
  }

  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    console.info(`[${msg.channel ?? "sms"}] to=${msg.to} body="${msg.body}"`)
  }
  return { delivered: true, provider: "console" }
}

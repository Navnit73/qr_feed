import "server-only"
import type { ObjectId } from "mongodb"
import { parseInput } from "@/lib/api/validation"
import type { TenantContext } from "@/server/db/tenant-context"
import { sendMail, sendSms } from "@/server/mail"
import { appBaseUrl } from "@/server/public-url"
import {
  members,
  notificationPreferences,
  notifications,
  type NotificationChannel,
  type NotificationPrefDoc,
} from "@/server/repositories"
import { objectId } from "@/server/validation"

function eventKeyFor(type: string): keyof NotificationPrefDoc["events"] | null {
  if (type === "ticket.assigned" || type === "ticket.reassigned") return "assigned"
  if (type.startsWith("sla.")) return "escalated"
  if (type === "ticket.submitted" || type === "ticket.reopened") return "verification"
  if (type.startsWith("capa.")) return "capaDue"
  if (type === "report.digest") return "digest"
  return null
}

function isInQuietHours(quiet: NotificationPrefDoc["quietHours"], now: Date): boolean {
  if (!quiet?.enabled) return false
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: quiet.timezone || "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    )
    const cur = (Number(parts.hour) % 24) * 60 + Number(parts.minute)
    const [sh, sm] = quiet.start.split(":").map(Number)
    const [eh, em] = quiet.end.split(":").map(Number)
    const start = sh * 60 + sm
    const end = eh * 60 + em
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false
    return start <= end ? cur >= start && cur < end : cur >= start || cur < end
  } catch {
    return false
  }
}

function absoluteHref(href?: string): string | undefined {
  if (!href) return undefined
  if (href.startsWith("http://") || href.startsWith("https://")) return href
  try {
    return `${appBaseUrl()}${href.startsWith("/") ? href : `/${href}`}`
  } catch {
    return href
  }
}

export async function notifyUser(
  ctx: TenantContext,
  input: {
    userId: string
    type: string
    title: string
    body: string
    href?: string
    channels?: NotificationChannel[]
    meta?: Record<string, unknown>
  },
) {
  const now = new Date()
  const requestedChannels = input.channels ?? ["in_app", "email"]
  const sysCtx: TenantContext = { ...ctx, branchScope: "all" }

  const prefs = await notificationPreferences.forTenant(sysCtx).findOne({ userId: input.userId })
  const evKey = eventKeyFor(input.type)
  if (prefs && evKey && prefs.events[evKey] === false) {
    return
  }

  const quiet = prefs ? isInQuietHours(prefs.quietHours, now) : false
  const channels = requestedChannels.filter((ch) => {
    if (prefs && prefs.channels[ch] === false) return false
    // Suppress external email/SMS/push noise during user's configured quiet hours.
    if (quiet && ch !== "in_app") return false
    return true
  })

  if (channels.includes("in_app")) {
    await notifications.forTenant(sysCtx).insertOne({
      userId: input.userId,
      channel: "in_app",
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.href ? { href: input.href } : {}),
      readAt: null,
      sentAt: now,
      status: "sent",
      ...(input.meta ? { meta: input.meta } : {}),
    })
  }

  if (channels.includes("email") || channels.includes("sms") || channels.includes("whatsapp")) {
    const member = await members
      .forTenant(sysCtx)
      .findOne({ userId: input.userId, status: "active" }, { projection: { email: 1, phone: 1 } })
    if (member) {
      const link = absoluteHref(input.href)
      const tasks: Promise<unknown>[] = []
      if (channels.includes("email") && member.email) {
        tasks.push(
          sendMail({
            to: member.email,
            subject: input.title,
            text: `${input.body}${link ? `\n\nOpen: ${link}` : ""}`,
          }).catch(() => {}),
        )
      }
      if (channels.includes("sms") && member.phone) {
        tasks.push(
          sendSms({
            to: member.phone,
            body: `${input.title}: ${input.body}${link ? ` ${link}` : ""}`.slice(0, 320),
            channel: "sms",
          }).catch(() => {}),
        )
      }
      if (channels.includes("whatsapp") && member.phone) {
        tasks.push(
          sendSms({
            to: member.phone,
            body: `${input.title}\n${input.body}${link ? `\n${link}` : ""}`.slice(0, 500),
            channel: "whatsapp",
          }).catch(() => {}),
        )
      }
      if (tasks.length) await Promise.all(tasks)
    }
  }
}

export async function notifyReporterClosure(input: {
  tenantName: string
  ticketNumber: string
  locationName: string
  categoryName: string
  resolutionNote?: string
  email?: string
  phone?: string
}) {
  const summary = input.resolutionNote ? ` Resolution: ${input.resolutionNote.slice(0, 240)}` : ""
  const msg = `Your ticket ${input.ticketNumber} (${input.categoryName} at ${input.locationName}, ${input.tenantName}) has been resolved and closed.${summary} Use your original tracking link to rate the resolution.`
  const tasks: Promise<unknown>[] = []
  if (input.email) {
    tasks.push(
      sendMail({
        to: input.email,
        subject: `${input.ticketNumber} · Resolved (${input.tenantName})`,
        text: msg,
      }).catch(() => {}),
    )
  }
  if (input.phone) {
    tasks.push(
      sendSms({
        to: input.phone,
        body: msg.slice(0, 320),
        channel: "sms",
      }).catch(() => {}),
    )
  }
  if (tasks.length) await Promise.all(tasks)
}

export async function notifyReporterConfirmation(input: {
  tenantName: string
  ticketNumber: string
  trackingUrl: string
  locationName: string
  categoryName: string
  email?: string
  phone?: string
  duplicate?: boolean
}) {
  const intro = input.duplicate
    ? `Your report was added to open ticket ${input.ticketNumber} at ${input.tenantName}.`
    : `Thanks for reporting ${input.categoryName} at ${input.locationName} (${input.tenantName}). Your ticket number is ${input.ticketNumber}.`

  const tasks: Promise<unknown>[] = []
  if (input.email) {
    tasks.push(
      sendMail({
        to: input.email,
        subject: `${input.ticketNumber} · Report received (${input.tenantName})`,
        text: `${intro}\n\nTrack live progress here:\n${input.trackingUrl}`,
      }).catch(() => {}),
    )
  }
  if (input.phone) {
    tasks.push(
      sendSms({
        to: input.phone,
        body: `${intro} Track: ${input.trackingUrl}`,
        channel: "sms",
      }).catch(() => {}),
    )
  }
  await Promise.all(tasks)
}

export async function listNotifications(ctx: TenantContext, limit = 30) {
  return notifications
    .forTenant({ ...ctx, branchScope: "all" })
    .find({ userId: ctx.actorId, channel: "in_app" }, { sort: { createdAt: -1 }, limit })
}

export async function unreadNotificationCount(ctx: TenantContext) {
  return notifications
    .forTenant({ ...ctx, branchScope: "all" })
    .count({ userId: ctx.actorId, channel: "in_app", readAt: null })
}

export async function markNotificationRead(ctx: TenantContext, idRaw: ObjectId | string) {
  const id = parseInput(objectId, idRaw)
  await notifications
    .forTenant({ ...ctx, branchScope: "all" })
    .updateOne({ _id: id, userId: ctx.actorId }, { $set: { readAt: new Date() } })
}

export async function markAllRead(ctx: TenantContext) {
  await notifications
    .forTenant({ ...ctx, branchScope: "all" })
    .updateMany(
      { userId: ctx.actorId, channel: "in_app", readAt: null },
      { $set: { readAt: new Date() } },
    )
}

import "server-only"
import type { ObjectId } from "mongodb"
import { parseInput } from "@/lib/api/validation"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { renderEmail } from "@/server/email-template"
import { sendMail, sendSms } from "@/server/mail"
import { getTenant } from "@/server/modules/tenants"
import { resolveAccess } from "@/server/rbac/ability"
import type { Permission } from "@/server/rbac/permissions"
import { appUrl } from "@/server/public-url"
import {
  members,
  roles as rolesRepo,
  notificationPreferences,
  notifications,
  type NotificationChannel,
  type NotificationPrefDoc,
} from "@/server/repositories"
import { objectId } from "@/server/validation"

function eventKeyFor(type: string): keyof NotificationPrefDoc["events"] | null {
  if (
    type === "ticket.assigned" ||
    type === "ticket.reassigned" ||
    type === "ticket.closed" ||
    type === "comment.added"
  )
    return "assigned"
  if (type === "ticket.created") return "newTicket"
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
  return appUrl(href)
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
    /** Extra rows for the email, e.g. [["Priority", "High"]]. */
    details?: [string, string][]
    /** Button text for `href` in the email. Defaults to "Open in QR Feed". */
    cta?: string
    /** Account/security mail (access changes) ignores preferences and quiet hours. */
    essential?: boolean
  },
) {
  const now = new Date()
  const requestedChannels = input.channels ?? ["in_app", "email"]
  const sysCtx: TenantContext = { ...ctx, branchScope: "all" }

  const prefs = input.essential
    ? null
    : await notificationPreferences.forTenant(sysCtx).findOne({ userId: input.userId })
  const evKey = eventKeyFor(input.type)
  // `=== false`: older preference docs predate some keys (newTicket), which then default on.
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
        const tenant = await getTenant(ctx.tenantId)
        const { html, text } = renderEmail({
          brand: tenant?.name,
          preheader: input.body.slice(0, 120),
          heading: input.title,
          intro: input.body,
          details: input.details,
          cta: link ? { label: input.cta ?? "Open in QR Feed", url: link } : undefined,
          footnote: input.essential
            ? "This is an account notice, sent whatever your alert settings are."
            : `You get this because of your alert settings. Change them at ${absoluteHref("/settings/notifications")}.`,
        })
        tasks.push(sendMail({ to: member.email, subject: input.title, text, html }).catch(() => {}))
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

/**
 * Active members who hold any of `permissions` for `branchId` (respecting branch scope),
 * minus `exclude`. Used to tell the right people about a branch's tickets.
 */
export async function membersWhoCan(
  ctx: TenantContext,
  permissions: Permission[],
  branchId: ObjectId,
  { exclude, limit = 5 }: { exclude?: string; limit?: number } = {},
) {
  const sys: TenantContext = { ...ctx, branchScope: "all" }
  const [active, customRoles] = await Promise.all([
    members.forTenant(sys).find({ status: "active" }),
    rolesRepo.forTenant(sys).find({}),
  ])
  return active
    .filter((m) => {
      if (m.userId === exclude) return false
      const access = resolveAccess(m, customRoles)
      return (
        permissions.some((p) => access.permissions.has(p)) &&
        inBranchScope(access.branchScope, branchId)
      )
    })
    .slice(0, limit)
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
        ...renderEmail({
          brand: input.tenantName,
          preheader: `Your report ${input.ticketNumber} has been resolved.`,
          heading: `${input.ticketNumber} is resolved`,
          intro: [
            `Thanks for reporting ${input.categoryName} at ${input.locationName}. The team has resolved and closed it.`,
            ...(input.resolutionNote ? [`Resolution: ${input.resolutionNote.slice(0, 400)}`] : []),
            "Use your original tracking link to tell us whether it was fixed and rate the service.",
          ],
          details: [
            ["Ticket", input.ticketNumber],
            ["Location", input.locationName],
            ["Issue", input.categoryName],
          ],
        }),
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
        ...renderEmail({
          brand: input.tenantName,
          preheader: intro,
          heading: input.duplicate ? "Added to an open report" : "We've received your report",
          intro,
          details: [
            ["Ticket", input.ticketNumber],
            ["Location", input.locationName],
            ["Issue", input.categoryName],
          ],
          cta: { label: "Track progress", url: input.trackingUrl },
          footnote: "Keep this email: the link is private to you and shows live progress.",
        }),
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

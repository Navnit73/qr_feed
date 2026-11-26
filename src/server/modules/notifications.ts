import "server-only"
import type { ObjectId } from "mongodb"
import { parseInput } from "@/lib/api/validation"
import type { TenantContext } from "@/server/db/tenant-context"
import { sendMail, sendSms } from "@/server/mail"
import { members, notifications, type NotificationChannel } from "@/server/repositories"
import { objectId } from "@/server/validation"

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
  const channels = input.channels ?? ["in_app", "email"]
  const sysCtx: TenantContext = { ...ctx, branchScope: "all" }

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
      .findOne({ userId: input.userId, status: "active" })
    if (member && channels.includes("email") && member.email) {
      await sendMail({
        to: member.email,
        subject: input.title,
        text: `${input.body}${input.href ? `\n\nOpen: ${input.href}` : ""}`,
      }).catch(() => {})
    }
  }
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

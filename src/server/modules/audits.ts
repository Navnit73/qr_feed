import "server-only"
import { randomUUID } from "node:crypto"
import type { ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import { nextSequence } from "@/server/db/counters"
import type { TenantContext } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { dispatchWebhookEvent } from "@/server/modules/platform"
import { createRcaInSession } from "@/server/modules/rca-capa"
import { tenantsCollection } from "@/server/modules/tenants"
import { assertCan } from "@/server/rbac/ability"
import {
  auditFindings,
  audits,
  auditTemplates,
  branches,
  members,
  type AuditChecklistResult,
} from "@/server/repositories"
import { name, objectId } from "@/server/validation"

const templateSchema = z.object({
  name: name("template name", 3),
  standard: z.string().trim().min(2, "Enter a standard (e.g. ISO 9001, NABH)").max(80),
  description: z.string().trim().max(400).optional(),
  items: z
    .array(
      z.object({
        clause: z.string().trim().min(1).max(30),
        section: z.string().trim().min(1).max(80),
        question: z.string().trim().min(3).max(400),
      }),
    )
    .min(1, "Add at least one checklist question"),
})

const scheduleSchema = z.object({
  branchId: objectId,
  templateId: objectId,
  title: name("audit title", 3),
  recurrence: z.enum(["once", "weekly", "monthly", "quarterly"]).default("once"),
  scheduledAt: z
    .string()
    .min(1, "Pick a date")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid schedule date"),
  auditorId: z.string().trim().optional(),
})

function nextRecurrenceDate(from: Date, recurrence: "weekly" | "monthly" | "quarterly"): Date {
  const next = new Date(from.getTime())
  if (recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7)
  else if (recurrence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1)
  else next.setUTCMonth(next.getUTCMonth() + 3)
  return next
}

const checklistSaveSchema = z.object({
  results: z.array(
    z.object({
      itemId: z.string().min(1),
      result: z.enum(["pending", "pass", "fail", "na"]),
      note: z.string().trim().max(1000).optional(),
      evidence: z.array(z.string()).max(5).default([]),
    }),
  ),
})

const findingSchema = z.object({
  severity: z.enum(["observation", "minor", "major", "critical"]),
  clause: z.string().trim().min(1, "Enter the clause reference").max(40),
  description: z.string().trim().min(5, "Describe the non-conformity or observation").max(2000),
  evidence: z.array(z.string()).max(5).default([]),
})

function computeScore(items: AuditChecklistResult[]): number | null {
  const scored = items.filter((i) => i.result === "pass" || i.result === "fail")
  if (scored.length === 0) return null
  const passed = scored.filter((i) => i.result === "pass").length
  return Math.round((passed / scored.length) * 100)
}

export async function listAuditTemplates(ctx: TenantContext) {
  assertCan(ctx, "audit:read")
  return auditTemplates.forTenant(ctx).find({}, { sort: { name: 1 } })
}

export async function createAuditTemplate(ctx: TenantContext, raw: z.input<typeof templateSchema>) {
  assertCan(ctx, "audit:run")
  const input = parseInput(templateSchema, raw)
  return withTransaction(async (session) => {
    const doc = await auditTemplates.forTenant(ctx).insertOne(
      {
        name: input.name,
        standard: input.standard,
        ...(input.description ? { description: input.description } : {}),
        items: input.items.map((i) => ({ id: randomUUID(), ...i })),
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "audit_template.created",
        entity: "auditTemplate",
        entityId: doc._id,
        after: { name: doc.name, standard: doc.standard, questions: doc.items.length },
      },
      { session },
    )
    return doc
  })
}

export async function deleteAuditTemplate(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "audit:run")
  const id = parseInput(objectId, idRaw)
  await withTransaction(async (session) => {
    const ok = await auditTemplates.forTenant(ctx).deleteOne({ _id: id }, { session })
    if (!ok) throw new ApiError("NOT_FOUND", "Audit template not found.")
    await appendAudit(
      ctx,
      { action: "audit_template.deleted", entity: "auditTemplate", entityId: id },
      { session },
    )
  })
}

export async function listAudits(ctx: TenantContext) {
  assertCan(ctx, "audit:read")
  const [auditList, templateList, findingList] = await Promise.all([
    audits.forTenant(ctx).find({}, { sort: { scheduledAt: -1 }, limit: 100 }),
    auditTemplates.forTenant(ctx).find({}, { sort: { name: 1 } }),
    auditFindings.forTenant(ctx).find({}, { sort: { createdAt: -1 }, limit: 200 }),
  ])
  return { audits: auditList, templates: templateList, findings: findingList }
}

export async function getAuditDetail(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "audit:read")
  const id = parseInput(objectId, idRaw)
  const audit = await audits.forTenant(ctx).findById(id)
  if (!audit) throw new ApiError("NOT_FOUND", "Audit not found.")
  const [branch, findings] = await Promise.all([
    branches.forTenant(ctx).findById(audit.branchId),
    auditFindings.forTenant(ctx).find({ auditId: audit._id }, { sort: { createdAt: 1 } }),
  ])
  return { audit, branch, findings }
}

export async function scheduleAudit(ctx: TenantContext, raw: z.input<typeof scheduleSchema>) {
  assertCan(ctx, "audit:run")
  const input = parseInput(scheduleSchema, raw)
  assertCan(ctx, "audit:run", { branchId: input.branchId })

  const targetAuditorId = input.auditorId || ctx.actorId
  const [branch, tpl, member] = await Promise.all([
    branches.forTenant(ctx).findById(input.branchId),
    auditTemplates.forTenant(ctx).findById(input.templateId),
    members
      .forTenant({ ...ctx, branchScope: "all" })
      .findOne({ userId: targetAuditorId, status: "active" }),
  ])
  if (!branch || branch.status !== "active") throw new ApiError("NOT_FOUND", "Branch not found.")
  if (!tpl) throw new ApiError("NOT_FOUND", "Audit template not found.")

  return withTransaction(async (session) => {
    const now = new Date()
    const year = now.getUTCFullYear()
    const seq = await nextSequence(`${ctx.tenantId.toHexString()}:audits:${year}`, session)
    const number = `AUD-${year}-${String(seq).padStart(6, "0")}`

    const doc = await audits.forTenant(ctx).insertOne(
      {
        branchId: branch._id,
        number,
        title: input.title,
        templateId: tpl._id,
        templateName: tpl.name,
        auditorId: member?.userId ?? ctx.actorId,
        auditorName: member?.name ?? "Auditor",
        recurrence: input.recurrence,
        scheduledAt: new Date(input.scheduledAt),
        completedAt: null,
        status: "scheduled",
        checklistResults: tpl.items.map((item) => ({
          itemId: item.id,
          clause: item.clause,
          section: item.section,
          question: item.question,
          result: "pending",
          evidence: [],
        })),
        scorePct: null,
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "audit.scheduled",
        entity: "audit",
        entityId: doc._id,
        after: { number, title: doc.title, recurrence: doc.recurrence },
      },
      { session },
    )
    return doc
  })
}

export async function saveAuditChecklist(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof checklistSaveSchema>,
) {
  assertCan(ctx, "audit:run")
  const id = parseInput(objectId, idRaw)
  const input = parseInput(checklistSaveSchema, raw)
  const patchMap = new Map(input.results.map((r) => [r.itemId, r]))

  return withTransaction(async (session) => {
    const audit = await audits.forTenant(ctx).findById(id, { session })
    if (!audit) throw new ApiError("NOT_FOUND", "Audit not found.")
    assertCan(ctx, "audit:run", { branchId: audit.branchId })
    if (audit.status === "completed") {
      throw new ApiError("CONFLICT", "Completed audits can no longer be modified.")
    }

    const merged: AuditChecklistResult[] = audit.checklistResults.map((row) => {
      const p = patchMap.get(row.itemId)
      if (!p) return row
      return {
        ...row,
        result: p.result,
        ...(p.note !== undefined ? { note: p.note } : {}),
        evidence: p.evidence.length > 0 ? p.evidence : row.evidence,
      }
    })

    const scorePct = computeScore(merged)
    const nextStatus = audit.status === "scheduled" ? "in_progress" : audit.status

    const updated = await audits
      .forTenant(ctx)
      .updateOne(
        { _id: audit._id, status: { $ne: "completed" } },
        { $set: { checklistResults: merged, scorePct, status: nextStatus } },
        { session },
      )
    if (!updated) throw new ApiError("CONFLICT", "Completed audits can no longer be modified.")
    await appendAudit(
      ctx,
      {
        action: "audit.checklist_saved",
        entity: "audit",
        entityId: audit._id,
        after: { scorePct, status: nextStatus },
      },
      { session },
    )
    return updated
  })
}

export async function completeAudit(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "audit:run")
  const id = parseInput(objectId, idRaw)

  const completed = await withTransaction(async (session) => {
    const audit = await audits.forTenant(ctx).findById(id, { session })
    if (!audit) throw new ApiError("NOT_FOUND", "Audit not found.")
    assertCan(ctx, "audit:run", { branchId: audit.branchId })
    if (audit.status === "completed") {
      throw new ApiError("CONFLICT", "This audit is already completed.")
    }
    const scorePct = computeScore(audit.checklistResults)
    const now = new Date()

    const updated = await audits
      .forTenant(ctx)
      .updateOne(
        { _id: audit._id, status: { $ne: "completed" } },
        { $set: { status: "completed", completedAt: now, scorePct } },
        { session },
      )
    if (!updated) throw new ApiError("CONFLICT", "This audit is already completed.")

    // Auto-schedule next occurrence for recurring audits (phase.md P7).
    if (audit.recurrence !== "once") {
      const nextDate = nextRecurrenceDate(
        audit.scheduledAt > now ? audit.scheduledAt : now,
        audit.recurrence,
      )
      const existingNext = await audits.forTenant(ctx).findOne(
        {
          branchId: audit.branchId,
          templateId: audit.templateId,
          title: audit.title,
          status: "scheduled",
          scheduledAt: { $gte: now },
        },
        { session },
      )
      if (!existingNext) {
        const year = nextDate.getUTCFullYear()
        const seq = await nextSequence(`${ctx.tenantId.toHexString()}:audits:${year}`, session)
        const nextNum = `AUD-${year}-${String(seq).padStart(6, "0")}`
        await audits.forTenant(ctx).insertOne(
          {
            branchId: audit.branchId,
            number: nextNum,
            title: audit.title,
            templateId: audit.templateId,
            templateName: audit.templateName,
            auditorId: audit.auditorId,
            auditorName: audit.auditorName,
            recurrence: audit.recurrence,
            scheduledAt: nextDate,
            completedAt: null,
            status: "scheduled",
            checklistResults: audit.checklistResults.map((row) => ({
              itemId: row.itemId,
              clause: row.clause,
              section: row.section,
              question: row.question,
              result: "pending",
              evidence: [],
            })),
            scorePct: null,
          },
          { session },
        )
      }
    }

    await appendAudit(
      ctx,
      {
        action: "audit.completed",
        entity: "audit",
        entityId: audit._id,
        after: { number: audit.number, scorePct },
      },
      { session },
    )
    return updated
  })

  dispatchWebhookEvent(ctx, "audit.completed", {
    auditId: completed._id.toHexString(),
    number: completed.number,
    title: completed.title,
    scorePct: completed.scorePct ?? null,
    summary: `${completed.number} completed (${completed.scorePct ?? "N/A"}%): ${completed.title}`,
  })
  return completed
}

/** Background sweep ensuring recurring completed audits have a future scheduled run. */
export async function sweepRecurringAudits(now = new Date()): Promise<number> {
  const activeTenantIds = (
    await tenantsCollection()
      .find({ status: "active" }, { projection: { _id: 1 } })
      .toArray()
  ).map((t) => t._id)
  if (activeTenantIds.length === 0) return 0

  const completedRecurring = await audits
    .unscoped()
    .find({
      tenantId: { $in: activeTenantIds },
      status: "completed",
      recurrence: { $in: ["weekly", "monthly", "quarterly"] },
      scheduledAt: { $lte: now },
    })
    .sort({ scheduledAt: -1 })
    .limit(200)
    .toArray()

  let spawned = 0
  const seenSeries = new Set<string>()
  for (const audit of completedRecurring) {
    const key = `${audit.tenantId.toHexString()}:${audit.branchId.toHexString()}:${audit.templateId.toHexString()}:${audit.title}`
    if (seenSeries.has(key)) continue
    seenSeries.add(key)

    const sys: TenantContext = {
      tenantId: audit.tenantId,
      actorId: "system",
      roles: [],
      permissions: new Set(),
      branchScope: "all",
    }
    const existingFuture = await audits.forTenant(sys).findOne({
      branchId: audit.branchId,
      templateId: audit.templateId,
      title: audit.title,
      status: { $in: ["scheduled", "in_progress"] },
    })
    if (existingFuture) continue

    const nextDate = nextRecurrenceDate(
      audit.completedAt ?? audit.scheduledAt,
      audit.recurrence as "weekly" | "monthly" | "quarterly",
    )
    await withTransaction(async (session) => {
      const year = nextDate.getUTCFullYear()
      const seq = await nextSequence(`${audit.tenantId.toHexString()}:audits:${year}`, session)
      await audits.forTenant(sys).insertOne(
        {
          branchId: audit.branchId,
          number: `AUD-${year}-${String(seq).padStart(6, "0")}`,
          title: audit.title,
          templateId: audit.templateId,
          templateName: audit.templateName,
          auditorId: audit.auditorId,
          auditorName: audit.auditorName,
          recurrence: audit.recurrence,
          scheduledAt: nextDate,
          completedAt: null,
          status: "scheduled",
          checklistResults: audit.checklistResults.map((row) => ({
            itemId: row.itemId,
            clause: row.clause,
            section: row.section,
            question: row.question,
            result: "pending",
            evidence: [],
          })),
          scorePct: null,
        },
        { session },
      )
    })
    spawned++
  }
  return spawned
}

export async function createAuditFinding(
  ctx: TenantContext,
  auditIdRaw: ObjectId | string,
  raw: z.input<typeof findingSchema>,
) {
  assertCan(ctx, "audit:run")
  const auditId = parseInput(objectId, auditIdRaw)
  const input = parseInput(findingSchema, raw)

  return withTransaction(async (session) => {
    const audit = await audits.forTenant(ctx).findById(auditId, { session })
    if (!audit) throw new ApiError("NOT_FOUND", "Audit not found.")
    assertCan(ctx, "audit:run", { branchId: audit.branchId })
    if (audit.status === "completed") {
      throw new ApiError("CONFLICT", "Cannot log new findings on a completed audit.")
    }

    const doc = await auditFindings.forTenant(ctx).insertOne(
      {
        branchId: audit.branchId,
        auditId: audit._id,
        auditNumber: audit.number,
        severity: input.severity,
        clause: input.clause,
        description: input.description,
        evidence: input.evidence,
        rcaId: null,
        status: "open",
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "audit_finding.created",
        entity: "auditFinding",
        entityId: doc._id,
        after: { auditNumber: audit.number, severity: doc.severity, clause: doc.clause },
      },
      { session },
    )
    return doc
  })
}

/** Converts an audit finding directly into an RCA/CAPA record atomically inside one transaction. */
export async function convertFindingToRca(ctx: TenantContext, findingIdRaw: ObjectId | string) {
  assertCan(ctx, "rca:manage")
  const findingId = parseInput(objectId, findingIdRaw)

  return withTransaction(async (session) => {
    const finding = await auditFindings.forTenant(ctx).findById(findingId, { session })
    if (!finding) throw new ApiError("NOT_FOUND", "Audit finding not found.")
    assertCan(ctx, "rca:manage", { branchId: finding.branchId })
    if (finding.rcaId) {
      throw new ApiError("CONFLICT", "An RCA has already been created for this finding.")
    }

    const rca = await createRcaInSession(
      ctx,
      {
        title: `NCR ${finding.auditNumber} · Clause ${finding.clause} (${finding.severity})`,
        method: "5why",
        problemStatement: finding.description,
        sourceTicketIds: [],
        sourceAuditFindingId: finding._id,
        branchId: finding.branchId,
      },
      session,
    )

    const linked = await auditFindings
      .forTenant(ctx)
      .updateOne(
        { _id: finding._id, rcaId: null },
        { $set: { rcaId: rca._id, status: "rca_created" } },
        { session },
      )
    if (!linked) {
      throw new ApiError("CONFLICT", "An RCA has already been created for this finding.")
    }

    await appendAudit(
      ctx,
      {
        action: "audit_finding.converted_to_rca",
        entity: "auditFinding",
        entityId: finding._id,
        after: { rcaId: rca._id.toHexString(), rcaNumber: rca.number },
      },
      { session },
    )

    return rca
  })
}

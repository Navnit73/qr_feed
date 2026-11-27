import "server-only"
import { randomUUID } from "node:crypto"
import type { ClientSession, ObjectId } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { appendAudit } from "@/server/audit/audit-log"
import { nextSequence } from "@/server/db/counters"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { notifyUser } from "@/server/modules/notifications"
import { dispatchWebhookEvent } from "@/server/modules/platform"
import { assertCan, can, resolveAccess } from "@/server/rbac/ability"
import {
  capas,
  members,
  rcas,
  roles as rolesRepo,
  ticketActivities,
  tickets,
  type CapaActionItem,
  type Fishbone6M,
  type RcaDoc,
} from "@/server/repositories"
import { name, objectId } from "@/server/validation"

const EMPTY_FISHBONE: Fishbone6M = {
  man: [],
  machine: [],
  method: [],
  material: [],
  measurement: [],
  environment: [],
}

const validDateString = z
  .string()
  .min(1, "Enter a date")
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date")

const capaActionStatusSchema = z.enum(["open", "in_progress", "completed", "verified"])

const createRcaSchema = z.object({
  title: name("RCA title", 3),
  method: z.enum(["5why", "fishbone", "8d"]).default("5why"),
  problemStatement: z.string().trim().min(5, "State the problem clearly").max(2000),
  sourceTicketIds: z.array(objectId).default([]),
  sourceAuditFindingId: objectId.nullish(),
  branchId: objectId.nullish(),
})

const analysisSchema = z.object({
  method: z.enum(["5why", "fishbone", "8d"]).default("5why"),
  problemStatement: z.string().trim().min(5).max(2000),
  whys: z.array(z.string().trim().max(500)).max(10).default([]),
  fishbone: z
    .object({
      man: z.array(z.string().trim()).default([]),
      machine: z.array(z.string().trim()).default([]),
      method: z.array(z.string().trim()).default([]),
      material: z.array(z.string().trim()).default([]),
      measurement: z.array(z.string().trim()).default([]),
      environment: z.array(z.string().trim()).default([]),
    })
    .default(EMPTY_FISHBONE),
  contributingFactors: z.array(z.string().trim()).max(20).default([]),
  rootCause: z.string().trim().max(2000).default(""),
})

const createCapaSchema = z.object({
  rcaId: objectId,
  title: name("CAPA title", 3),
  type: z.enum(["correction", "corrective", "preventive"]).default("corrective"),
  effectivenessDueDays: z.coerce.number().int().min(1).max(365).default(30),
  effectivenessMethod: z.string().trim().min(3).max(500).default("Recurrence check & site audit"),
  actions: z
    .array(
      z.object({
        title: z.string().trim().min(2, "Describe the action").max(300),
        ownerId: z.string().min(1),
        dueDate: validDateString,
      }),
    )
    .min(1, "Add at least one action"),
})

const approvalSchema = z.object({
  stage: z.enum(["owner", "reviewer", "approver"]),
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(1000).optional(),
})

const effectivenessSchema = z.object({
  recurred: z.boolean(),
  result: z.enum(["effective", "ineffective"]),
  evidence: z.string().trim().min(2, "Record verification evidence").max(1500),
})

function assertRcaInScope(ctx: TenantContext, rca: Pick<RcaDoc, "branchId">) {
  if (ctx.branchScope === "all") return
  if (!rca.branchId || !inBranchScope(ctx.branchScope, rca.branchId)) {
    throw new ApiError("NOT_FOUND", "RCA record not found.")
  }
}

async function memberNameOf(ctx: TenantContext, userId: string): Promise<string> {
  const m = await members.forTenant({ ...ctx, branchScope: "all" }).findOne({ userId })
  return m?.name ?? "Staff"
}

export async function listRcas(ctx: TenantContext) {
  assertCan(ctx, "rca:read")
  const rcaFilter = ctx.branchScope === "all" ? {} : { branchId: { $in: ctx.branchScope } }
  const rcaList = await rcas.forTenant(ctx).find(rcaFilter, { sort: { createdAt: -1 }, limit: 100 })
  const capaFilter = ctx.branchScope === "all" ? {} : { rcaId: { $in: rcaList.map((r) => r._id) } }
  const capaList =
    ctx.branchScope !== "all" && rcaList.length === 0
      ? []
      : await capas.forTenant(ctx).find(capaFilter, { sort: { createdAt: -1 }, limit: 200 })
  return { rcas: rcaList, capas: capaList }
}

export async function getRcaDetail(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "rca:read")
  const id = parseInput(objectId, idRaw)
  const rca = await rcas.forTenant(ctx).findById(id)
  if (!rca) throw new ApiError("NOT_FOUND", "RCA record not found.")
  assertRcaInScope(ctx, rca)

  const [capaList, linkedTickets, allActiveMembers, customRoles] = await Promise.all([
    capas.forTenant(ctx).find({ rcaId: rca._id }, { sort: { createdAt: 1 } }),
    rca.sourceTicketIds.length > 0
      ? tickets.forTenant(ctx).find({ _id: { $in: rca.sourceTicketIds } })
      : [],
    members
      .forTenant({ ...ctx, branchScope: "all" })
      .find({ status: "active" }, { sort: { name: 1 } }),
    rolesRepo.forTenant(ctx).find({}),
  ])

  const scopedMembers =
    rca.branchId || ctx.branchScope !== "all"
      ? allActiveMembers.filter((m) => {
          const access = resolveAccess(m, customRoles)
          if (rca.branchId) return inBranchScope(access.branchScope, rca.branchId)
          if (ctx.branchScope === "all") return true
          return ctx.branchScope.some((bid) => inBranchScope(access.branchScope, bid))
        })
      : allActiveMembers

  // Auto-suggest recurrence: count new tickets at same location + category created after this RCA
  let suggestedRecurrenceCount = 0
  if (rca.locationId && rca.categoryId) {
    suggestedRecurrenceCount = await tickets.forTenant(ctx).count({
      locationId: rca.locationId,
      categoryId: rca.categoryId,
      createdAt: { $gt: rca.createdAt },
      _id: { $nin: rca.sourceTicketIds },
    })
  }

  return { rca, capas: capaList, linkedTickets, members: scopedMembers, suggestedRecurrenceCount }
}

export async function createRcaInSession(
  ctx: TenantContext,
  raw: z.input<typeof createRcaSchema>,
  session: ClientSession,
) {
  assertCan(ctx, "rca:manage")
  const input = parseInput(createRcaSchema, raw)
  const ownerName = await memberNameOf(ctx, ctx.actorId)

  let branchId: ObjectId | null = input.branchId ?? null
  let locationId: ObjectId | null = null
  let categoryId: ObjectId | null = null

  const uniqueTicketIds: ObjectId[] = []
  const seen = new Set<string>()
  for (const tid of input.sourceTicketIds) {
    const hex = tid.toHexString()
    if (!seen.has(hex)) {
      seen.add(hex)
      uniqueTicketIds.push(tid)
    }
  }

  if (uniqueTicketIds.length > 0) {
    const foundTickets = await tickets
      .forTenant(ctx)
      .find({ _id: { $in: uniqueTicketIds } }, { session })
    if (foundTickets.length !== uniqueTicketIds.length) {
      throw new ApiError("NOT_FOUND", "One or more source tickets were not found in your scope.")
    }
    const firstTicket =
      foundTickets.find((t) => t._id.equals(uniqueTicketIds[0])) ?? foundTickets[0]
    branchId = firstTicket.branchId
    locationId = firstTicket.locationId
    categoryId = firstTicket.categoryId
  }

  if (branchId && !inBranchScope(ctx.branchScope, branchId)) {
    throw new ApiError("FORBIDDEN", "You don't have access to that branch.")
  }
  if (!branchId && ctx.branchScope !== "all") {
    if (ctx.branchScope.length === 1) {
      branchId = ctx.branchScope[0]
    } else {
      throw new ApiError("VALIDATION", "Choose a branch for this RCA.")
    }
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const seq = await nextSequence(`${ctx.tenantId.toHexString()}:rcas:${year}`, session)
  const number = `RCA-${year}-${String(seq).padStart(6, "0")}`

  const doc = await rcas.forTenant(ctx).insertOne(
    {
      number,
      title: input.title,
      method: input.method,
      sourceTicketIds: uniqueTicketIds,
      sourceAuditFindingId: input.sourceAuditFindingId ?? null,
      branchId,
      locationId,
      categoryId,
      problemStatement: input.problemStatement,
      whys: [],
      fishbone: EMPTY_FISHBONE,
      contributingFactors: [],
      rootCause: "",
      ownerId: ctx.actorId,
      ownerName,
      status: "draft",
      approvals: [],
      attachments: [],
    },
    { session },
  )

  // Link source tickets back to this RCA and write activity entries
  for (const tid of uniqueTicketIds) {
    const t = await tickets
      .forTenant(ctx)
      .updateOne({ _id: tid }, { $set: { rcaId: doc._id } }, { session })
    if (t) {
      await ticketActivities.forTenant(ctx).insertOne(
        {
          branchId: t.branchId,
          ticketId: t._id,
          type: "rca.linked",
          actorId: ctx.actorId,
          actorName: ownerName,
          at: now,
          after: { rcaNumber: number },
        },
        { session },
      )
    }
  }

  await appendAudit(
    ctx,
    {
      action: "rca.created",
      entity: "rca",
      entityId: doc._id,
      after: { number, title: doc.title, sourceTickets: uniqueTicketIds.length },
    },
    { session },
  )
  return doc
}

export async function createRca(ctx: TenantContext, raw: z.input<typeof createRcaSchema>) {
  assertCan(ctx, "rca:manage")
  return withTransaction((session) => createRcaInSession(ctx, raw, session))
}

export async function updateRcaAnalysis(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof analysisSchema>,
) {
  assertCan(ctx, "rca:manage")
  const id = parseInput(objectId, idRaw)
  const input = parseInput(analysisSchema, raw)
  const cleanList = (arr: string[]) => arr.map((s) => s.trim()).filter(Boolean)

  return withTransaction(async (session) => {
    const existing = await rcas.forTenant(ctx).findById(id, { session })
    if (!existing) throw new ApiError("NOT_FOUND", "RCA not found.")
    assertRcaInScope(ctx, existing)
    if (existing.status === "closed") {
      throw new ApiError("CONFLICT", "Closed RCAs cannot be edited.")
    }

    const updated = await rcas.forTenant(ctx).updateOne(
      { _id: id },
      {
        $set: {
          method: input.method,
          problemStatement: input.problemStatement,
          whys: cleanList(input.whys),
          fishbone: {
            man: cleanList(input.fishbone.man),
            machine: cleanList(input.fishbone.machine),
            method: cleanList(input.fishbone.method),
            material: cleanList(input.fishbone.material),
            measurement: cleanList(input.fishbone.measurement),
            environment: cleanList(input.fishbone.environment),
          },
          contributingFactors: cleanList(input.contributingFactors),
          rootCause: input.rootCause,
        },
      },
      { session },
    )
    if (!updated) throw new ApiError("NOT_FOUND", "RCA not found.")
    await appendAudit(
      ctx,
      {
        action: "rca.updated",
        entity: "rca",
        entityId: id,
        after: { method: input.method, rootCause: input.rootCause },
      },
      { session },
    )
    return updated
  })
}

export async function signRcaApproval(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: z.input<typeof approvalSchema>,
) {
  const input = parseInput(approvalSchema, raw)
  if (input.stage === "approver") assertCan(ctx, "rca:approve")
  else assertCan(ctx, "rca:manage")

  const id = parseInput(objectId, idRaw)
  const whoName = await memberNameOf(ctx, ctx.actorId)

  const updated = await withTransaction(async (session) => {
    const existing = await rcas.forTenant(ctx).findById(id, { session })
    if (!existing) throw new ApiError("NOT_FOUND", "RCA not found.")
    assertRcaInScope(ctx, existing)
    if (existing.status === "closed") {
      throw new ApiError("CONFLICT", "Closed RCAs cannot be signed again.")
    }

    // Enforce Owner -> Reviewer -> Approver stage ordering when approving (phase.md §6.6).
    if (input.decision === "approved") {
      const latestFor = (stage: "owner" | "reviewer" | "approver") =>
        [...existing.approvals].reverse().find((a) => a.stage === stage)
      if (input.stage === "reviewer" && latestFor("owner")?.decision !== "approved") {
        throw new ApiError("CONFLICT", "Owner sign-off must be approved before Reviewer review.")
      }
      if (
        input.stage === "approver" &&
        (latestFor("owner")?.decision !== "approved" ||
          latestFor("reviewer")?.decision !== "approved")
      ) {
        throw new ApiError(
          "CONFLICT",
          "Owner and Reviewer approvals are required before final Approver sign-off.",
        )
      }
    }

    const entry = {
      stage: input.stage,
      userId: ctx.actorId,
      userName: whoName,
      decision: input.decision,
      ...(input.comment ? { comment: input.comment } : {}),
      at: new Date(),
    }

    let nextStatus = existing.status
    if (input.decision === "rejected") {
      nextStatus = "draft"
    } else if (input.stage === "approver") {
      nextStatus = "approved"
    } else if (existing.status !== "approved") {
      nextStatus = "in_review"
    }

    const doc = await rcas.forTenant(ctx).updateOne(
      { _id: id },
      {
        $push: { approvals: entry },
        $set: { status: nextStatus },
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: `rca.${input.stage}_${input.decision}`,
        entity: "rca",
        entityId: id,
        after: { stage: input.stage, decision: input.decision, status: nextStatus },
      },
      { session },
    )
    return doc!
  })

  if (updated.status === "approved") {
    dispatchWebhookEvent(ctx, "rca.approved", {
      rcaId: updated._id.toHexString(),
      number: updated.number,
      title: updated.title,
      summary: `${updated.number} approved: ${updated.title}`,
    })
  }
  return updated
}

/** Links an additional ticket (by ticket number or ID) to an existing RCA (phase.md §6.6). */
export async function linkTicketToRca(
  ctx: TenantContext,
  rcaIdRaw: ObjectId | string,
  ticketRefRaw: string,
) {
  assertCan(ctx, "rca:manage")
  const rcaId = parseInput(objectId, rcaIdRaw)
  const ref = ticketRefRaw.trim()
  if (!ref) throw new ApiError("VALIDATION", "Enter a ticket number (e.g. TKT-2026-000001).")
  const whoName = await memberNameOf(ctx, ctx.actorId)

  return withTransaction(async (session) => {
    const rca = await rcas.forTenant(ctx).findById(rcaId, { session })
    if (!rca) throw new ApiError("NOT_FOUND", "RCA record not found.")
    assertRcaInScope(ctx, rca)
    if (rca.status === "closed") throw new ApiError("CONFLICT", "Closed RCAs cannot be modified.")

    const tRepo = tickets.forTenant(ctx)
    const ticket = objectId.safeParse(ref).success
      ? await tRepo.findById(ref, { session })
      : await tRepo.findOne({ number: ref.toUpperCase() }, { session })
    if (!ticket) {
      throw new ApiError("NOT_FOUND", `Ticket "${ref}" not found in your scope.`)
    }
    if (rca.branchId && !rca.branchId.equals(ticket.branchId)) {
      throw new ApiError("VALIDATION", "Linked tickets must belong to the same branch as the RCA.")
    }

    const updated = await rcas.forTenant(ctx).updateOne(
      { _id: rca._id },
      {
        $addToSet: { sourceTicketIds: ticket._id },
        $set: {
          ...(rca.branchId ? {} : { branchId: ticket.branchId }),
          ...(rca.locationId ? {} : { locationId: ticket.locationId }),
          ...(rca.categoryId ? {} : { categoryId: ticket.categoryId }),
        },
      },
      { session },
    )
    await tRepo.updateOne({ _id: ticket._id }, { $set: { rcaId: rca._id } }, { session })
    await ticketActivities.forTenant(ctx).insertOne(
      {
        branchId: ticket.branchId,
        ticketId: ticket._id,
        type: "rca.linked",
        actorId: ctx.actorId,
        actorName: whoName,
        at: new Date(),
        after: { rcaNumber: rca.number },
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "rca.ticket_linked",
        entity: "rca",
        entityId: rca._id,
        after: { ticketNumber: ticket.number },
      },
      { session },
    )
    return updated!
  })
}

/** Closes an approved RCA once all CAPAs are verified. */
export async function closeRca(ctx: TenantContext, rcaIdRaw: ObjectId | string) {
  if (!can(ctx, "rca:approve") && !can(ctx, "rca:manage")) {
    throw new ApiError("FORBIDDEN", "You don't have permission to close this RCA.")
  }
  const rcaId = parseInput(objectId, rcaIdRaw)
  return withTransaction(async (session) => {
    const existing = await rcas.forTenant(ctx).findById(rcaId, { session })
    if (!existing) throw new ApiError("NOT_FOUND", "RCA record not found.")
    assertRcaInScope(ctx, existing)
    if (existing.status !== "approved") {
      throw new ApiError("CONFLICT", "An RCA must be approved before closing.")
    }
    const openCapas = await capas
      .forTenant(ctx)
      .count({ rcaId: existing._id, status: { $nin: ["verified", "closed"] } }, { session })
    if (openCapas > 0) {
      throw new ApiError(
        "CONFLICT",
        "Verify all CAPA effectiveness checks before closing this RCA.",
      )
    }
    const updated = await rcas
      .forTenant(ctx)
      .updateOne({ _id: existing._id }, { $set: { status: "closed" } }, { session })
    await capas
      .forTenant(ctx)
      .updateMany({ rcaId: existing._id }, { $set: { status: "closed" } }, { session })
    await appendAudit(
      ctx,
      { action: "rca.closed", entity: "rca", entityId: existing._id, after: { status: "closed" } },
      { session },
    )
    return updated!
  })
}

export async function createCapa(ctx: TenantContext, raw: z.input<typeof createCapaSchema>) {
  assertCan(ctx, "capa:manage")
  const input = parseInput(createCapaSchema, raw)
  const rca = await rcas.forTenant(ctx).findById(input.rcaId)
  if (!rca) throw new ApiError("NOT_FOUND", "Parent RCA not found.")
  assertRcaInScope(ctx, rca)

  const ownerIds = [...new Set(input.actions.map((a) => a.ownerId))]
  const matchedMembers = await members
    .forTenant({ ...ctx, branchScope: "all" })
    .find({ userId: { $in: ownerIds } }, { projection: { userId: 1, name: 1 } })
  const nameMap = new Map(matchedMembers.map((m) => [m.userId, m.name]))

  const actions: CapaActionItem[] = input.actions.map((a) => ({
    id: randomUUID(),
    title: a.title,
    ownerId: a.ownerId,
    ownerName: nameMap.get(a.ownerId) ?? "Staff",
    dueDate: new Date(a.dueDate),
    status: "open",
    evidence: [],
    completedAt: null,
    remindedAt: null,
  }))

  const doc = await withTransaction(async (session) => {
    const now = new Date()
    const year = now.getUTCFullYear()
    const seq = await nextSequence(`${ctx.tenantId.toHexString()}:capas:${year}`, session)
    const number = `CAPA-${year}-${String(seq).padStart(6, "0")}`
    const created = await capas.forTenant(ctx).insertOne(
      {
        number,
        rcaId: rca._id,
        rcaNumber: rca.number,
        branchId: rca.branchId ?? null,
        title: input.title,
        type: input.type,
        actions,
        effectivenessCheck: {
          dueDate: new Date(now.getTime() + input.effectivenessDueDays * 86_400_000),
          method: input.effectivenessMethod,
          recurred: null,
          result: null,
          checkedAt: null,
        },
        status: "open",
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "capa.created",
        entity: "capa",
        entityId: created._id,
        after: { number, rcaNumber: rca.number, type: input.type, actions: actions.length },
      },
      { session },
    )
    return created
  })

  for (const act of actions) {
    if (act.ownerId !== ctx.actorId) {
      await notifyUser(ctx, {
        userId: act.ownerId,
        type: "capa.assigned",
        title: `CAPA action assigned · ${doc.number}`,
        body: act.title,
        href: `/rca/${rca._id.toHexString()}`,
      })
    }
  }
  return doc
}

export async function updateCapaActionStatus(
  ctx: TenantContext,
  capaIdRaw: ObjectId | string,
  actionId: string,
  statusRaw: CapaActionItem["status"],
  evidence: string[] = [],
) {
  assertCan(ctx, "capa:manage")
  const capaId = parseInput(objectId, capaIdRaw)
  const status = parseInput(capaActionStatusSchema, statusRaw)

  return withTransaction(async (session) => {
    const capa = await capas.forTenant(ctx).findById(capaId, { session })
    if (!capa) throw new ApiError("NOT_FOUND", "CAPA not found.")
    const rca = await rcas.forTenant(ctx).findById(capa.rcaId, { session })
    if (!rca) throw new ApiError("NOT_FOUND", "Parent RCA not found.")
    assertRcaInScope(ctx, rca)
    if (capa.status === "verified" || capa.status === "closed") {
      throw new ApiError("CONFLICT", "Verified or closed CAPAs cannot be modified.")
    }
    if (!capa.actions.some((a) => a.id === actionId)) {
      throw new ApiError("NOT_FOUND", "CAPA action item not found.")
    }

    const now = new Date()
    const nextActions = capa.actions.map((a) =>
      a.id === actionId
        ? {
            ...a,
            status,
            evidence: evidence.length > 0 ? [...new Set([...a.evidence, ...evidence])] : a.evidence,
            completedAt: status === "completed" || status === "verified" ? now : a.completedAt,
          }
        : a,
    )

    const allDone = nextActions.every((a) => a.status === "completed" || a.status === "verified")
    const anyStarted = nextActions.some((a) => a.status !== "open")
    const nextCapaStatus = allDone ? "pending_effectiveness" : anyStarted ? "in_progress" : "open"

    const updated = await capas
      .forTenant(ctx)
      .updateOne(
        { _id: capa._id },
        { $set: { actions: nextActions, status: nextCapaStatus } },
        { session },
      )
    await appendAudit(
      ctx,
      {
        action: "capa.action_updated",
        entity: "capa",
        entityId: capa._id,
        after: { actionId, status, capaStatus: nextCapaStatus },
      },
      { session },
    )
    return updated!
  })
}

export async function verifyCapaEffectiveness(
  ctx: TenantContext,
  capaIdRaw: ObjectId | string,
  raw: z.input<typeof effectivenessSchema>,
) {
  assertCan(ctx, "capa:verify")
  const capaId = parseInput(objectId, capaIdRaw)
  const input = parseInput(effectivenessSchema, raw)
  const verifierName = await memberNameOf(ctx, ctx.actorId)

  return withTransaction(async (session) => {
    const capa = await capas.forTenant(ctx).findById(capaId, { session })
    if (!capa) throw new ApiError("NOT_FOUND", "CAPA not found.")
    const rca = await rcas.forTenant(ctx).findById(capa.rcaId, { session })
    if (!rca) throw new ApiError("NOT_FOUND", "Parent RCA not found.")
    assertRcaInScope(ctx, rca)
    if (capa.status === "closed") {
      throw new ApiError("CONFLICT", "Closed CAPAs cannot be verified again.")
    }

    let suggestedRecurrenceCount = 0
    if (rca.locationId && rca.categoryId) {
      suggestedRecurrenceCount = await tickets.forTenant(ctx).count(
        {
          locationId: rca.locationId,
          categoryId: rca.categoryId,
          createdAt: { $gt: capa.createdAt },
          _id: { $nin: rca.sourceTicketIds },
        },
        { session },
      )
    }

    const now = new Date()
    const nextStatus = input.result === "effective" ? "verified" : "in_progress"

    const updated = await capas.forTenant(ctx).updateOne(
      { _id: capa._id },
      {
        $set: {
          status: nextStatus,
          effectivenessCheck: {
            dueDate: capa.effectivenessCheck?.dueDate ?? now,
            method: capa.effectivenessCheck?.method ?? "Recurrence check",
            recurred: input.recurred,
            suggestedRecurrenceCount,
            evidence: input.evidence,
            verifierId: ctx.actorId,
            verifierName,
            result: input.result,
            checkedAt: now,
          },
        },
      },
      { session },
    )
    await appendAudit(
      ctx,
      {
        action: "capa.effectiveness_verified",
        entity: "capa",
        entityId: capa._id,
        after: { result: input.result, recurred: input.recurred, suggestedRecurrenceCount },
      },
      { session },
    )
    return updated!
  })
}

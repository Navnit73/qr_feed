import "server-only"
import { randomBytes } from "node:crypto"
import { ObjectId, type ClientSession } from "mongodb"
import { z } from "zod"
import { ApiError } from "@/lib/api/errors"
import { parseInput } from "@/lib/api/validation"
import { generateShortCode, isShortCode } from "@/lib/short-code"
import { appendAudit } from "@/server/audit/audit-log"
import type { TenantContext } from "@/server/db/tenant-context"
import { inBranchScope } from "@/server/db/tenant-context"
import { withTransaction } from "@/server/db/transaction"
import { tenantsCollection } from "@/server/modules/tenants"
import { rateLimit } from "@/server/rate-limit"
import { assertCan } from "@/server/rbac/ability"
import {
  branches,
  locations,
  SURVEY_QUESTION_TYPES,
  surveyResponses,
  surveys,
  type SurveyAnswer,
  type SurveyDoc,
  type SurveyQuestion,
  type SurveyResponseDoc,
} from "@/server/repositories"
import { verifyTurnstile } from "@/server/turnstile"
import { isDuplicateKey, objectId } from "@/server/validation"

const blank = (v: unknown) => (v === "" || v === null ? undefined : v)

const optionalObjectId = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  objectId.nullish(),
)

const surveyQuestionSchema = z
  .object({
    id: z.preprocess(
      (v) => (typeof v === "string" && v.trim() ? v.trim() : `q_${randomBytes(4).toString("hex")}`),
      z.string().min(1).max(60),
    ),
    type: z.enum(SURVEY_QUESTION_TYPES),
    label: z.string().trim().min(2, "Enter a question prompt").max(240),
    helpText: z.preprocess(blank, z.string().trim().max(300).optional()),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(120)).max(15).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === "single_choice" || q.type === "multi_choice") {
      const unique = [...new Set((q.options ?? []).map((o) => o.trim()).filter(Boolean))]
      if (unique.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: `Question "${q.label}" needs at least 2 distinct choices`,
        })
      }
    }
  })

const surveyInputSchema = z.object({
  title: z.string().trim().min(3, "Give your survey a clear title").max(120),
  description: z.preprocess(blank, z.string().trim().max(500).optional()),
  branchId: optionalObjectId.optional(),
  locationId: optionalObjectId.optional(),
  collectContact: z.boolean().default(true),
  thankYouMessage: z.preprocess(blank, z.string().trim().max(300).optional()),
  questions: z
    .array(surveyQuestionSchema)
    .min(1, "Add at least one question to your survey")
    .max(30, "Keep surveys concise (30 questions max)"),
})

export type SurveyInput = z.input<typeof surveyInputSchema>

function sanitizeQuestions(raw: z.infer<typeof surveyQuestionSchema>[]): SurveyQuestion[] {
  const seen = new Set<string>()
  return raw.map((q) => {
    let id = q.id.replace(/[^a-zA-Z0-9_-]/g, "") || `q_${randomBytes(4).toString("hex")}`
    while (seen.has(id)) id = `q_${randomBytes(4).toString("hex")}`
    seen.add(id)
    const needsOptions = q.type === "single_choice" || q.type === "multi_choice"
    const options = needsOptions
      ? [...new Set((q.options ?? []).map((o) => o.trim()).filter(Boolean))]
      : undefined
    return {
      id,
      type: q.type,
      label: q.label,
      ...(q.helpText ? { helpText: q.helpText } : {}),
      required: Boolean(q.required),
      ...(options ? { options } : {}),
    }
  })
}

async function resolveScope(
  ctx: TenantContext,
  branchIdInput?: ObjectId | null,
  locationIdInput?: ObjectId | null,
  session?: ClientSession,
): Promise<{ branchId: ObjectId | null; locationId: ObjectId | null; scopeLabel: string }> {
  const sys: TenantContext = { ...ctx, branchScope: "all" }
  if (locationIdInput) {
    const loc = await locations.forTenant(sys).findById(locationIdInput, { session })
    if (!loc || loc.status !== "active") {
      throw new ApiError("NOT_FOUND", "Selected location was not found.")
    }
    if (!inBranchScope(ctx.branchScope, loc.branchId)) {
      throw new ApiError("FORBIDDEN", "You don't have access to that location's branch.")
    }
    const branch = await branches.forTenant(sys).findById(loc.branchId, { session })
    return {
      branchId: loc.branchId,
      locationId: loc._id,
      scopeLabel: branch ? `${branch.name} · ${loc.path.join(" › ")}` : loc.path.join(" › "),
    }
  }

  if (branchIdInput) {
    if (!inBranchScope(ctx.branchScope, branchIdInput)) {
      throw new ApiError("FORBIDDEN", "You don't have access to that branch.")
    }
    const branch = await branches.forTenant(sys).findById(branchIdInput, { session })
    if (!branch || branch.status !== "active") {
      throw new ApiError("NOT_FOUND", "Selected branch was not found.")
    }
    return { branchId: branch._id, locationId: null, scopeLabel: branch.name }
  }

  if (ctx.branchScope !== "all") {
    const firstBranchId = ctx.branchScope[0]
    if (!firstBranchId) {
      throw new ApiError("FORBIDDEN", "No branch assigned to your account.")
    }
    const branch = await branches.forTenant(sys).findById(firstBranchId, { session })
    return {
      branchId: firstBranchId,
      locationId: null,
      scopeLabel: branch?.name ?? "Assigned branch",
    }
  }

  return { branchId: null, locationId: null, scopeLabel: "All branches" }
}

export function canReadSurvey(ctx: TenantContext, survey: Pick<SurveyDoc, "branchId">): boolean {
  if (ctx.branchScope === "all") return true
  if (!survey.branchId) return true
  return inBranchScope(ctx.branchScope, survey.branchId)
}

/** Branch-scoped admins can read org-wide surveys, but may only mutate surveys scoped to their branch. */
export function canMutateSurvey(ctx: TenantContext, survey: Pick<SurveyDoc, "branchId">): boolean {
  if (ctx.branchScope === "all") return true
  if (!survey.branchId) return false
  return inBranchScope(ctx.branchScope, survey.branchId)
}

function isShortCodeCollision(err: unknown): boolean {
  return isDuplicateKey(err) && String(err).includes("shortCode")
}

export async function listSurveys(ctx: TenantContext) {
  assertCan(ctx, "qr:read")
  const all = await surveys
    .forTenant(ctx)
    .find({ status: { $ne: "archived" } }, { sort: { createdAt: -1 }, limit: 200 })
  return all.filter((s) => canReadSurvey(ctx, s))
}

export async function getSurvey(ctx: TenantContext, idRaw: ObjectId | string) {
  assertCan(ctx, "qr:read")
  const id = parseInput(objectId, idRaw)
  const doc = await surveys.forTenant(ctx).findById(id)
  if (!doc || !canReadSurvey(ctx, doc)) {
    throw new ApiError("NOT_FOUND", "Survey not found.")
  }
  return doc
}

export async function createSurvey(ctx: TenantContext, raw: SurveyInput): Promise<SurveyDoc> {
  assertCan(ctx, "qr:create")
  const input = parseInput(surveyInputSchema, raw)
  const questions = sanitizeQuestions(input.questions)

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await withTransaction(async (session) => {
        const scope = await resolveScope(ctx, input.branchId, input.locationId, session)
        const doc = await surveys.forTenant(ctx).insertOne(
          {
            branchId: scope.branchId,
            locationId: scope.locationId,
            scopeLabel: scope.scopeLabel,
            title: input.title,
            ...(input.description ? { description: input.description } : {}),
            shortCode: generateShortCode(),
            status: "active",
            questions,
            collectContact: input.collectContact,
            thankYouMessage: input.thankYouMessage ?? "Thank you for your feedback!",
            scanCount: 0,
            responseCount: 0,
            lastResponseAt: null,
            createdBy: ctx.actorId,
          },
          { session },
        )
        await appendAudit(
          ctx,
          {
            action: "survey.created",
            entity: "survey",
            entityId: doc._id,
            after: {
              title: doc.title,
              shortCode: doc.shortCode,
              questions: doc.questions.length,
              scope: scope.scopeLabel,
            },
          },
          { session },
        )
        return doc
      })
    } catch (err) {
      if (isShortCodeCollision(err) && attempt < 3) continue
      throw err
    }
  }
  throw new ApiError("INTERNAL", "Could not generate a unique survey QR code.")
}

export async function updateSurvey(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  raw: SurveyInput,
): Promise<SurveyDoc> {
  assertCan(ctx, "qr:create")
  const id = parseInput(objectId, idRaw)
  const input = parseInput(surveyInputSchema, raw)
  const questions = sanitizeQuestions(input.questions)

  return withTransaction(async (session) => {
    const existing = await surveys.forTenant(ctx).findById(id, { session })
    if (!existing || !canReadSurvey(ctx, existing)) {
      throw new ApiError("NOT_FOUND", "Survey not found.")
    }
    if (!canMutateSurvey(ctx, existing)) {
      throw new ApiError("FORBIDDEN", "Only organisation-wide admins can edit all-branch surveys.")
    }
    const scope = await resolveScope(ctx, input.branchId, input.locationId, session)
    const updated = await surveys.forTenant(ctx).updateOne(
      { _id: id },
      {
        $set: {
          title: input.title,
          description: input.description ?? "",
          branchId: scope.branchId,
          locationId: scope.locationId,
          scopeLabel: scope.scopeLabel,
          questions,
          collectContact: input.collectContact,
          thankYouMessage: input.thankYouMessage ?? "Thank you for your feedback!",
        },
      },
      { session },
    )
    if (!updated) throw new ApiError("NOT_FOUND", "Survey not found.")
    await appendAudit(
      ctx,
      {
        action: "survey.updated",
        entity: "survey",
        entityId: id,
        before: { title: existing.title, questions: existing.questions.length },
        after: { title: updated.title, questions: updated.questions.length },
      },
      { session },
    )
    return updated
  })
}

export async function setSurveyStatus(
  ctx: TenantContext,
  idRaw: ObjectId | string,
  status: "active" | "paused" | "archived",
): Promise<SurveyDoc> {
  assertCan(ctx, status === "archived" ? "qr:revoke" : "qr:create")
  const id = parseInput(objectId, idRaw)
  return withTransaction(async (session) => {
    const existing = await surveys.forTenant(ctx).findById(id, { session })
    if (!existing || !canReadSurvey(ctx, existing)) {
      throw new ApiError("NOT_FOUND", "Survey not found.")
    }
    if (!canMutateSurvey(ctx, existing)) {
      throw new ApiError("FORBIDDEN", "Only organisation-wide admins can edit all-branch surveys.")
    }
    const updated = await surveys
      .forTenant(ctx)
      .updateOne({ _id: id }, { $set: { status } }, { session })
    if (!updated) throw new ApiError("NOT_FOUND", "Survey not found.")
    await appendAudit(
      ctx,
      {
        action: `survey.${status}`,
        entity: "survey",
        entityId: id,
        before: { status: existing.status },
        after: { status },
      },
      { session },
    )
    return updated
  })
}

export async function regenerateSurveyQr(
  ctx: TenantContext,
  idRaw: ObjectId | string,
): Promise<SurveyDoc> {
  assertCan(ctx, "qr:create")
  assertCan(ctx, "qr:revoke")
  const id = parseInput(objectId, idRaw)

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await withTransaction(async (session) => {
        const existing = await surveys.forTenant(ctx).findById(id, { session })
        if (!existing || !canReadSurvey(ctx, existing)) {
          throw new ApiError("NOT_FOUND", "Survey not found.")
        }
        if (!canMutateSurvey(ctx, existing)) {
          throw new ApiError(
            "FORBIDDEN",
            "Only organisation-wide admins can regenerate QR codes for all-branch surveys.",
          )
        }
        const freshCode = generateShortCode()
        const updated = await surveys
          .forTenant(ctx)
          .updateOne({ _id: id }, { $set: { shortCode: freshCode } }, { session })
        if (!updated) throw new ApiError("NOT_FOUND", "Survey not found.")
        await appendAudit(
          ctx,
          {
            action: "survey.qr_regenerated",
            entity: "survey",
            entityId: id,
            before: { shortCode: existing.shortCode },
            after: { shortCode: freshCode },
          },
          { session },
        )
        return updated
      })
    } catch (err) {
      if (isShortCodeCollision(err) && attempt < 3) continue
      throw err
    }
  }
  throw new ApiError("INTERNAL", "Could not allocate a fresh survey QR code.")
}

// ── Public Scan & Submission (`/s/[code]`) ───────────────────────────────────────────

export type PublicSurvey = {
  surveyId: ObjectId
  shortCode: string
  status: SurveyDoc["status"]
  tenantId: ObjectId
  tenantName: string
  industry: import("@/server/modules/tenants").Industry
  branding: import("@/server/modules/tenants").TenantBranding | null
  branchId: ObjectId | null
  locationId: ObjectId | null
  scopeLabel: string
  title: string
  description: string
  questions: SurveyQuestion[]
  collectContact: boolean
  thankYouMessage: string
}

export async function resolvePublicSurvey(shortCode: string): Promise<PublicSurvey | null> {
  if (!isShortCode(shortCode)) return null
  const survey = await surveys.unscoped().findOne({ shortCode, status: { $ne: "archived" } })
  if (!survey) return null

  const tenant = await tenantsCollection().findOne(
    { _id: survey.tenantId, status: "active" },
    { projection: { name: 1, industry: 1, branding: 1 } },
  )
  if (!tenant) return null

  return {
    surveyId: survey._id,
    shortCode: survey.shortCode,
    status: survey.status,
    tenantId: tenant._id,
    tenantName: tenant.name,
    industry: tenant.industry,
    branding: tenant.branding ?? null,
    branchId: survey.branchId ?? null,
    locationId: survey.locationId ?? null,
    scopeLabel: survey.scopeLabel ?? tenant.name,
    title: survey.title,
    description: survey.description ?? "",
    questions: survey.questions,
    collectContact: survey.collectContact,
    thankYouMessage: survey.thankYouMessage ?? "Thank you for your feedback!",
  }
}

export async function recordSurveyScan(surveyId: ObjectId) {
  await surveys.unscoped().updateOne({ _id: surveyId }, { $inc: { scanCount: 1 } })
}

const DEFAULT_SURVEY_LIMITS = { perIp: 20, perSurvey: 200, windowMs: 10 * 60 * 1000 }

const contactSchema = z.object({
  name: z.preprocess(blank, z.string().trim().max(80).optional()),
  email: z.preprocess(blank, z.email({ error: "Enter a valid email" }).toLowerCase().optional()),
  phone: z.preprocess(
    blank,
    z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{7,20}$/, "Enter a valid phone number")
      .optional(),
  ),
  consent: z.literal("on", { error: "Please confirm before submitting" }),
})

export type SubmitSurveyOptions = {
  ip: string
  limits?: { perIp: number; perSurvey: number; windowMs: number } | null
  turnstile?: { secret?: string; token?: string | null }
}

/**
 * Validates and persists a patient / guest response to a public survey QR (`/s/[code]`).
 * Never trusts client tenantId; everything derives from `shortCode`.
 */
export async function submitSurveyResponse(
  shortCode: string,
  raw: Record<string, unknown>,
  opts: SubmitSurveyOptions,
): Promise<{ responseId: string; thankYouMessage: string }> {
  const limits = opts.limits === undefined ? DEFAULT_SURVEY_LIMITS : opts.limits
  if (limits) {
    const [byIp, bySurvey] = await Promise.all([
      rateLimit({ key: `survey:ip:${opts.ip}`, limit: limits.perIp, windowMs: limits.windowMs }),
      rateLimit({
        key: `survey:code:${shortCode}`,
        limit: limits.perSurvey,
        windowMs: limits.windowMs,
      }),
    ])
    if (!byIp.ok || !bySurvey.ok) {
      throw new ApiError(
        "RATE_LIMITED",
        "Too many responses right now. Please try again in a few minutes.",
      )
    }
  }

  const pub = await resolvePublicSurvey(shortCode)
  if (!pub) throw new ApiError("NOT_FOUND", "This survey QR code is no longer active.")
  if (pub.status !== "active") {
    throw new ApiError("CONFLICT", "This survey is currently paused and not accepting responses.")
  }

  const human = await verifyTurnstile({
    secret: opts.turnstile?.secret,
    token: opts.turnstile?.token,
    ip: opts.ip,
  })
  if (!human) throw new ApiError("FORBIDDEN", "We couldn't verify the form. Please try again.")

  const fieldErrors: Record<string, string[]> = {}
  const contactParsed = contactSchema.safeParse({
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    consent: raw.consent,
  })
  if (!contactParsed.success) {
    for (const issue of contactParsed.error.issues) {
      const key = String(issue.path[0] ?? "_form")
      ;(fieldErrors[key] ??= []).push(issue.message)
    }
  }

  const answers: SurveyAnswer[] = []
  const ratingValues: number[] = []
  let npsScore: number | null = null

  for (const q of pub.questions) {
    const fieldName = `q_${q.id}`
    const rawVal = raw[fieldName]

    if (q.type === "rating") {
      const str =
        typeof rawVal === "string"
          ? rawVal.trim()
          : typeof rawVal === "number"
            ? String(rawVal)
            : ""
      if (!str) {
        if (q.required) fieldErrors[fieldName] = ["Please choose a rating (1 to 5 stars)"]
        answers.push({
          questionId: q.id,
          questionLabel: q.label,
          questionType: q.type,
          value: null,
        })
      } else {
        const num = Number(str)
        if (!Number.isInteger(num) || num < 1 || num > 5) {
          fieldErrors[fieldName] = ["Pick between 1 and 5 stars"]
        } else {
          ratingValues.push(num)
          answers.push({
            questionId: q.id,
            questionLabel: q.label,
            questionType: q.type,
            value: num,
          })
        }
      }
    } else if (q.type === "nps") {
      const str =
        typeof rawVal === "string"
          ? rawVal.trim()
          : typeof rawVal === "number"
            ? String(rawVal)
            : ""
      if (!str) {
        if (q.required) fieldErrors[fieldName] = ["Please pick a score from 0 to 10"]
        answers.push({
          questionId: q.id,
          questionLabel: q.label,
          questionType: q.type,
          value: null,
        })
      } else {
        const num = Number(str)
        if (!Number.isInteger(num) || num < 0 || num > 10) {
          fieldErrors[fieldName] = ["Pick a score between 0 and 10"]
        } else {
          if (npsScore === null) npsScore = num
          answers.push({
            questionId: q.id,
            questionLabel: q.label,
            questionType: q.type,
            value: num,
          })
        }
      }
    } else if (q.type === "yes_no") {
      const str =
        typeof rawVal === "string"
          ? rawVal.trim().toLowerCase()
          : typeof rawVal === "boolean"
            ? String(rawVal)
            : ""
      if (!str) {
        if (q.required) fieldErrors[fieldName] = ["Please choose Yes or No"]
        answers.push({
          questionId: q.id,
          questionLabel: q.label,
          questionType: q.type,
          value: null,
        })
      } else if (str !== "yes" && str !== "no" && str !== "true" && str !== "false") {
        fieldErrors[fieldName] = ["Please choose Yes or No"]
      } else {
        const boolVal = str === "yes" || str === "true"
        answers.push({
          questionId: q.id,
          questionLabel: q.label,
          questionType: q.type,
          value: boolVal,
        })
      }
    } else if (q.type === "single_choice") {
      const str = typeof rawVal === "string" ? rawVal.trim() : ""
      const allowed = new Set(q.options ?? [])
      if (!str) {
        if (q.required) fieldErrors[fieldName] = ["Please select an option"]
        answers.push({
          questionId: q.id,
          questionLabel: q.label,
          questionType: q.type,
          value: null,
        })
      } else if (!allowed.has(str)) {
        fieldErrors[fieldName] = ["Please select one of the listed options"]
      } else {
        answers.push({ questionId: q.id, questionLabel: q.label, questionType: q.type, value: str })
      }
    } else if (q.type === "multi_choice") {
      const arr = Array.isArray(rawVal)
        ? rawVal.map((v) => String(v).trim()).filter(Boolean)
        : typeof rawVal === "string" && rawVal.trim()
          ? [rawVal.trim()]
          : []
      const allowed = new Set(q.options ?? [])
      const valid = [...new Set(arr.filter((v) => allowed.has(v)))]
      if (valid.length === 0 && q.required) {
        fieldErrors[fieldName] = ["Please pick at least one option"]
      } else if (arr.length > 0 && valid.length !== arr.length) {
        fieldErrors[fieldName] = ["Invalid choice selected"]
      }
      answers.push({
        questionId: q.id,
        questionLabel: q.label,
        questionType: q.type,
        value: valid.length > 0 ? valid : null,
      })
    } else {
      const maxLen = q.type === "short_text" ? 240 : 2000
      const str = typeof rawVal === "string" ? rawVal.trim() : ""
      if (!str) {
        if (q.required) fieldErrors[fieldName] = ["Please enter your response"]
        answers.push({
          questionId: q.id,
          questionLabel: q.label,
          questionType: q.type,
          value: null,
        })
      } else if (str.length > maxLen) {
        fieldErrors[fieldName] = [`Keep your response under ${maxLen} characters`]
      } else {
        answers.push({ questionId: q.id, questionLabel: q.label, questionType: q.type, value: str })
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiError("VALIDATION", "Please review the highlighted questions.", fieldErrors)
  }

  const contact = contactParsed.data!
  const anonymous = !pub.collectContact || (!contact.name && !contact.email && !contact.phone)
  const overallRating =
    ratingValues.length > 0
      ? Math.round((ratingValues.reduce((s, n) => s + n, 0) / ratingValues.length) * 10) / 10
      : null

  const sys: TenantContext = {
    tenantId: pub.tenantId,
    actorId: "public",
    roles: [],
    permissions: new Set(),
    branchScope: "all",
  }

  const saved = await withTransaction(async (session) => {
    const now = new Date()
    const doc = await surveyResponses.forTenant(sys).insertOne(
      {
        surveyId: pub.surveyId,
        branchId: pub.branchId,
        locationId: pub.locationId,
        answers,
        overallRating,
        npsScore,
        respondent: anonymous
          ? { anonymous: true }
          : {
              anonymous: false,
              ...(contact.name ? { name: contact.name } : {}),
              ...(contact.email ? { email: contact.email } : {}),
              ...(contact.phone ? { phone: contact.phone } : {}),
            },
        submittedAt: now,
      },
      { session },
    )
    await surveys
      .forTenant(sys)
      .updateOne(
        { _id: pub.surveyId },
        { $inc: { responseCount: 1 }, $set: { lastResponseAt: now } },
        { session },
      )
    return doc
  })

  return { responseId: saved._id.toHexString(), thankYouMessage: pub.thankYouMessage }
}

// ── Analytics, Responses & CSV Export ────────────────────────────────────────────────

export type QuestionBreakdown =
  | {
      questionId: string
      label: string
      type: "rating"
      answered: number
      average: number | null
      distribution: { star: number; count: number; pct: number }[]
    }
  | {
      questionId: string
      label: string
      type: "nps"
      answered: number
      nps: number | null
      promoters: number
      passives: number
      detractors: number
    }
  | {
      questionId: string
      label: string
      type: "single_choice" | "multi_choice" | "yes_no"
      answered: number
      options: { label: string; count: number; pct: number }[]
    }
  | {
      questionId: string
      label: string
      type: "short_text" | "long_text"
      answered: number
      samples: { text: string; submittedAt: string; respondent: string }[]
    }

export async function getSurveyDetailWithAnalytics(ctx: TenantContext, idRaw: ObjectId | string) {
  const survey = await getSurvey(ctx, idRaw)
  const responses = await surveyResponses
    .forTenant(ctx)
    .find({ surveyId: survey._id }, { sort: { submittedAt: -1, _id: -1 }, limit: 1000 })

  const totalResponses = responses.length
  const ratingDocs = responses.filter((r) => typeof r.overallRating === "number")
  const avgRating =
    ratingDocs.length > 0
      ? Math.round(
          (ratingDocs.reduce((s, r) => s + (r.overallRating ?? 0), 0) / ratingDocs.length) * 10,
        ) / 10
      : null

  const npsDocs = responses.filter((r) => typeof r.npsScore === "number")
  let npsScore: number | null = null
  if (npsDocs.length > 0) {
    const promoters = npsDocs.filter((r) => (r.npsScore ?? 0) >= 9).length
    const detractors = npsDocs.filter((r) => (r.npsScore ?? 0) <= 6).length
    npsScore = Math.round(((promoters - detractors) / npsDocs.length) * 100)
  }

  const breakdowns: QuestionBreakdown[] = survey.questions.map((q) => {
    const matched = responses
      .map((r) => ({
        response: r,
        answer: r.answers.find((a) => a.questionId === q.id),
      }))
      .filter((x) => x.answer && x.answer.value !== null && x.answer.value !== undefined)

    if (q.type === "rating") {
      const nums = matched
        .map((m) => m.answer!.value)
        .filter((v): v is number => typeof v === "number")
      const avg =
        nums.length > 0
          ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10
          : null
      const distribution = [5, 4, 3, 2, 1].map((star) => {
        const count = nums.filter((n) => n === star).length
        return { star, count, pct: nums.length > 0 ? Math.round((count / nums.length) * 100) : 0 }
      })
      return {
        questionId: q.id,
        label: q.label,
        type: "rating",
        answered: nums.length,
        average: avg,
        distribution,
      }
    }

    if (q.type === "nps") {
      const nums = matched
        .map((m) => m.answer!.value)
        .filter((v): v is number => typeof v === "number")
      const promoters = nums.filter((n) => n >= 9).length
      const passives = nums.filter((n) => n >= 7 && n <= 8).length
      const detractors = nums.filter((n) => n <= 6).length
      const nps =
        nums.length > 0 ? Math.round(((promoters - detractors) / nums.length) * 100) : null
      return {
        questionId: q.id,
        label: q.label,
        type: "nps",
        answered: nums.length,
        nps,
        promoters,
        passives,
        detractors,
      }
    }

    if (q.type === "yes_no") {
      const bools = matched
        .map((m) => m.answer!.value)
        .filter((v): v is boolean => typeof v === "boolean")
      const yesCount = bools.filter(Boolean).length
      const noCount = bools.length - yesCount
      return {
        questionId: q.id,
        label: q.label,
        type: "yes_no",
        answered: bools.length,
        options: [
          {
            label: "Yes",
            count: yesCount,
            pct: bools.length > 0 ? Math.round((yesCount / bools.length) * 100) : 0,
          },
          {
            label: "No",
            count: noCount,
            pct: bools.length > 0 ? Math.round((noCount / bools.length) * 100) : 0,
          },
        ],
      }
    }

    if (q.type === "single_choice" || q.type === "multi_choice") {
      const counts = new Map<string, number>()
      for (const opt of q.options ?? []) counts.set(opt, 0)
      for (const m of matched) {
        const val = m.answer!.value
        const picks = Array.isArray(val) ? val : typeof val === "string" ? [val] : []
        for (const p of picks) counts.set(p, (counts.get(p) ?? 0) + 1)
      }
      const denom = matched.length
      return {
        questionId: q.id,
        label: q.label,
        type: q.type,
        answered: denom,
        options: [...counts.entries()].map(([label, count]) => ({
          label,
          count,
          pct: denom > 0 ? Math.round((count / denom) * 100) : 0,
        })),
      }
    }

    const samples = matched
      .filter((m) => typeof m.answer!.value === "string" && m.answer!.value.trim().length > 0)
      .slice(0, 12)
      .map((m) => ({
        text: String(m.answer!.value),
        submittedAt: m.response.submittedAt.toISOString(),
        respondent: m.response.respondent.anonymous
          ? "Anonymous"
          : m.response.respondent.name || m.response.respondent.email || "Respondent",
      }))
    return {
      questionId: q.id,
      label: q.label,
      type: q.type,
      answered: matched.length,
      samples,
    }
  })

  const completionPct =
    survey.scanCount > 0
      ? Math.min(100, Math.round((survey.responseCount / survey.scanCount) * 100))
      : null

  return {
    survey,
    stats: {
      totalResponses: Math.max(survey.responseCount, totalResponses),
      scanCount: survey.scanCount,
      completionPct,
      avgRating,
      npsScore,
    },
    breakdowns,
    recentResponses: responses.slice(0, 100),
  }
}

function csvEscape(v: unknown): string {
  const raw = v === null || v === undefined ? "" : String(v)
  const isNumeric = typeof v === "number" || /^-?\d+(\.\d+)?$/.test(raw)
  const s = !isNumeric && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function formatAnswerCell(a: SurveyAnswer | undefined): string | number {
  if (!a || a.value === null || a.value === undefined) return ""
  if (typeof a.value === "boolean") return a.value ? "Yes" : "No"
  if (Array.isArray(a.value)) return a.value.join("; ")
  return a.value
}

export async function exportSurveyResponsesCsv(
  ctx: TenantContext,
  idRaw: ObjectId | string,
): Promise<{ filename: string; csv: string }> {
  assertCan(ctx, "report:export")
  const survey = await getSurvey(ctx, idRaw)
  const list: SurveyResponseDoc[] = await surveyResponses
    .forTenant(ctx)
    .find({ surveyId: survey._id }, { sort: { submittedAt: -1 }, limit: 5000 })

  const headers = [
    "SubmittedAt",
    "Respondent",
    "Email",
    "Phone",
    "OverallRating",
    "NPSScore",
    ...survey.questions.map((q) => q.label),
  ]

  const rows = list.map((r) => [
    r.submittedAt.toISOString(),
    r.respondent.anonymous ? "Anonymous" : (r.respondent.name ?? ""),
    r.respondent.anonymous ? "" : (r.respondent.email ?? ""),
    r.respondent.anonymous ? "" : (r.respondent.phone ?? ""),
    r.overallRating ?? "",
    r.npsScore ?? "",
    ...survey.questions.map((q) => formatAnswerCell(r.answers.find((a) => a.questionId === q.id))),
  ])

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n")

  const slug =
    survey.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "survey"
  return { filename: `${slug}-responses.csv`, csv }
}

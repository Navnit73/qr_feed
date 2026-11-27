import "server-only"
import type { ObjectId } from "mongodb"
import { auth } from "@/server/auth/auth"
import { resolveTenantContext } from "@/server/auth/context"
import { ensureIndexes } from "@/server/db/indexes"
import type { TenantContext } from "@/server/db/tenant-context"
import { createAssignmentRule } from "@/server/modules/assignment"
import {
  completeAudit,
  createAuditFinding,
  createAuditTemplate,
  saveAuditChecklist,
  scheduleAudit,
} from "@/server/modules/audits"
import { createBranch } from "@/server/modules/branches"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { generateMissingQrCodes, listQrCodes } from "@/server/modules/qr-codes"
import { createCapa, createRca, updateRcaAnalysis } from "@/server/modules/rca-capa"
import { createSlaPolicy } from "@/server/modules/sla"
import { createSurvey, submitSurveyResponse } from "@/server/modules/surveys"
import { applyTicketTransition, queryTickets } from "@/server/modules/tickets"
import { SURVEY_TEMPLATES } from "@/lib/survey-templates"
import { members } from "@/server/repositories"

export const DEMO_ADMIN = {
  email: "admin@demo.qrfeed.test",
  password: "DemoPass123!",
  name: "Demo Admin",
}

const DEMO_STAFF = [
  { email: "housekeeping@demo.qrfeed.test", name: "Priya Nair", role: "l1_staff" },
  { email: "supervisor@demo.qrfeed.test", name: "Rohan Mehta", role: "l2_supervisor" },
  { email: "verifier@demo.qrfeed.test", name: "Dr. Kavita Rao", role: "verifier" },
]

type Tree = {
  type: "building" | "floor" | "department" | "location"
  name: string
  code?: string
  children?: Tree[]
}

const HOSPITAL_TREE: Tree[] = [
  {
    type: "building",
    name: "Main Block",
    children: [
      {
        type: "floor",
        name: "Ground Floor",
        children: [
          {
            type: "department",
            name: "Emergency",
            children: [
              { type: "location", name: "Triage Desk", code: "EMG-TRG" },
              { type: "location", name: "Waiting Area", code: "EMG-WAIT" },
            ],
          },
          { type: "location", name: "Reception", code: "GF-REC" },
          { type: "location", name: "Washroom GF", code: "GF-WC" },
        ],
      },
      {
        type: "floor",
        name: "Floor 2",
        children: [
          {
            type: "department",
            name: "General Ward",
            children: [
              { type: "location", name: "Ward A", code: "F2-WDA" },
              { type: "location", name: "Ward B", code: "F2-WDB" },
              { type: "location", name: "Nurses Station", code: "F2-NS" },
            ],
          },
          { type: "location", name: "Washroom F2", code: "F2-WC" },
        ],
      },
    ],
  },
  {
    type: "building",
    name: "OPD Block",
    children: [
      { type: "location", name: "OPD Waiting Hall", code: "OPD-WAIT" },
      { type: "location", name: "Pharmacy", code: "OPD-PHM" },
      { type: "location", name: "Billing Counter", code: "OPD-BIL" },
    ],
  },
]

const CLINIC_TREE: Tree[] = [
  {
    type: "floor",
    name: "Ground Floor",
    children: [
      { type: "location", name: "Front Desk", code: "CL-FD" },
      { type: "location", name: "Consultation Room 1", code: "CL-CR1" },
      { type: "location", name: "Consultation Room 2", code: "CL-CR2" },
      { type: "location", name: "Washroom", code: "CL-WC" },
    ],
  },
]

async function buildTree(
  ctx: TenantContext,
  branchId: ObjectId,
  nodes: Tree[],
  parentId?: ObjectId,
) {
  for (const node of nodes) {
    const loc = await createLocation(ctx, {
      branchId,
      parentId,
      type: node.type,
      name: node.name,
      ...(node.code ? { code: node.code } : {}),
    })
    if (node.children) await buildTree(ctx, branchId, node.children, loc._id)
  }
}

const DEMO_REPORTS = [
  {
    cat: "cleanliness",
    rating: 2,
    description: "Floor is wet near the sink and needs a caution sign.",
    branch: 0,
    flow: "closed" as const,
  },
  {
    cat: "waiting_time",
    rating: 3,
    description: "Waited over 35 minutes at OPD registration.",
    branch: 0,
    flow: "pending_verification" as const,
  },
  {
    cat: "staff_behaviour",
    rating: 5,
    description: "Nurse on duty was very attentive and kind.",
    branch: 0,
    flow: "closed" as const,
  },
  {
    cat: "facilities",
    rating: 2,
    description: "Air conditioning in Ward A is blowing warm air.",
    branch: 0,
    flow: "in_progress" as const,
  },
  {
    cat: "safety",
    rating: 1,
    description: "Exposed cable cover near the emergency waiting exit.",
    urgency: "urgent" as const,
    branch: 0,
    flow: "accepted" as const,
  },
  {
    cat: "billing",
    rating: 3,
    description: "Duplicate lab charge shown on initial estimate.",
    branch: 0,
    flow: "pending_verification" as const,
  },
  {
    cat: "patient_care",
    rating: 5,
    description: "Doctor explained discharge steps very clearly.",
    branch: 1,
    flow: "closed" as const,
  },
  {
    cat: "cleanliness",
    rating: 2,
    description: "Hand sanitiser dispenser empty outside Washroom.",
    branch: 1,
    flow: "in_progress" as const,
  },
  {
    cat: "facilities",
    rating: 3,
    description: "Queue display screen flickering in Consultation Room 1.",
    branch: 1,
    flow: "assigned" as const,
  },
  {
    cat: "waiting_time",
    rating: 2,
    description: "Pharmacy counter line moving slowly at peak hour.",
    branch: 0,
    flow: "new" as const,
  },
]

let inflightSeed: Promise<{ email: string; password: string; tenantId: string }> | null = null

/**
 * Ensures the rich interactive Demo Workspace ("Sunrise Hospital") exists.
 * Idempotent and concurrency-safe: powers both `pnpm db:seed` and One-Click Demo Login on `/sign-in`.
 */
export async function ensureDemoWorkspace(): Promise<{
  email: string
  password: string
  tenantId: string
}> {
  if (inflightSeed) return inflightSeed

  const run = async () => {
    // Check if demo admin already has an active membership (fast path: 1 indexed query).
    const existingMember = await members
      .unscoped()
      .findOne({ email: DEMO_ADMIN.email, status: "active" }, { projection: { tenantId: 1 } })
    if (existingMember) {
      return {
        email: DEMO_ADMIN.email,
        password: DEMO_ADMIN.password,
        tenantId: existingMember.tenantId.toHexString(),
      }
    }

    await ensureIndexes()

    // Create or sign in demo admin user via Better Auth.
    let userId: string
    try {
      const signedUp = await auth().api.signUpEmail({ body: DEMO_ADMIN })
      userId = signedUp.user.id
    } catch {
      const signedIn = await auth().api.signInEmail({
        body: { email: DEMO_ADMIN.email, password: DEMO_ADMIN.password },
      })
      userId = signedIn.user.id
    }

    const { tenant, branch } = await createOrganization(
      { id: userId, email: DEMO_ADMIN.email, name: DEMO_ADMIN.name },
      {
        orgName: "Sunrise Hospital",
        industry: "hospital",
        branchName: "Delhi Central",
        timezone: "Asia/Kolkata",
      },
    )

    const ctx = (await resolveTenantContext(userId, tenant._id))!
    const second = await createBranch(ctx, { name: "Noida Clinic", timezone: "Asia/Kolkata" })

    // Add demo team members so assignment rules, workload charts & multi-role views look real.
    const staffIds: string[] = []
    for (const s of DEMO_STAFF) {
      try {
        const res = await auth().api.signUpEmail({
          body: { email: s.email, password: DEMO_ADMIN.password, name: s.name },
        })
        await members.forTenant(ctx).insertOne({
          userId: res.user.id,
          email: s.email,
          name: s.name,
          roles: [s.role],
          branchIds: [branch._id, second._id],
          status: "active",
        })
        staffIds.push(res.user.id)
      } catch {
        // Ignore if staff email already exists from a partial run
      }
    }

    await Promise.all([
      buildTree(ctx, branch._id, HOSPITAL_TREE),
      buildTree(ctx, second._id, CLINIC_TREE),
    ])

    await Promise.all([
      generateMissingQrCodes(ctx, branch._id),
      generateMissingQrCodes(ctx, second._id),
    ])

    await createSlaPolicy(ctx, {
      name: "Hospital Standard SLA",
      businessHoursMode: "24x7",
      appliesTo: {},
      levels: [
        {
          level: 1,
          acceptWithinMin: 15,
          resolveWithinMin: 180,
          escalateAfterMin: 180,
          targetRole: "l1_staff",
          action: "both",
        },
        {
          level: 2,
          acceptWithinMin: 30,
          resolveWithinMin: 300,
          escalateAfterMin: 300,
          targetRole: "l2_supervisor",
          action: "both",
        },
        {
          level: 3,
          acceptWithinMin: 60,
          resolveWithinMin: 480,
          escalateAfterMin: 480,
          targetRole: "l3_manager",
          action: "both",
        },
      ],
    })

    if (staffIds.length > 0) {
      await createAssignmentRule(ctx, {
        name: "Default Floor Auto-Assign",
        priority: 10,
        active: true,
        conditions: {},
        strategy: "round_robin",
        userIds: [userId, staffIds[0]],
      })
    }

    const [cats, codesB1, codesB2] = await Promise.all([
      listCategories(ctx, "hospital"),
      listQrCodes(ctx, branch._id),
      listQrCodes(ctx, second._id),
    ])
    const byKey = new Map(cats.map((c) => [c.key, c._id.toHexString()]))

    const createdTicketIds: string[] = []
    for (const [i, r] of DEMO_REPORTS.entries()) {
      const pool = r.branch === 0 ? codesB1 : codesB2
      const qr = pool[i % pool.length]
      if (!qr) continue
      const sub = await submitFeedback(
        qr.shortCode,
        {
          categoryId: byKey.get(r.cat) ?? byKey.get("other"),
          rating: r.rating,
          description: r.description,
          urgency: r.urgency ?? "normal",
          consent: "on",
          ...(i % 3 === 0 ? { name: "Asha Verma", email: "asha@example.com" } : {}),
        },
        { ip: "127.0.0.1", limits: null },
      )
      const ticket = (await queryTickets(ctx, { q: sub.number })).items[0]
      if (!ticket) continue
      createdTicketIds.push(ticket._id.toHexString())

      // Advance tickets into realistic lifecycle stages so My Work, Verifications, Kanban & MTTR shine.
      if (r.flow === "accepted") {
        await applyTicketTransition(ctx, ticket._id, { type: "accept" }).catch(() => {})
      } else if (r.flow === "in_progress") {
        await applyTicketTransition(ctx, ticket._id, { type: "accept" }).catch(() => {})
        await applyTicketTransition(ctx, ticket._id, { type: "start" }).catch(() => {})
      } else if (r.flow === "pending_verification") {
        await applyTicketTransition(ctx, ticket._id, { type: "accept" }).catch(() => {})
        await applyTicketTransition(ctx, ticket._id, { type: "start" }).catch(() => {})
        await applyTicketTransition(ctx, ticket._id, {
          type: "submit",
          note: "Resolved on floor and double-checked with shift supervisor.",
        }).catch(() => {})
      } else if (r.flow === "closed") {
        await applyTicketTransition(ctx, ticket._id, { type: "accept" }).catch(() => {})
        await applyTicketTransition(ctx, ticket._id, { type: "start" }).catch(() => {})
        await applyTicketTransition(ctx, ticket._id, {
          type: "submit",
          note: "Cleaned, dried, and verified safe.",
        }).catch(() => {})
        await applyTicketTransition(ctx, ticket._id, {
          type: "verify_close",
          note: "Verified on inspection.",
        }).catch(() => {})
      }
    }

    // Seed a complete RCA with 5 Whys, Fishbone 6M, and CAPA actions.
    const rca = await createRca(ctx, {
      title: "Recurring wet floors outside Emergency washrooms",
      method: "fishbone",
      problemStatement:
        "Multiple slip hazards reported near Ground Floor washrooms during peak OPD hours.",
      sourceTicketIds: createdTicketIds.slice(0, 1),
    })
    await updateRcaAnalysis(ctx, rca._id, {
      method: "fishbone",
      problemStatement:
        "Multiple slip hazards reported near Ground Floor washrooms during peak OPD hours.",
      whys: [
        "Floor stayed damp after scheduled morning mop",
        "Dry-pass mop step was skipped during peak footfall",
        "Only one microfibre dry mop was stocked for Ground Floor",
      ],
      fishbone: {
        man: ["Peak-hour shift handover rushed cleaning sign-off"],
        machine: ["Air blower fan out of service"],
        method: ["No mandatory dry-pass check in housekeeping SOP"],
        material: ["Shortage of microfibre dry mops"],
        measurement: ["No hourly floor dryness check"],
        environment: ["High OPD footfall near Emergency entrance"],
      },
      contributingFactors: ["Equipment shortage", "Missing dry-pass SOP step"],
      rootCause:
        "Insufficient dry-mop stock and missing post-mop sign-off check during peak OPD hours.",
    })
    await createCapa(ctx, {
      rcaId: rca._id.toHexString(),
      title: "Add dry-pass signage & hourly inspection log",
      type: "preventive",
      effectivenessDueDays: 30,
      effectivenessMethod: "30-day zero recurrence review",
      actions: [
        {
          title: "Install wall-mounted caution cones at GF and F2 washrooms",
          ownerId: userId,
          dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
        {
          title: "Stock 4 additional microfibre dry mops per floor",
          ownerId: staffIds[0] ?? userId,
          dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        },
      ],
    })

    // Seed Audit template + 1 completed audit with a finding + 1 upcoming monthly recurring audit.
    const tpl = await createAuditTemplate(ctx, {
      name: "NABH Hygiene & Safety Walk",
      standard: "NABH 5th Ed.",
      items: [
        {
          clause: "HIC.1",
          section: "Infection Control",
          question: "Hand rub dispensers stocked and functional?",
        },
        {
          clause: "FMS.4",
          section: "Facility Safety",
          question: "Wet-floor signage present during cleaning?",
        },
        {
          clause: "CQI.3",
          section: "Quality",
          question: "Previous CAPA actions verified on floor?",
        },
      ],
    })
    const pastAudit = await scheduleAudit(ctx, {
      branchId: branch._id.toHexString(),
      templateId: tpl._id.toHexString(),
      title: "Monthly NABH Walk — Delhi Central",
      recurrence: "monthly",
      scheduledAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    })
    await saveAuditChecklist(ctx, pastAudit._id, {
      results: [
        {
          itemId: pastAudit.checklistResults[0].itemId,
          result: "pass",
          note: "All dispensers >70% full",
          evidence: [],
        },
        {
          itemId: pastAudit.checklistResults[1].itemId,
          result: "fail",
          note: "Signage missing near GF Washroom",
          evidence: [],
        },
        {
          itemId: pastAudit.checklistResults[2].itemId,
          result: "pass",
          note: "Dry mops stocked",
          evidence: [],
        },
      ],
    })
    await createAuditFinding(ctx, pastAudit._id, {
      severity: "major",
      clause: "FMS.4",
      description: "Wet-floor caution stand not deployed during peak OPD corridor cleaning.",
      evidence: [],
    })
    await completeAudit(ctx, pastAudit._id)

    // Seed a ready-to-scan Patient Satisfaction Survey with sample patient responses.
    const patientTpl = SURVEY_TEMPLATES[0]
    const demoSurvey = await createSurvey(ctx, {
      title: patientTpl.title,
      description: patientTpl.description,
      branchId: branch._id.toHexString(),
      collectContact: patientTpl.collectContact,
      thankYouMessage: patientTpl.thankYouMessage,
      questions: patientTpl.questions,
    })
    const sampleSurveyResponses = [
      {
        q_q_overall: "5",
        q_q_nps: "10",
        q_q_dept: "OPD / Consultation",
        q_q_care: "5",
        q_q_clean: "yes",
        q_q_highlights: ["Polite & attentive staff", "Clear explanation by doctor"],
        q_q_comments: "Dr. Rao explained every test clearly and the nurses were very warm.",
        name: "Ananya Deshmukh",
        consent: "on",
      },
      {
        q_q_overall: "4",
        q_q_nps: "9",
        q_q_dept: "Diagnostics & Lab",
        q_q_care: "5",
        q_q_clean: "yes",
        q_q_highlights: ["Clean & hygienic premises", "Short waiting time"],
        q_q_comments: "Sample collection was quick and painless.",
        consent: "on",
      },
      {
        q_q_overall: "3",
        q_q_nps: "6",
        q_q_dept: "Pharmacy",
        q_q_care: "4",
        q_q_clean: "yes",
        q_q_highlights: ["Polite & attentive staff"],
        q_q_comments:
          "Pharmacy counter had a 25-minute queue around noon; extra counter would help.",
        name: "Rakesh Malhotra",
        consent: "on",
      },
    ]
    for (const resp of sampleSurveyResponses) {
      await submitSurveyResponse(demoSurvey.shortCode, resp, { ip: "127.0.0.1", limits: null })
    }

    return {
      email: DEMO_ADMIN.email,
      password: DEMO_ADMIN.password,
      tenantId: tenant._id.toHexString(),
    }
  }

  inflightSeed = run().finally(() => {
    inflightSeed = null
  })
  return inflightSeed
}

import { describe, expect, it } from "vitest"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import { createQrCode } from "@/server/modules/qr-codes"
import {
  createCapa,
  createRca,
  getRcaDetail,
  signRcaApproval,
  updateCapaActionStatus,
  updateRcaAnalysis,
  verifyCapaEffectiveness,
} from "@/server/modules/rca-capa"
import { queryTickets } from "@/server/modules/tickets"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("Phase 6 RCA & CAPA module (F-6.1–F-6.7)", () => {
  it("converts a ticket to RCA, runs 5 Whys & Fishbone, CAPA actions, recurrence detection, and 3-stage approval", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "admin-rca", email: "admin@rca.test", name: "Dr. Meera" },
      {
        orgName: "CarePlus Hospital",
        industry: "hospital",
        branchName: "Main",
        timezone: "Asia/Kolkata",
      },
    )
    const ctx = (await resolveTenantContext("admin-rca", tenant._id))!
    const loc = await createLocation(ctx, { branchId: branch._id, type: "location", name: "OT-2" })
    const qr = await createQrCode(ctx, loc._id)
    const cats = await listCategories(ctx, "hospital")

    const sub = await submitFeedback(
      qr.shortCode,
      {
        categoryId: cats[0]._id.toHexString(),
        description: "Slippery floor after wash",
        urgency: "urgent",
        consent: "on",
      },
      { ip: "127.0.0.1", limits: null },
    )
    const ticket = (await queryTickets(ctx, { q: sub.number })).items[0]

    // Convert ticket to RCA
    const rca = await createRca(ctx, {
      title: "Recurring wet floor outside OT-2",
      method: "5why",
      problemStatement: "Water pooled outside OT-2 after shift mopping.",
      sourceTicketIds: [ticket._id.toHexString()],
    })
    expect(rca.number).toMatch(/^RCA-\d{4}-000001$/)

    // Ticket is now linked back to RCA
    const linkedTicket = (await queryTickets(ctx, { q: sub.number })).items[0]
    expect(linkedTicket.rcaId?.equals(rca._id)).toBe(true)

    // Update 5 Whys, Fishbone 6M & Root Cause
    await updateRcaAnalysis(ctx, rca._id, {
      method: "fishbone",
      problemStatement: "Water pooled outside OT-2 after shift mopping.",
      whys: [
        "Floor was still wet after mopping",
        "Dry mop pass was skipped",
        "Only one dry mop available on Floor 2",
      ],
      fishbone: {
        man: ["New shift staff not briefed on dry-pass SOP"],
        machine: ["Floor dryer out of service"],
        method: ["No post-mop sign-off checklist"],
        material: ["Shortage of microfibre dry mops"],
        measurement: ["No slip-check audit"],
        environment: ["High humidity outside OT-2"],
      },
      contributingFactors: ["Equipment shortage", "Missing sign-off"],
      rootCause: "Lack of dry-mop supply and post-cleaning sign-off checklist.",
    })

    // Create CAPA with corrective & preventive actions
    const capa = await createCapa(ctx, {
      rcaId: rca._id.toHexString(),
      title: "OT-2 dry-pass protocol & spare equipment",
      type: "corrective",
      effectivenessDueDays: 30,
      effectivenessMethod: "30-day zero recurrence + slip audit",
      actions: [
        {
          title: "Stock 4 dry mops on Floor 2",
          ownerId: "admin-rca",
          dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        },
        {
          title: "Train all housekeeping staff on dry-pass SOP",
          ownerId: "admin-rca",
          dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        },
      ],
    })
    expect(capa.number).toMatch(/^CAPA-\d{4}-000001$/)
    expect(capa.actions).toHaveLength(2)

    // Complete CAPA actions
    for (const act of capa.actions) {
      await updateCapaActionStatus(ctx, capa._id, act.id, "completed", ["ev-1"])
    }

    // Verify effectiveness (auto-checks recurrence count at same location/category)
    const verifiedCapa = await verifyCapaEffectiveness(ctx, capa._id, {
      recurred: false,
      result: "effective",
      evidence: "Zero slip incidents in 30 days",
    })
    expect(verifiedCapa.status).toBe("verified")
    expect(verifiedCapa.effectivenessCheck?.suggestedRecurrenceCount).toBe(0)

    // 3-stage e-signature approval: owner -> reviewer -> approver
    await signRcaApproval(ctx, rca._id, {
      stage: "owner",
      decision: "approved",
      comment: "Analysis complete",
    })
    await signRcaApproval(ctx, rca._id, {
      stage: "reviewer",
      decision: "approved",
      comment: "Root cause verified",
    })
    const approved = await signRcaApproval(ctx, rca._id, {
      stage: "approver",
      decision: "approved",
      comment: "Approved for closure",
    })
    expect(approved.status).toBe("approved")
    expect(approved.approvals).toHaveLength(3)

    const detail = await getRcaDetail(ctx, rca._id)
    expect(detail.capas).toHaveLength(1)
    expect(detail.linkedTickets).toHaveLength(1)

    const chain = await verifyChain(ctx)
    expect(chain.ok).toBe(true)
  })
})

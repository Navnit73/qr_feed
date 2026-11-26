import { describe, expect, it } from "vitest"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import {
  completeAudit,
  convertFindingToRca,
  createAuditFinding,
  createAuditTemplate,
  getAuditDetail,
  saveAuditChecklist,
  scheduleAudit,
} from "@/server/modules/audits"
import { createOrganization } from "@/server/modules/onboarding"
import { getRcaDetail } from "@/server/modules/rca-capa"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("Phase 7 standalone audit module (F-7.1–F-7.4)", () => {
  it("runs a checklist audit with no QR, scores it, logs findings, and converts finding to RCA/CAPA", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "auditor-1", email: "auditor@a.test", name: "Priya Auditor" },
      {
        orgName: "Precision Plant",
        industry: "manufacturing",
        branchName: "Plant 1",
        timezone: "Asia/Kolkata",
      },
    )
    const ctx = (await resolveTenantContext("auditor-1", tenant._id))!

    const tpl = await createAuditTemplate(ctx, {
      name: "ISO 9001 Shopfloor Walk",
      standard: "ISO 9001:2015",
      items: [
        {
          clause: "8.5.1",
          section: "Production",
          question: "Work instructions displayed at station?",
        },
        { clause: "7.1.5", section: "Calibration", question: "Gauges within calibration date?" },
        { clause: "10.2", section: "CAPA", question: "Non-conforming items quarantined?" },
      ],
    })
    expect(tpl.items).toHaveLength(3)

    const audit = await scheduleAudit(ctx, {
      branchId: branch._id.toHexString(),
      templateId: tpl._id.toHexString(),
      title: "Q4 Plant 1 Internal Audit",
      recurrence: "quarterly",
      scheduledAt: new Date().toISOString(),
    })
    expect(audit.number).toMatch(/^AUD-\d{4}-000001$/)

    // Execute checklist (2 pass, 1 fail -> 67%)
    await saveAuditChecklist(ctx, audit._id, {
      results: [
        { itemId: tpl.items[0].id, result: "pass", note: "All SOPs laminated" },
        { itemId: tpl.items[1].id, result: "fail", note: "Micrometer M-04 overdue by 6 days" },
        { itemId: tpl.items[2].id, result: "pass" },
      ],
    })

    const finding = await createAuditFinding(ctx, audit._id, {
      severity: "major",
      clause: "7.1.5",
      description: "Micrometer M-04 used past calibration expiry.",
    })
    expect(finding.severity).toBe("major")

    // Convert audit finding directly to RCA (standalone, zero QR involved!)
    const rca = await convertFindingToRca(ctx, finding._id)
    expect(rca.number).toMatch(/^RCA-\d{4}-000001$/)
    const rcaDetail = await getRcaDetail(ctx, rca._id)
    expect(rcaDetail.rca.sourceAuditFindingId?.equals(finding._id)).toBe(true)

    const completed = await completeAudit(ctx, audit._id)
    expect(completed.status).toBe("completed")
    expect(completed.scorePct).toBe(67)

    const detail = await getAuditDetail(ctx, audit._id)
    expect(detail.findings).toHaveLength(1)
    expect(detail.findings[0].status).toBe("rca_created")

    const chain = await verifyChain(ctx)
    expect(chain.ok).toBe(true)
  })
})

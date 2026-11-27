import { describe, expect, it } from "vitest"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { createOrganization } from "@/server/modules/onboarding"
import {
  createSurvey,
  exportSurveyResponsesCsv,
  getSurveyDetailWithAnalytics,
  listSurveys,
  recordSurveyScan,
  regenerateSurveyQr,
  resolvePublicSurvey,
  setSurveyStatus,
  submitSurveyResponse,
  updateSurvey,
} from "@/server/modules/surveys"
import { SURVEY_TEMPLATES } from "@/lib/survey-templates"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("Custom Surveys & QR Feedback Forms", () => {
  it("creates a Patient Satisfaction Survey, scans & validates public responses, computes NPS/analytics, regenerates QR, and exports CSV", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "surv-admin", email: "admin@hospital.test", name: "Hospital Admin" },
      {
        orgName: "Metro Care Hospital",
        industry: "hospital",
        branchName: "Main Campus",
        timezone: "Asia/Kolkata",
      },
    )
    const ctx = (await resolveTenantContext("surv-admin", tenant._id))!
    const tpl = SURVEY_TEMPLATES[0]

    // Create custom survey from Patient Satisfaction template
    const survey = await createSurvey(ctx, {
      title: tpl.title,
      description: tpl.description,
      branchId: branch._id.toHexString(),
      collectContact: true,
      thankYouMessage: tpl.thankYouMessage,
      questions: tpl.questions,
    })
    expect(survey.shortCode).toHaveLength(10)
    expect(survey.status).toBe("active")
    expect(await listSurveys(ctx)).toHaveLength(1)

    // Resolve public QR & record scans
    const pub = await resolvePublicSurvey(survey.shortCode)
    expect(pub).not.toBeNull()
    expect(pub?.title).toBe("Patient Satisfaction Survey")
    expect(pub?.tenantName).toBe("Metro Care Hospital")
    await recordSurveyScan(pub!.surveyId)
    await recordSurveyScan(pub!.surveyId)
    await recordSurveyScan(pub!.surveyId)

    // Validation catches missing required fields & invalid choices
    const bad = await submitSurveyResponse(
      survey.shortCode,
      {
        q_q_overall: "9",
        q_q_nps: "15",
        q_q_dept: "NotARealDept",
        consent: "on",
      },
      { ip: "198.51.100.1", limits: null },
    ).catch((err) => err)
    expect(bad.code).toBe("VALIDATION")
    expect(Object.keys(bad.details)).toEqual(
      expect.arrayContaining(["q_q_overall", "q_q_nps", "q_q_dept", "q_q_care", "q_q_clean"]),
    )

    // Submit 2 valid patient responses (1 Promoter NPS=10, 1 Detractor NPS=5 -> NPS = 0)
    const r1 = await submitSurveyResponse(
      survey.shortCode,
      {
        q_q_overall: "5",
        q_q_nps: "10",
        q_q_dept: "OPD / Consultation",
        q_q_care: "5",
        q_q_clean: "yes",
        q_q_highlights: ["Polite & attentive staff", "Short waiting time"],
        q_q_comments: "Great experience from check-in to checkout.",
        name: "Meera Nair",
        email: "meera@example.com",
        consent: "on",
      },
      { ip: "198.51.100.2", limits: null },
    )
    expect(r1.responseId).toBeTruthy()

    await submitSurveyResponse(
      survey.shortCode,
      {
        q_q_overall: "2",
        q_q_nps: "5",
        q_q_dept: "Pharmacy",
        q_q_care: "3",
        q_q_clean: "no",
        q_q_comments: '=HYPERLINK("http://evil.test") wait was too long',
        consent: "on",
      },
      { ip: "198.51.100.3", limits: null },
    )

    // Verify analytics & NPS
    const detail = await getSurveyDetailWithAnalytics(ctx, survey._id)
    expect(detail.stats.totalResponses).toBe(2)
    expect(detail.stats.scanCount).toBe(3)
    expect(detail.stats.completionPct).toBe(67)
    // Response 1 ratings avg = (5+5)/2 = 5.0; Response 2 ratings avg = (2+3)/2 = 2.5 -> overall avg = 3.8
    expect(detail.stats.avgRating).toBe(3.8)
    expect(detail.stats.npsScore).toBe(0)

    const npsBreakdown = detail.breakdowns.find((b) => b.type === "nps")
    expect(npsBreakdown).toMatchObject({ promoters: 1, passives: 0, detractors: 1, nps: 0 })

    // CSV export includes formula-neutralised text & all answers
    const { filename, csv } = await exportSurveyResponsesCsv(ctx, survey._id)
    expect(filename).toBe("patient-satisfaction-survey-responses.csv")
    expect(csv).toContain("Meera Nair")
    expect(csv).toContain("Polite & attentive staff; Short waiting time")
    expect(csv).toContain("'=HYPERLINK")

    // Pausing survey blocks new submissions; activating re-enables them
    await setSurveyStatus(ctx, survey._id, "paused")
    await expect(
      submitSurveyResponse(
        survey.shortCode,
        {
          q_q_overall: "4",
          q_q_nps: "8",
          q_q_dept: "Emergency",
          q_q_care: "4",
          q_q_clean: "yes",
          consent: "on",
        },
        { ip: "198.51.100.4", limits: null },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })

    await setSurveyStatus(ctx, survey._id, "active")

    // Editing questions & regenerating QR code invalidates old shortCode while keeping responses
    const edited = await updateSurvey(ctx, survey._id, {
      title: "Updated Patient Survey",
      description: "Revised intro",
      branchId: branch._id.toHexString(),
      collectContact: false,
      thankYouMessage: "Thanks!",
      questions: tpl.questions.slice(0, 2),
    })
    expect(edited.title).toBe("Updated Patient Survey")

    const oldCode = survey.shortCode
    const regenerated = await regenerateSurveyQr(ctx, survey._id)
    expect(regenerated.shortCode).not.toBe(oldCode)
    expect(await resolvePublicSurvey(oldCode)).toBeNull()
    expect((await resolvePublicSurvey(regenerated.shortCode))?.title).toBe("Updated Patient Survey")

    // Audit chain stays intact across all mutations
    expect((await verifyChain(ctx)).ok).toBe(true)

    // Duplicate choice options fail validation instead of collapsing to 1 option
    await expect(
      createSurvey(ctx, {
        title: "Broken Choices",
        collectContact: false,
        questions: [
          {
            id: "dup",
            type: "single_choice",
            label: "Pick one",
            required: true,
            options: ["Same", "Same"],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" })

    // Branch-scoped admin can read org-wide surveys but cannot edit/pause/regenerate them
    const orgWide = await createSurvey(ctx, {
      title: "Org-Wide Pulse",
      collectContact: false,
      questions: [{ id: "q1", type: "rating", label: "Rate us", required: true }],
    })
    const branchAdminCtx = { ...ctx, branchScope: [branch._id] }
    expect((await listSurveys(branchAdminCtx)).some((s) => s._id.equals(orgWide._id))).toBe(true)
    await expect(setSurveyStatus(branchAdminCtx, orgWide._id, "paused")).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(regenerateSurveyQr(branchAdminCtx, orgWide._id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })
})

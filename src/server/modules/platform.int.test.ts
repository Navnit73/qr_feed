import { describe, expect, it } from "vitest"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { listCategories } from "@/server/modules/categories"
import { submitFeedback } from "@/server/modules/intake"
import { createLocation } from "@/server/modules/locations"
import { createOrganization } from "@/server/modules/onboarding"
import {
  anonymiseOldReporterData,
  authenticateApiKey,
  changeTenantPlan,
  createApiKey,
  createWebhook,
  exportTenantData,
  getBillingSummary,
  revokeApiKey,
  signWebhookPayload,
} from "@/server/modules/platform"
import { createQrCode } from "@/server/modules/qr-codes"
import { applyTicketTransition, queryTickets } from "@/server/modules/tickets"
import { setupTestDb } from "@/test/db"

setupTestDb()

describe("Phase 9 billing, API keys, webhooks & data governance (F-9.1–F-9.5)", () => {
  it("handles plan upgrades with metering, API key auth/revocation, webhooks, and GDPR export/anonymisation", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "owner-p9", email: "owner@p9.test", name: "Owner P9" },
      {
        orgName: "Enterprise Mall",
        industry: "mall",
        branchName: "Flagship",
        timezone: "Asia/Kolkata",
      },
    )
    const ctx = (await resolveTenantContext("owner-p9", tenant._id))!

    // F-9.1 / F-9.2: Billing & upgrade
    const before = await getBillingSummary(ctx)
    expect(before.plan).toBe("trial")
    await changeTenantPlan(ctx, "business", "sandbox")
    const after = await getBillingSummary(ctx)
    expect(after.plan).toBe("business")
    expect(after.limits.branches).toBe(10)
    expect(after.invoices.length).toBeGreaterThanOrEqual(1)

    // F-9.4: API Key create -> authenticate -> revoke
    const createdKey = await createApiKey(ctx, {
      name: "BI Sync",
      scopes: ["ticket:read", "location:read"],
    })
    expect(createdKey.rawKey).toMatch(/^qrf_/)
    const apiCtx = await authenticateApiKey(createdKey.rawKey)
    expect(apiCtx?.tenantId.equals(tenant._id)).toBe(true)
    expect(apiCtx?.permissions.has("ticket:read")).toBe(true)
    expect(apiCtx?.permissions.has("ticket:close")).toBe(false)

    await revokeApiKey(ctx, createdKey.doc._id)
    expect(await authenticateApiKey(createdKey.rawKey)).toBeNull()

    // F-9.4: Webhook creation & HMAC signature
    const wh = await createWebhook(ctx, {
      name: "Ops Slack Bridge",
      url: "https://hooks.example.test/qrfeed",
      events: ["ticket.created", "sla.escalated"],
    })
    expect(wh.secret).toMatch(/^whsec_/)
    const sig = signWebhookPayload(wh.secret, '{"event":"ticket.created"}')
    expect(sig).toMatch(/^[a-f0-9]{64}$/)

    // F-9.5: GDPR export & reporter anonymisation
    const loc = await createLocation(ctx, {
      branchId: branch._id,
      type: "location",
      name: "Food Court",
    })
    const qr = await createQrCode(ctx, loc._id)
    const cats = await listCategories(ctx, "mall")
    const sub = await submitFeedback(
      qr.shortCode,
      {
        categoryId: cats[0]._id.toHexString(),
        description: "Spill near table 4",
        name: "Rohan Guest",
        email: "rohan@private.test",
        consent: "on",
      },
      { ip: "127.0.0.1", limits: null },
    )
    const t = (await queryTickets(ctx, { q: sub.number })).items[0]
    await applyTicketTransition(ctx, t._id, { type: "accept" })
    await applyTicketTransition(ctx, t._id, { type: "submit", note: "Mopped" })
    await applyTicketTransition(ctx, t._id, { type: "verify_close" })

    const bundle = await exportTenantData(ctx)
    expect(bundle.tenant.name).toBe("Enterprise Mall")
    expect(bundle.tickets).toHaveLength(1)

    const anonCount = await anonymiseOldReporterData(ctx, 0)
    expect(anonCount).toBe(1)
    const afterAnon = (await queryTickets(ctx, { q: sub.number })).items[0]
    expect(afterAnon.reporter.anonymous).toBe(true)
    expect(afterAnon.reporter.email).toBeUndefined()

    expect((await verifyChain(ctx)).ok).toBe(true)
  })
})

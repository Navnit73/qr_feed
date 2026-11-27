import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { ApiError } from "@/lib/api/errors"
import { verifyChain } from "@/server/audit/audit-log"
import { resolveTenantContext } from "@/server/auth/context"
import { createBranch } from "@/server/modules/branches"
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
  verifyStripeSignature,
} from "@/server/modules/platform"
import { createQrCode } from "@/server/modules/qr-codes"
import { applyTicketTransition, queryTickets } from "@/server/modules/tickets"
import { setupTestDb, testContext } from "@/test/db"

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

  it("blocks SSRF webhook URLs, enterprise self-upgrades, invalid Stripe signatures, and cross-branch API keys", async () => {
    const { tenant, branch } = await createOrganization(
      { id: "owner-sec", email: "owner@sec.test", name: "Owner Sec" },
      { orgName: "Sec Org", industry: "other", branchName: "HQ", timezone: "UTC" },
    )
    const ctx = (await resolveTenantContext("owner-sec", tenant._id))!
    const b2 = await createBranch(ctx, { name: "Annex", timezone: "UTC" })

    // SSRF webhook targets blocked
    for (const badUrl of [
      "http://example.com/hook",
      "https://127.0.0.1/hook",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost:8443/hook",
    ]) {
      await expect(
        createWebhook(ctx, { name: "Bad", url: badUrl, events: ["ticket.created"] }),
      ).rejects.toMatchObject({ code: "VALIDATION" } satisfies Partial<ApiError>)
    }

    // Free self-upgrade to enterprise is rejected
    await expect(changeTenantPlan(ctx, "enterprise", "sandbox")).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<ApiError>)

    // Stripe signature verification (valid, wrong secret, stale timestamp)
    const body = JSON.stringify({ event: "plan.updated" })
    const secret = "whsec_test_secret_1234"
    const nowSec = Math.floor(Date.now() / 1000)
    const sig = createHmac("sha256", secret).update(`${nowSec}.${body}`).digest("hex")
    expect(verifyStripeSignature(secret, body, `t=${nowSec},v1=${sig}`)).toBe(true)
    expect(verifyStripeSignature(secret, body, `t=${nowSec},v1=${"0".repeat(64)}`)).toBe(false)
    const staleSec = nowSec - 600
    const staleSig = createHmac("sha256", secret).update(`${staleSec}.${body}`).digest("hex")
    expect(verifyStripeSignature(secret, body, `t=${staleSec},v1=${staleSig}`)).toBe(false)

    // Branch-scoped actor's API key inherits creator's branchScope
    const branchCtx = testContext({
      tenantId: tenant._id,
      actorId: "u-branch-sec",
      roles: ["branch_admin"],
      branchScope: [branch._id],
      permissions: new Set(["settings:manage", "ticket:read"]),
    })
    const scopedKey = await createApiKey(branchCtx, {
      name: "HQ Key",
      scopes: ["ticket:read"],
    })
    const apiCtx = await authenticateApiKey(scopedKey.rawKey)
    expect(apiCtx?.branchScope).not.toBe("all")
    expect(
      Array.isArray(apiCtx?.branchScope) && apiCtx.branchScope.some((id) => id.equals(b2._id)),
    ).toBe(false)
  })
})

import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { env } from "@/server/env"
import { verifyHmacSignature } from "@/server/modules/platform"
import { PLAN_CATALOG, setTenantLimits, type PlanKey } from "@/server/modules/tenants"

/**
 * Stripe / Razorpay billing webhook receiver (F-9.2).
 * Verifies HMAC signature when STRIPE_WEBHOOK_SECRET or RAZORPAY_KEY_SECRET is set.
 */
export const POST = withApi(async (req: Request) => {
  const rawBody = await req.text()
  const e = env()
  const sig = req.headers.get("x-razorpay-signature") ?? req.headers.get("stripe-signature") ?? ""
  const secret = e.RAZORPAY_KEY_SECRET ?? e.STRIPE_WEBHOOK_SECRET
  if (secret && !verifyHmacSignature(secret, rawBody, sig)) {
    throw new ApiError("FORBIDDEN", "Invalid webhook signature.")
  }

  const event = JSON.parse(rawBody || "{}") as {
    tenantId?: string
    plan?: PlanKey
    type?: string
  }
  if (
    event.tenantId &&
    ObjectId.isValid(event.tenantId) &&
    event.plan &&
    PLAN_CATALOG[event.plan]
  ) {
    await setTenantLimits({
      actorId: "billing-webhook",
      tenantId: new ObjectId(event.tenantId),
      plan: event.plan,
      limits: PLAN_CATALOG[event.plan].limits,
    })
  }
  return ok({ received: true, type: event.type ?? "unknown" })
})

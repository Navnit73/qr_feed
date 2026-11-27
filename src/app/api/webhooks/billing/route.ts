import { ObjectId } from "mongodb"
import { ApiError } from "@/lib/api/errors"
import { ok, withApi } from "@/lib/api/response"
import { env } from "@/server/env"
import {
  applyBillingWebhookPlan,
  verifyHmacSignature,
  verifyStripeSignature,
} from "@/server/modules/platform"
import { PLAN_CATALOG, type PlanKey } from "@/server/modules/tenants"

/**
 * Stripe / Razorpay billing webhook receiver (F-9.2).
 * Fails closed unless a matching provider webhook secret is configured and verified.
 */
export const POST = withApi(async (req: Request) => {
  const rawBody = await req.text()
  const e = env()
  const razorpaySig = req.headers.get("x-razorpay-signature")
  const stripeSig = req.headers.get("stripe-signature")

  let provider: "stripe" | "razorpay" | null = null
  if (stripeSig) {
    if (
      !e.STRIPE_WEBHOOK_SECRET ||
      !verifyStripeSignature(e.STRIPE_WEBHOOK_SECRET, rawBody, stripeSig)
    ) {
      throw new ApiError("FORBIDDEN", "Invalid Stripe webhook signature.")
    }
    provider = "stripe"
  } else if (razorpaySig) {
    if (
      !e.RAZORPAY_KEY_SECRET ||
      !verifyHmacSignature(e.RAZORPAY_KEY_SECRET, rawBody, razorpaySig)
    ) {
      throw new ApiError("FORBIDDEN", "Invalid Razorpay webhook signature.")
    }
    provider = "razorpay"
  } else {
    throw new ApiError("FORBIDDEN", "Missing or unconfigured billing webhook signature.")
  }

  let event: { tenantId?: string; plan?: PlanKey; type?: string }
  try {
    event = JSON.parse(rawBody || "{}") as { tenantId?: string; plan?: PlanKey; type?: string }
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid JSON payload.")
  }

  if (
    event.tenantId &&
    ObjectId.isValid(event.tenantId) &&
    event.plan &&
    Object.hasOwn(PLAN_CATALOG, event.plan)
  ) {
    await applyBillingWebhookPlan(new ObjectId(event.tenantId), event.plan, provider)
  }
  return ok({ received: true, type: event.type ?? "unknown" })
})

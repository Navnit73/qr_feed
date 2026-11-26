import { ok, withApi } from "@/lib/api/response"

// The reference route for the API envelope. Uptime checks and e2e tests hit it.
export const GET = withApi(async () => ok({ status: "ok" }))

// @vitest-environment node
import { describe, expect, it } from "vitest"
import { parseEnv } from "@/server/env"

const valid = {
  MONGODB_URI: "mongodb://localhost:27017/?replicaSet=rs0",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
}

describe("parseEnv()", () => {
  it("accepts a valid environment and fills defaults", () => {
    const env = parseEnv(valid)
    expect(env.MONGODB_DB).toBe("qr_feed")
    expect(env.AUTH_RATE_LIMIT).toBe("on")
    expect(env.SUPER_ADMIN_EMAILS).toEqual([])
    expect(env.INTAKE_RATE_LIMIT).toBe("on")
    expect(env.TURNSTILE_SECRET_KEY).toBeUndefined()
  })

  it("accepts Atlas SRV connection strings", () => {
    expect(() =>
      parseEnv({ ...valid, MONGODB_URI: "mongodb+srv://u:p@cluster0.x.mongodb.net/" }),
    ).not.toThrow()
  })

  it("names every missing or invalid variable in one error", () => {
    expect(() => parseEnv({ MONGODB_URI: "http://nope" })).toThrow(
      /MONGODB_URI[\s\S]*BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/,
    )
  })

  it("rejects a short auth secret", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/)
  })

  it("normalises the super-admin email list", () => {
    const env = parseEnv({ ...valid, SUPER_ADMIN_EMAILS: " Owner@Example.com, ops@example.com ,," })
    expect(env.SUPER_ADMIN_EMAILS).toEqual(["owner@example.com", "ops@example.com"])
  })
})

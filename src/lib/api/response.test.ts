// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { ApiError, STATUS_BY_CODE } from "@/lib/api/errors"
import { fail, ok, pageMeta, withApi } from "@/lib/api/response"

describe("ok()", () => {
  it("wraps data in the success envelope with status 200", async () => {
    const res = ok({ id: "t1" })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(await res.json()).toEqual({ ok: true, data: { id: "t1" } })
  })

  it("accepts a custom status and pagination meta", async () => {
    const meta = pageMeta({ total: 45, page: 2, pageSize: 20 })
    const res = ok([1, 2], { status: 201, meta })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, data: [1, 2], meta })
  })
})

describe("fail()", () => {
  it("maps the error code to its HTTP status", async () => {
    const res = fail("NOT_FOUND", "Ticket not found")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Ticket not found" },
    })
  })

  it("includes field-level validation details", async () => {
    const res = fail("VALIDATION", "Check the form", { email: ["Enter a valid email"] })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.details).toEqual({ email: ["Enter a valid email"] })
  })
})

describe("pageMeta()", () => {
  it("computes total pages, rounding up", () => {
    expect(pageMeta({ total: 45, page: 1, pageSize: 20 })).toEqual({
      total: 45,
      page: 1,
      pageSize: 20,
      totalPages: 3,
    })
  })

  it("reports at least one page when empty", () => {
    expect(pageMeta({ total: 0, page: 1, pageSize: 20 }).totalPages).toBe(1)
  })
})

describe("ApiError", () => {
  it("carries the code, matching status and details", () => {
    const err = new ApiError("FORBIDDEN", "No access to this branch")
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(STATUS_BY_CODE.FORBIDDEN)
    expect(err.status).toBe(403)
  })
})

describe("withApi()", () => {
  const req = new Request("http://test.local/api/x")

  it("passes successful responses through", async () => {
    const handler = withApi(async () => ok("fine"))
    const res = await handler(req, { params: Promise.resolve({}) })
    expect(await res.json()).toEqual({ ok: true, data: "fine" })
  })

  it("turns a thrown ApiError into the failure envelope", async () => {
    const handler = withApi(async () => {
      throw new ApiError("CONFLICT", "QR code already exists")
    })
    const res = await handler(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("CONFLICT")
  })

  it("hides the message of unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const handler = withApi(async () => {
      throw new Error("Mongo password is hunter2")
    })
    const res = await handler(req, { params: Promise.resolve({}) })
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.error.code).toBe("INTERNAL")
    expect(JSON.stringify(body)).not.toContain("hunter2")
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

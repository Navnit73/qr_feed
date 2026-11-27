// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { sendMail, takeTestOutbox } from "@/server/mail"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sendMail", () => {
  it("posts to Resend with html, text, reply-to and an idempotency key", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const res = await sendMail(
      {
        to: "a@x.test",
        subject: "Hi",
        text: "plain",
        html: "<p>rich</p>",
        replyTo: "help@acme.test",
        idempotencyKey: "ticket.assigned/1",
      },
      { apiKey: "re_test", from: "Acme <noreply@acme.test>" },
    )
    expect(res).toEqual({ delivered: true, provider: "resend", id: "em_1" })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.resend.com/emails")
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer re_test")
    expect(headers["Idempotency-Key"]).toBe("ticket.assigned/1")
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Acme <noreply@acme.test>",
      to: ["a@x.test"],
      subject: "Hi",
      text: "plain",
      html: "<p>rich</p>",
      reply_to: "help@acme.test",
    })
  })

  it("reports and logs a rejected send instead of swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 })),
    )
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await sendMail({ to: "a@x.test", subject: "Hi", text: "x" }, { apiKey: "re_test" })
    expect(res).toEqual({ delivered: false, provider: "resend" })
    expect(err).toHaveBeenCalledWith(expect.stringContaining("domain not verified"))
  })

  it("without an API key, captures mail in the test outbox", async () => {
    takeTestOutbox()
    await sendMail({ to: "b@x.test", subject: "Captured", text: "x" }, { apiKey: undefined })
    expect(takeTestOutbox().map((m) => m.subject)).toEqual(["Captured"])
    expect(takeTestOutbox()).toEqual([])
  })
})

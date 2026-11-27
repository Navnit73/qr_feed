// @vitest-environment node
import { describe, expect, it } from "vitest"
import { renderEmail } from "@/server/email-template"

describe("renderEmail", () => {
  const email = renderEmail({
    brand: "Acme <Clinic>",
    heading: "Assigned TCK-1",
    intro: ["Hello <b>there</b>", "Second line"],
    details: [["Location", "Floor 2 › Washroom"]],
    cta: { label: "Open ticket", url: "https://app.test/tickets/1" },
    footnote: "Manage alerts in Settings.",
  })

  it("escapes every piece of user text in the HTML", () => {
    expect(email.html).toContain("Hello &lt;b&gt;there&lt;/b&gt;")
    expect(email.html).toContain("Acme &lt;Clinic&gt;")
    expect(email.html).not.toContain("<b>there</b>")
  })

  it("renders the button, details and a plain-text twin", () => {
    expect(email.html).toContain('href="https://app.test/tickets/1"')
    expect(email.html).toContain("Floor 2 › Washroom")
    expect(email.text).toContain("Open ticket: https://app.test/tickets/1")
    expect(email.text).toContain("Location: Floor 2 › Washroom")
    expect(email.text).toContain("Hello <b>there</b>")
  })

  it("drops a button whose link isn't http(s)", () => {
    const bad = renderEmail({
      heading: "x",
      intro: "y",
      cta: { label: "Go", url: "javascript:alert(1)" },
    })
    expect(bad.html).not.toContain("javascript:")
    expect(bad.text).not.toContain("javascript:")
  })
})

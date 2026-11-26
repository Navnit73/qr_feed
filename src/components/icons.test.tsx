import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Icon, iconNames } from "@/components/icons"

describe("Icon", () => {
  it("is hidden from assistive tech when decorative", () => {
    const { container } = render(<Icon name="ticket" />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("aria-hidden", "true")
  })

  it("is announced when given a label", () => {
    render(<Icon name="sla" label="SLA breached" />)
    expect(screen.getByRole("img", { name: "SLA breached" })).toBeInTheDocument()
  })

  it("covers the domain vocabulary from the product plan", () => {
    for (const name of ["qr", "ticket", "sla", "escalate", "rca", "capa", "audit", "location"]) {
      expect(iconNames).toContain(name)
    }
  })

  it("merges a custom class", () => {
    const { container } = render(<Icon name="qr" className="size-8" />)
    expect(container.querySelector("svg")).toHaveClass("size-8")
  })
})

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Breadcrumbs } from "@/components/breadcrumbs"

const trail = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Branches", href: "/branches" },
  { label: "Hotel Delhi", href: "/branches/delhi" },
  { label: "Floor 2", href: "/branches/delhi/f2" },
  { label: "Washroom F2" },
]

describe("Breadcrumbs", () => {
  it("is a labelled navigation landmark", () => {
    render(<Breadcrumbs items={trail.slice(0, 2)} />)
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument()
  })

  it("links every item except the current page", () => {
    render(<Breadcrumbs items={trail.slice(0, 3)} />)
    const nav = screen.getByRole("navigation")
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    )
    const current = within(nav).getByText("Hotel Delhi")
    expect(current).toHaveAttribute("aria-current", "page")
    expect(current.closest("a")).toBeNull()
  })

  it("collapses the middle of a long trail", () => {
    render(<Breadcrumbs items={trail} maxItems={4} />)
    const nav = screen.getByRole("navigation")
    expect(within(nav).getByText("Dashboard")).toBeInTheDocument()
    expect(within(nav).queryByText("Branches")).toBeNull()
    expect(within(nav).queryByText("Hotel Delhi")).toBeNull()
    expect(within(nav).getByText("Floor 2")).toBeInTheDocument()
    expect(within(nav).getByText("Washroom F2")).toBeInTheDocument()
    expect(within(nav).getByText("More")).toBeInTheDocument()
  })

  it("shows the whole trail when it fits", () => {
    render(<Breadcrumbs items={trail} maxItems={5} />)
    expect(screen.getByText("Branches")).toBeInTheDocument()
    expect(screen.queryByText("More")).toBeNull()
  })
})

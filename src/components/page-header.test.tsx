import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

describe("PageHeader", () => {
  it("renders the page's h1, description, trail and actions", () => {
    render(
      <PageHeader
        title="Branches"
        description="Every site in your organisation."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Branches" }]}
        actions={<Button>Add branch</Button>}
      />,
    )
    expect(screen.getByRole("heading", { level: 1, name: "Branches" })).toBeInTheDocument()
    expect(screen.getByText("Every site in your organisation.")).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add branch" })).toBeInTheDocument()
  })
})

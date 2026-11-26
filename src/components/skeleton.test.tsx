import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PageSkeleton, Skeleton } from "@/components/skeleton"

describe("Skeleton", () => {
  it("is a decorative muted block", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)
    expect(container.firstElementChild).toHaveClass("bg-muted", "h-4", "w-20")
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true")
  })
})

describe("PageSkeleton", () => {
  it("announces loading to assistive tech once", () => {
    render(<PageSkeleton />)
    expect(screen.getByRole("status")).toHaveAccessibleName("Loading")
  })
})

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button, buttonVariants } from "@/components/ui/button"

describe("Button", () => {
  it("renders a clickable button", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("marks itself busy and blocks clicks while loading", async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole("button", { name: /save/i })
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(button).toBeDisabled()
    expect(button.querySelector("[data-slot=spinner]")).not.toBeNull()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("shows no spinner when idle", () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole("button", { name: "Save" })
    expect(button).not.toHaveAttribute("aria-busy")
    expect(button.querySelector("[data-slot=spinner]")).toBeNull()
  })
})

// BUG-004: links styled with buttonVariants() kept the base `border-transparent` next to the
// outline variant's `border-border`, and the transparent one won, so outline links lost their
// border. buttonVariants must return merged classes, like <Button> does.
describe("buttonVariants()", () => {
  it("merges conflicting classes so the variant wins", () => {
    const classes = buttonVariants({ variant: "outline" }).split(" ")
    expect(classes).toContain("border-border")
    expect(classes).not.toContain("border-transparent")
  })

  it("lets a className override the base display", () => {
    const classes = buttonVariants({ className: "hidden sm:inline-flex" }).split(" ")
    expect(classes).toContain("hidden")
    expect(classes.filter((c) => c === "inline-flex")).toHaveLength(0)
  })
})

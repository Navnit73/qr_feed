import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"

describe("Modal", () => {
  it("opens from its trigger with an accessible title", async () => {
    render(
      <Modal
        trigger={<Button>Add location</Button>}
        title="Add location"
        description="Locations hold QR codes."
      >
        <p>form body</p>
      </Modal>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: "Add location" }))
    const dialog = await screen.findByRole("dialog", { name: "Add location" })
    expect(dialog).toHaveAccessibleDescription("Locations hold QR codes.")
    expect(screen.getByText("form body")).toBeInTheDocument()
  })

  it("closes with the close button", async () => {
    render(
      <Modal trigger={<Button>Open</Button>} title="Details">
        body
      </Modal>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Open" }))
    await screen.findByRole("dialog")
    await userEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("closes with Escape", async () => {
    render(
      <Modal trigger={<Button>Open</Button>} title="Details">
        body
      </Modal>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Open" }))
    await screen.findByRole("dialog")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("can be controlled and renders a footer", async () => {
    const onOpenChange = vi.fn()
    render(
      <Modal open onOpenChange={onOpenChange} title="Controlled" footer={<Button>Save</Button>}>
        body
      </Modal>,
    )
    expect(await screen.findByRole("dialog", { name: "Controlled" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })
})

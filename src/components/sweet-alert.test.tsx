import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  SweetAlertProvider,
  useSweetAlert,
  type SweetAlertOptions,
  type SweetAlertResult,
} from "@/components/sweet-alert"

/** Renders a button that fires the given alert and records how it resolved. */
function Harness({
  options,
  onResult,
}: {
  options: SweetAlertOptions
  onResult: (r: SweetAlertResult) => void
}) {
  const swal = useSweetAlert()
  return <button onClick={() => swal.fire(options).then(onResult)}>fire</button>
}

function setup(options: SweetAlertOptions) {
  const onResult = vi.fn()
  render(
    <SweetAlertProvider>
      <Harness options={options} onResult={onResult} />
    </SweetAlertProvider>,
  )
  return { onResult, fire: () => userEvent.click(screen.getByRole("button", { name: "fire" })) }
}

describe("useSweetAlert", () => {
  it("shows a toned alert and resolves confirmed on OK", async () => {
    const { onResult, fire } = setup({
      tone: "success",
      title: "Ticket closed",
      text: "TKT-2026-000123 was verified.",
    })
    await fire()
    const dialog = await screen.findByRole("alertdialog", { name: "Ticket closed" })
    expect(dialog).toHaveAttribute("data-tone", "success")
    expect(dialog).toHaveAccessibleDescription("TKT-2026-000123 was verified.")
    await userEvent.click(screen.getByRole("button", { name: "OK" }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ isConfirmed: true }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("resolves not confirmed when cancelled", async () => {
    const { onResult, fire } = setup({
      tone: "warning",
      title: "Revoke this QR code?",
      confirmText: "Revoke",
      cancelText: "Keep it",
    })
    await fire()
    await userEvent.click(await screen.findByRole("button", { name: "Keep it" }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ isConfirmed: false }))
  })

  it("keeps the alert open and busy while onConfirm runs", async () => {
    let finish!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((r) => (finish = r)))
    const { onResult, fire } = setup({
      tone: "question",
      title: "Escalate to L2?",
      confirmText: "Escalate",
      onConfirm,
    })
    await fire()
    await userEvent.click(await screen.findByRole("button", { name: /escalate/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: /escalate/i })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    finish()
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ isConfirmed: true }))
  })

  it("shows the error and stays open when onConfirm fails", async () => {
    const { onResult, fire } = setup({
      tone: "error",
      title: "Delete branch?",
      confirmText: "Delete",
      onConfirm: async () => {
        throw new Error("Branch still has open tickets")
      },
    })
    await fire()
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }))
    expect(await screen.findByText("Branch still has open tickets")).toBeInTheDocument()
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(onResult).not.toHaveBeenCalled()
  })

  it("only shows a cancel button when asked", async () => {
    const { fire } = setup({ tone: "info", title: "Heads up" })
    await fire()
    await screen.findByRole("alertdialog")
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
  })

  it("throws a helpful error outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Harness options={{ title: "x" }} onResult={() => {}} />)).toThrow(
      /SweetAlertProvider/,
    )
    spy.mockRestore()
  })
})

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EmptyState } from "@/components/cards/empty-state"
import { PanelCard } from "@/components/cards/panel-card"
import { StatCard } from "@/components/cards/stat-card"
import { Button } from "@/components/ui/button"

describe("StatCard", () => {
  it("shows the label and a formatted number", () => {
    render(<StatCard label="Open tickets" value={12480} />)
    expect(screen.getByText("Open tickets")).toBeInTheDocument()
    expect(screen.getByText("12,480")).toHaveClass("tabular-nums")
  })

  it("renders string values untouched", () => {
    render(<StatCard label="MTTR" value="2h 14m" />)
    expect(screen.getByText("2h 14m")).toBeInTheDocument()
  })

  it("colours a rise as good by default", () => {
    render(<StatCard label="SLA met" value="94%" delta={18} deltaLabel="vs last month" />)
    const delta = screen.getByText("+18%")
    expect(delta).toHaveClass("text-success")
    expect(screen.getByText("vs last month")).toBeInTheDocument()
  })

  it("colours a fall as bad by default", () => {
    render(<StatCard label="SLA met" value="81%" delta={-5} />)
    expect(screen.getByText("−5%")).toHaveClass("text-destructive")
  })

  it("flips the colours when lower is better", () => {
    render(<StatCard label="Overdue" value={4} delta={-20} lowerIsBetter />)
    expect(screen.getByText("−20%")).toHaveClass("text-success")
  })

  it("wraps a featured card in the brand edge", () => {
    const { container } = render(<StatCard label="Scans" value={5} featured />)
    expect(container.firstElementChild).toHaveClass("edge-primary")
  })

  // BUG-001: cn() treated bg-glow-amber as a bg colour and dropped bg-card, so the
  // gradient edge showed through and the featured card rendered grey.
  it("keeps an opaque card surface inside the featured edge", () => {
    const { container } = render(<StatCard label="Scans" value={5} featured />)
    const surface = container.firstElementChild?.firstElementChild
    expect(surface).toHaveClass("bg-card")
    expect(container.querySelector(".bg-glow-amber")).not.toBeNull()
  })
})

describe("EmptyState", () => {
  it("guides the user with a title, text and action", () => {
    render(
      <EmptyState
        icon="ticket"
        title="No tickets yet"
        description="Print a QR code to start collecting feedback."
        action={<Button>Create QR code</Button>}
      />,
    )
    expect(screen.getByRole("heading", { name: "No tickets yet" })).toBeInTheDocument()
    expect(screen.getByText(/print a qr code/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create QR code" })).toBeInTheDocument()
  })
})

describe("PanelCard", () => {
  it("renders a titled panel with an action and content", () => {
    render(
      <PanelCard
        title="Tickets by status"
        description="Last 30 days"
        action={<Button>Export</Button>}
      >
        <p>chart here</p>
      </PanelCard>,
    )
    expect(screen.getByRole("heading", { name: "Tickets by status" })).toBeInTheDocument()
    expect(screen.getByText("Last 30 days")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument()
    expect(screen.getByText("chart here")).toBeInTheDocument()
  })
})

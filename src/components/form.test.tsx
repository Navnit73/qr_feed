import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CheckboxGroup, FormField, FormMessage, FormSelect } from "@/components/form"
import type { ApiResponse } from "@/lib/api/errors"

const failed: ApiResponse<unknown> = {
  ok: false,
  error: {
    code: "VALIDATION",
    message: "Please check the highlighted fields.",
    details: {
      email: ["Enter a valid email"],
      industry: ["Choose an industry"],
      roles: ["Pick one"],
    },
  },
}

describe("FormField", () => {
  it("labels its input", () => {
    render(<FormField label="Email" name="email" type="email" state={null} />)
    const input = screen.getByLabelText("Email")
    expect(input).toHaveAttribute("name", "email")
    expect(input).not.toHaveAttribute("aria-invalid")
  })

  it("shows the field's error and links it to the input", () => {
    render(<FormField label="Email" name="email" state={failed} />)
    const input = screen.getByLabelText("Email")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("Enter a valid email")
  })

  it("shows a hint when there is no error", () => {
    render(<FormField label="Code" name="code" hint="Printed on the sticker" state={null} />)
    expect(screen.getByLabelText("Code")).toHaveAccessibleDescription("Printed on the sticker")
  })
})

describe("FormSelect", () => {
  it("renders options and the field error", () => {
    render(
      <FormSelect
        label="Industry"
        name="industry"
        options={[
          { value: "hotel", label: "Hotel" },
          { value: "clinic", label: "Clinic" },
        ]}
        state={failed}
      />,
    )
    const select = screen.getByLabelText("Industry")
    expect(screen.getByRole("option", { name: "Clinic" })).toBeInTheDocument()
    expect(select).toHaveAccessibleDescription("Choose an industry")
  })
})

describe("CheckboxGroup", () => {
  it("is a labelled group with default selections and an error", () => {
    render(
      <CheckboxGroup
        legend="Roles"
        name="roles"
        options={[
          { value: "l1_staff", label: "L1 staff" },
          { value: "verifier", label: "Verifier" },
        ]}
        defaultValue={["verifier"]}
        state={failed}
      />,
    )
    const group = screen.getByRole("group", { name: "Roles" })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Verifier" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "L1 staff" })).not.toBeChecked()
    expect(screen.getByText("Pick one")).toBeInTheDocument()
  })
})

describe("FormMessage", () => {
  it("renders nothing before the first submit", () => {
    const { container } = render(<FormMessage state={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("announces a failure", () => {
    render(<FormMessage state={failed} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted fields.")
  })

  it("announces success only when given a message", () => {
    const { rerender } = render(<FormMessage state={{ ok: true, data: null }} />)
    expect(screen.queryByRole("alert")).toBeNull()
    rerender(<FormMessage state={{ ok: true, data: null }} success="Saved" />)
    expect(screen.getByRole("alert")).toHaveTextContent("Saved")
  })
})

describe("RatingInput", () => {
  it("is a radio group of 1–5 stars, keyboard-operable", async () => {
    const { RatingInput } = await import("@/components/form")
    render(<RatingInput label="How was it?" name="rating" state={null} />)
    const group = screen.getByRole("radiogroup", { name: "How was it?" })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(5)
    const four = screen.getByRole("radio", { name: "4 stars" })
    four.click()
    expect(four).toBeChecked()
  })
})

describe("RadioCards", () => {
  it("renders labelled options and the field error", async () => {
    const { RadioCards } = await import("@/components/form")
    render(
      <RadioCards
        legend="What's it about?"
        name="email"
        options={[
          { value: "a", label: "Cleanliness" },
          { value: "b", label: "Maintenance" },
        ]}
        state={failed}
      />,
    )
    expect(screen.getByRole("radiogroup", { name: "What's it about?" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Maintenance" })).toHaveAttribute("value", "b")
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument()
  })
})

describe("FormTextarea", () => {
  it("labels the textarea and links its error", async () => {
    const { FormTextarea } = await import("@/components/form")
    render(<FormTextarea label="Email" name="email" state={failed} />)
    const box = screen.getByRole("textbox", { name: "Email" })
    expect(box.tagName).toBe("TEXTAREA")
    expect(box).toHaveAccessibleDescription("Enter a valid email")
  })
})

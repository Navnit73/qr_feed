"use client"

import { useId, useState, type ComponentProps, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { Icon, type IconName } from "@/components/icons"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ApiResponse } from "@/lib/api/errors"
import { cn } from "@/lib/utils"

/** The state a server action returns through useActionState (see src/server/actions.ts). */
type State = ApiResponse<unknown> | null

function errorFor(state: State, name: string) {
  return state && !state.ok ? state.error.details?.[name]?.[0] : undefined
}

function Help({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} className="text-sm text-destructive">
        {error}
      </p>
    )
  }
  return hint ? (
    <p id={id} className="text-sm text-muted-foreground">
      {hint}
    </p>
  ) : null
}

/**
 * Label + input + error/hint, wired for screen readers. Inputs are 44px tall (touch).
 * Optional extras for sign-in style forms: a leading `icon`, a show/hide toggle for passwords
 * (`revealable`) and a `labelAction` link on the label row (e.g. "Forgot password?").
 */
export function FormField({
  label,
  name,
  state,
  hint,
  icon,
  revealable = false,
  labelAction,
  className,
  type,
  ...input
}: {
  label: string
  name: string
  state: State
  hint?: ReactNode
  icon?: IconName
  revealable?: boolean
  labelAction?: ReactNode
} & ComponentProps<"input">) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const error = errorFor(state, name)
  const helpId = `${id}-help`
  const reveal = revealable && type === "password"
  return (
    <div className={cn("space-y-2", className)}>
      {labelAction ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={id}>{label}</Label>
          {labelAction}
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <div className="relative">
        {icon && (
          <Icon
            name={icon}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
        )}
        <Input
          id={id}
          name={name}
          type={reveal && shown ? "text" : type}
          className={cn("h-11 md:h-10", icon && "pl-9.5", reveal && "pr-11")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? helpId : undefined}
          {...input}
        />
        {reveal && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon name={shown ? "eyeOff" : "eye"} />
          </button>
        )}
      </div>
      <Help id={helpId} error={error} hint={hint} />
    </div>
  )
}

export function FormSelect({
  label,
  name,
  options,
  state,
  hint,
  className,
  ...select
}: {
  label: string
  name: string
  options: { value: string; label: string }[]
  state: State
  hint?: ReactNode
} & ComponentProps<"select">) {
  const id = useId()
  const error = errorFor(state, name)
  const helpId = `${id}-help`
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? helpId : undefined}
        className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:h-10 md:text-sm dark:bg-input/30"
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Help id={helpId} error={error} hint={hint} />
    </div>
  )
}

export function CheckboxGroup({
  legend,
  name,
  options,
  defaultValue = [],
  state,
  hint,
}: {
  legend: string
  name: string
  options: { value: string; label: string; description?: string }[]
  defaultValue?: string[]
  state: State
  hint?: ReactNode
}) {
  const id = useId()
  const error = errorFor(state, name)
  return (
    <fieldset className="space-y-2" aria-describedby={error || hint ? `${id}-help` : undefined}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultValue.includes(o.value)}
              className="mt-0.5 size-4 accent-(--primary)"
            />
            <span>
              <span className="font-medium">{o.label}</span>
              {o.description && (
                <span className="block text-xs text-muted-foreground">{o.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      <Help id={`${id}-help`} error={error} hint={hint} />
    </fieldset>
  )
}

/** The form-level result: the failure message, or a success note when you pass one. */
export function FormMessage({ state, success }: { state: State; success?: string }) {
  if (!state) return null
  if (state.ok) {
    return success ? (
      <Alert variant="success">
        <Icon name="success" />
        <AlertTitle>{success}</AlertTitle>
      </Alert>
    ) : null
  }
  return (
    <Alert variant="destructive">
      <Icon name="error" />
      <AlertTitle>{state.error.message}</AlertTitle>
      {state.error.code === "NETWORK" && (
        <AlertDescription>Check your connection and try again.</AlertDescription>
      )}
    </Alert>
  )
}

/** Submit button that shows a spinner while its form's action runs. */
export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="xl" loading={pending} {...props}>
      {children}
    </Button>
  )
}

export function FormTextarea({
  label,
  name,
  state,
  hint,
  className,
  ...textarea
}: { label: string; name: string; state: State; hint?: ReactNode } & ComponentProps<"textarea">) {
  const id = useId()
  const error = errorFor(state, name)
  const helpId = `${id}-help`
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? helpId : undefined}
        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"
        {...textarea}
      />
      <Help id={helpId} error={error} hint={hint} />
    </div>
  )
}

/**
 * Big tappable choice cards (one answer). Native radios underneath, so arrow keys, form
 * submission and screen readers all work without JS.
 */
export function RadioCards({
  legend,
  name,
  options,
  state,
  defaultValue,
  columns = 2,
}: {
  legend: string
  name: string
  options: { value: string; label: string }[]
  state: State
  defaultValue?: string
  columns?: 1 | 2
}) {
  const id = useId()
  const error = errorFor(state, name)
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-legend`}
      aria-describedby={error ? `${id}-help` : undefined}
      className="space-y-2"
    >
      <p id={`${id}-legend`} className="text-sm font-medium">
        {legend}
      </p>
      <div className={cn("grid gap-2", columns === 2 && "grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-12 cursor-pointer items-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={o.value === defaultValue}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      <Help id={`${id}-help`} error={error} />
    </div>
  )
}

/** 1–5 star rating as a radio group. Stars fill up to the chosen one (CSS only). */
export function RatingInput({ label, name, state }: { label: string; name: string; state: State }) {
  const id = useId()
  const error = errorFor(state, name)
  return (
    <div role="radiogroup" aria-labelledby={`${id}-legend`} className="space-y-2">
      <p id={`${id}-legend`} className="text-sm font-medium">
        {label}
      </p>
      {/* Reversed order + peer selectors: a checked star also lights every star before it. */}
      <div className="flex flex-row-reverse justify-end gap-1">
        {[5, 4, 3, 2, 1].map((n) => (
          <label
            key={n}
            className="peer grid size-12 cursor-pointer place-items-center rounded-xl text-foreground/15 transition-colors peer-hover:text-secondary peer-has-checked:text-secondary hover:text-secondary has-checked:text-secondary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={n}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              className="sr-only"
            />
            <Icon name="rating" className="size-8 fill-current" />
          </label>
        ))}
      </div>
      <Help id={`${id}-help`} error={error} />
    </div>
  )
}

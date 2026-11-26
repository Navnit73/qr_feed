import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** A page section: lime eyebrow, bold heading and muted subtitle, centred above the content. */
export function Section({
  id,
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
  children,
}: {
  id?: string
  /** A short label above the heading, e.g. "How it works". */
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  align?: "center" | "left"
  className?: string
  children: ReactNode
}) {
  const centred = align === "center"
  return (
    <section
      id={id}
      // Labelled by its heading, so it is a named region screen readers can jump to.
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("px-4 py-14 sm:px-6 sm:py-20 lg:py-24", className)}
    >
      <div className="mx-auto max-w-6xl">
        <div className={cn("reveal max-w-3xl", centred && "mx-auto text-center")}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2
            id={id ? `${id}-title` : undefined}
            className="text-[clamp(1.85rem,6.4vw,3rem)] leading-[1.08] font-bold tracking-tight text-balance"
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className={cn(
                "mt-3 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:mt-4 sm:text-xl",
                centred && "mx-auto",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="reveal mt-8 sm:mt-12">{children}</div>
      </div>
    </section>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-success uppercase sm:mb-4 sm:text-sm">
      <span aria-hidden className="h-px w-5 bg-primary" />
      {children}
      <span aria-hidden className="h-px w-5 bg-primary" />
    </p>
  )
}

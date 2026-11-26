import type { ReactNode } from "react"
import { Icon, type IconName } from "@/components/icons"
import { cn } from "@/lib/utils"

/** What a list shows before it has data. Always say what to do next. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: IconName
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "bg-dots flex flex-col items-center rounded-xl border border-dashed px-4 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-success">
          <Icon name={icon} className="size-6" />
        </span>
      )}
      <h3 className="text-lg font-semibold tracking-tight text-balance">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-pretty text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

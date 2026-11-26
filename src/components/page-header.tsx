import type { ReactNode } from "react"
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs"

/** Top of every app page: trail, h1, one-line description and the page's actions. */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string
  description?: ReactNode
  breadcrumbs?: Crumb[]
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 space-y-3 sm:mb-8">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
          {description && (
            <p className="mt-1 max-w-prose text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

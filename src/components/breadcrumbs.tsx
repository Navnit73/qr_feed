import { Fragment } from "react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export type Crumb = { label: string; href?: string }

/**
 * The page trail. The last item is the current page and never a link. Long trails (deep
 * location trees: branch › floor › zone › room) keep the first item and the last
 * `maxItems - 2`, with an ellipsis between, so they fit on a phone.
 */
export function Breadcrumbs({
  items,
  maxItems = 4,
  className,
}: {
  items: Crumb[]
  maxItems?: number
  className?: string
}) {
  const collapsed = items.length > maxItems
  const tail = Math.max(1, maxItems - 2)
  const visible: (Crumb | "ellipsis")[] = collapsed
    ? [items[0], "ellipsis", ...items.slice(-tail)]
    : items

  return (
    <Breadcrumb aria-label="Breadcrumb" className={className}>
      <BreadcrumbList>
        {visible.map((item, i) => {
          const last = i === visible.length - 1
          return (
            <Fragment key={item === "ellipsis" ? "ellipsis" : `${i}-${item.label}`}>
              <BreadcrumbItem>
                {item === "ellipsis" ? (
                  <BreadcrumbEllipsis />
                ) : last || !item.href ? (
                  <BreadcrumbPage className={last ? undefined : "text-muted-foreground"}>
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={item.href} />}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

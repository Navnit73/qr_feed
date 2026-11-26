import type { ReactNode } from "react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"

/** A titled dashboard panel: holds a chart, table or list, with an optional header action. */
export function PanelCard({
  title,
  description,
  action,
  footer,
  className,
  children,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <h3 data-slot="card-title" className="text-base leading-snug font-semibold">
          {title}
        </h3>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  )
}

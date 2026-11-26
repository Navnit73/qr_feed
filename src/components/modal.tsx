"use client"

import type { ComponentProps, ReactElement, ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const sizes = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
} as const

/**
 * A standard dialog: title, optional description, body and footer. Pass `trigger` for an
 * uncontrolled modal, or `open` with `onOpenChange` to drive it from state.
 * For yes/no questions use `useSweetAlert().fire` instead.
 */
export function Modal({
  trigger,
  title,
  description,
  footer,
  size = "md",
  open,
  onOpenChange,
  className,
  children,
}: {
  trigger?: ReactElement
  title: string
  description?: ReactNode
  footer?: ReactNode
  size?: keyof typeof sizes
  open?: boolean
  onOpenChange?: ComponentProps<typeof Dialog>["onOpenChange"]
  className?: string
  children?: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", sizes[size], className)}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

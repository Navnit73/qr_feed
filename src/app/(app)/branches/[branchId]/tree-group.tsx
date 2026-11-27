"use client"

import { type ReactNode, useId, useState } from "react"
import { Icon } from "@/components/icons"
import { cn } from "@/lib/utils"

/**
 * One collapsible area of the site map. The header and the rows inside it are server-rendered
 * and passed in, so this is the only JavaScript an area costs. Not a <details>: its <summary>
 * can't hold the row's own buttons accessibly.
 */
export function TreeGroup({
  name,
  header,
  actions,
  children,
}: {
  name: string
  header: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const regionId = useId()
  return (
    <>
      <div className="flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-accent/60">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 pl-1 text-left"
        >
          <Icon
            name="expand"
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          {header}
        </button>
        {actions}
      </div>
      <div id={regionId} hidden={!open}>
        {children}
      </div>
    </>
  )
}

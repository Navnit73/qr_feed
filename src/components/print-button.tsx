"use client"

import { Icon } from "@/components/icons"
import { Button } from "@/components/ui/button"

export function PrintButton() {
  return (
    <Button size="xl" onClick={() => window.print()}>
      <Icon name="print" data-icon="inline-start" /> Print
    </Button>
  )
}

"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import type { PlanKey } from "@/server/modules/tenants"
import { changePlanAction } from "./actions"

export function SelectPlanButton({ plan, current }: { plan: PlanKey; current: boolean }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  if (current) {
    return (
      <Button variant="outline" size="lg" disabled className="w-full">
        Current plan
      </Button>
    )
  }

  if (plan === "enterprise") {
    return (
      <Button variant="outline" size="lg" disabled className="w-full">
        Contact sales
      </Button>
    )
  }

  return (
    <div className="space-y-1">
      <Button
        size="lg"
        className="w-full"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await changePlanAction(plan, "sandbox")
            if (res && !res.ok) setMsg(res.error.message)
          })
        }
      >
        Switch to {plan}
      </Button>
      {msg && <p className="text-xs text-destructive">{msg}</p>}
    </div>
  )
}

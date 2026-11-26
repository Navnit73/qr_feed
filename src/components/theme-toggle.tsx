"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Flips the `dark` class on <html>. Not persisted; the app has no saved preference yet. */
export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon-xl"
      aria-label="Toggle dark mode"
      onClick={() => document.documentElement.classList.toggle("dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  )
}

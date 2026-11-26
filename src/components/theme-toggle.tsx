"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Flips the `dark` class on <html>. Not persisted; the app has no saved preference yet. */
export function ThemeToggle() {
  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label="Toggle dark mode"
      onClick={() => document.documentElement.classList.toggle("dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  )
}

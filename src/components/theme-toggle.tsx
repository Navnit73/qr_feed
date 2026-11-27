"use client"

import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"

const THEME_KEY = "qrfeed.theme"
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getIsDark() {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains("dark")
}

/** Flips the `dark` class on <html> and persists preference in localStorage. */
export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getIsDark, () => false)

  function toggle() {
    const nextDark = !document.documentElement.classList.contains("dark")
    document.documentElement.classList.toggle("dark", nextDark)
    try {
      localStorage.setItem(THEME_KEY, nextDark ? "dark" : "light")
    } catch {
      // Ignore storage restrictions
    }
    for (const cb of listeners) cb()
  }

  return (
    <Button
      variant="ghost"
      size="icon-xl"
      aria-label="Toggle dark mode"
      aria-pressed={isDark}
      onClick={toggle}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  )
}

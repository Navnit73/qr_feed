/**
 * Accent tones for icon tiles and progress bars (the soft pastel tiles on dashboard cards).
 * Written out in full so Tailwind can see every class.
 */
export type Tone = "indigo" | "emerald" | "rose" | "amber" | "cyan" | "orange" | "sky"

export const TONE_TILE: Record<Tone, string> = {
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
}

export const TONE_BAR: Record<Tone, string> = {
  indigo: "bg-indigo-600 dark:bg-indigo-400",
  emerald: "bg-emerald-500 dark:bg-emerald-400",
  rose: "bg-rose-500 dark:bg-rose-400",
  amber: "bg-amber-500 dark:bg-amber-400",
  cyan: "bg-cyan-500 dark:bg-cyan-400",
  orange: "bg-orange-500 dark:bg-orange-400",
  sky: "bg-sky-500 dark:bg-sky-400",
}

export const TONE_TRACK: Record<Tone, string> = {
  indigo: "bg-indigo-100 dark:bg-indigo-500/15",
  emerald: "bg-emerald-100 dark:bg-emerald-500/15",
  rose: "bg-rose-100 dark:bg-rose-500/15",
  amber: "bg-amber-100 dark:bg-amber-500/15",
  cyan: "bg-cyan-100 dark:bg-cyan-500/15",
  orange: "bg-orange-100 dark:bg-orange-500/15",
  sky: "bg-sky-100 dark:bg-sky-500/15",
}

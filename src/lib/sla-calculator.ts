/**
 * Timezone & business-hours SLA due-date calculator (phase.md §6.2, F-4.2).
 * Pure function, zero external dependencies — uses Intl.DateTimeFormat for exact IANA zones
 * (including half-hour offsets like Asia/Kolkata and DST transitions).
 */

export type BusinessHoursDay = { enabled: boolean; start: string; end: string }
export type BusinessHoursSchedule = {
  /** Keys "0" (Sunday) through "6" (Saturday). */
  days: Record<string, BusinessHoursDay>
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursSchedule = {
  days: {
    "0": { enabled: false, start: "09:00", end: "18:00" },
    "1": { enabled: true, start: "09:00", end: "18:00" },
    "2": { enabled: true, start: "09:00", end: "18:00" },
    "3": { enabled: true, start: "09:00", end: "18:00" },
    "4": { enabled: true, start: "09:00", end: "18:00" },
    "5": { enabled: true, start: "09:00", end: "18:00" },
    "6": { enabled: false, start: "09:00", end: "18:00" },
  },
}

export type SlaCalcOptions = {
  mode: "24x7" | "business_hours"
  timezone: string
  businessHours?: BusinessHoursSchedule
  /** ISO YYYY-MM-DD dates treated as non-working days. */
  holidays?: string[]
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number)
  return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0)
}

type LocalParts = {
  year: number
  month: number
  day: number
  weekday: number
  minuteOfDay: number
  isoDate: string
}

function getLocalParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)
  const weekday = WEEKDAY_INDEX[parts.weekday] ?? 0
  return {
    year,
    month,
    day,
    weekday,
    minuteOfDay: hour * 60 + minute,
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

function localAsUtcMs(parts: LocalParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    Math.floor(parts.minuteOfDay / 60),
    parts.minuteOfDay % 60,
  )
}

/**
 * Converts a wall-clock local date + minuteOfDay in `timeZone` back to a UTC Date.
 * Uses two-step offset convergence so both positive and negative DST transitions stay exact
 * and spring-forward gaps never step backwards to the previous day.
 */
function localToUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  const targetWallMs = Date.UTC(year, month - 1, day, h, m, 0, 0)

  const offsetAt = (utcMs: number) => localAsUtcMs(getLocalParts(new Date(utcMs), timeZone)) - utcMs

  const guess1 = targetWallMs - offsetAt(targetWallMs)
  const guess2 = targetWallMs - offsetAt(guess1)

  // If guess2 lands before the requested wall-clock (nonexistent spring-forward gap),
  // advance to the post-transition instant so callers never step backwards in local time.
  const check2 = localAsUtcMs(getLocalParts(new Date(guess2), timeZone))
  if (check2 < targetWallMs) {
    const check1 = localAsUtcMs(getLocalParts(new Date(guess1), timeZone))
    if (check1 >= targetWallMs) return new Date(guess1)
    return new Date(guess2 + (targetWallMs - check2))
  }
  return new Date(guess2)
}

function nextCalendarDay(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day + 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/**
 * Adds `minutes` to `start`, skipping closed hours, weekends and holidays when
 * `opts.mode === "business_hours"`.
 */
export function addBusinessMinutes(start: Date, minutes: number, opts: SlaCalcOptions): Date {
  const safeMinutes = Math.max(0, Math.round(minutes))
  if (opts.mode === "24x7" || safeMinutes === 0) {
    return new Date(start.getTime() + safeMinutes * 60_000)
  }

  const tz = opts.timezone || "UTC"
  const schedule = opts.businessHours ?? DEFAULT_BUSINESS_HOURS
  const holidaySet = new Set(opts.holidays ?? [])

  // Guard against misconfigured schedule with zero enabled days (fall back to 24x7)
  const hasAnyOpenDay = Object.values(schedule.days).some(
    (d) => d.enabled && parseHm(d.end) > parseHm(d.start),
  )
  if (!hasAnyOpenDay) {
    return new Date(start.getTime() + safeMinutes * 60_000)
  }

  let remaining = safeMinutes
  let cursor = new Date(start.getTime())
  const secondsOffsetMs = start.getTime() % 60_000

  // Maximum 400 day hops prevents infinite loops on extreme holiday lists
  for (let hop = 0; hop < 400 && remaining > 0; hop++) {
    const local = getLocalParts(cursor, tz)
    const dayCfg = schedule.days[String(local.weekday)]
    const isHoliday = holidaySet.has(local.isoDate)

    if (!isHoliday && dayCfg?.enabled) {
      const openMin = parseHm(dayCfg.start)
      const closeMin = parseHm(dayCfg.end)
      if (closeMin > openMin && local.minuteOfDay < closeMin) {
        const effectiveStart = Math.max(local.minuteOfDay, openMin)
        const avail = closeMin - effectiveStart
        if (remaining <= avail) {
          const target = localToUtc(
            local.year,
            local.month,
            local.day,
            effectiveStart + remaining,
            tz,
          )
          return new Date(
            target.getTime() + (effectiveStart === local.minuteOfDay ? secondsOffsetMs : 0),
          )
        }
        remaining -= avail
      }
    }

    // Advance cursor to 00:00 of the next local calendar day
    const next = nextCalendarDay(local.year, local.month, local.day)
    cursor = localToUtc(next.year, next.month, next.day, 0, tz)
  }

  return new Date(start.getTime() + safeMinutes * 60_000)
}

export type SlaHealthState = "on_track" | "at_risk" | "breached" | "paused" | "met"

export function computeSlaStatus(input: {
  createdAt: Date
  resolveDueAt: Date
  now: Date
  pausedAt?: Date | null
  resolvedAt?: Date | null
  breached?: boolean
}): { state: SlaHealthState; remainingMs: number; elapsedRatio: number; label: string } {
  if (input.resolvedAt) {
    const met = input.resolvedAt.getTime() <= input.resolveDueAt.getTime() && !input.breached
    return {
      state: met ? "met" : "breached",
      remainingMs: input.resolveDueAt.getTime() - input.resolvedAt.getTime(),
      elapsedRatio: 1,
      label: met ? "SLA met" : "SLA breached",
    }
  }

  if (input.pausedAt) {
    return {
      state: "paused",
      remainingMs: input.resolveDueAt.getTime() - input.pausedAt.getTime(),
      elapsedRatio: 0,
      label: "SLA paused",
    }
  }

  const totalMs = Math.max(60_000, input.resolveDueAt.getTime() - input.createdAt.getTime())
  const remainingMs = input.resolveDueAt.getTime() - input.now.getTime()
  const elapsedRatio = (totalMs - remainingMs) / totalMs

  if (remainingMs <= 0 || input.breached) {
    return {
      state: "breached",
      remainingMs,
      elapsedRatio: Math.max(1, elapsedRatio),
      label:
        remainingMs <= 0
          ? `Breached ${formatDuration(Math.abs(remainingMs))} ago`
          : `Breached · ${formatDuration(remainingMs)} left`,
    }
  }

  if (elapsedRatio >= 0.8) {
    return {
      state: "at_risk",
      remainingMs,
      elapsedRatio,
      label: `${formatDuration(remainingMs)} left`,
    }
  }

  return {
    state: "on_track",
    remainingMs,
    elapsedRatio,
    label: `${formatDuration(remainingMs)} left`,
  }
}

export function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const rem = mins % 60
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

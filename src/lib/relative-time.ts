const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" })

/** "5 min. ago", "3 hr. ago", "4 days ago". `now` is passed in so renders stay pure. */
export function timeAgo(date: Date, now: number) {
  const mins = Math.round((date.getTime() - now) / 60_000)
  if (mins === 0) return "just now"
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute")
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour")
  return rtf.format(Math.round(hours / 24), "day")
}

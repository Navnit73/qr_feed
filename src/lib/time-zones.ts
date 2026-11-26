/**
 * ICU still reports some zones by their legacy names. Show users the current IANA names;
 * both are valid, so stored values work either way.
 */
const MODERN: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Enderbury": "Pacific/Kanton",
}

/** The current IANA name for a zone (browsers may report legacy names too). */
export const modernTimeZone = (tz: string) => MODERN[tz] ?? tz

const isValid = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Sorted, de-duplicated zone list for pickers, with modern names. */
export function timeZoneOptions(): string[] {
  const zones = new Set<string>(["UTC"])
  for (const tz of Intl.supportedValuesOf("timeZone")) {
    const name = modernTimeZone(tz)
    if (isValid(name)) zones.add(name)
  }
  return [...zones].sort()
}

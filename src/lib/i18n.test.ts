// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  SUPPORTED_LOCALES,
  detectLocale,
  getGuestStrings,
  isRtlLocale,
  translateCategoryLabel,
} from "./i18n"

describe("public form i18n (F-2.7 / T-I18N-1)", () => {
  it("supports English, Hindi, Spanish, French and Arabic", () => {
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toEqual(["en", "hi", "es", "fr", "ar"])
  })

  it("marks Arabic as RTL and others as LTR", () => {
    expect(isRtlLocale("ar")).toBe(true)
    expect(isRtlLocale("en")).toBe(false)
    expect(isRtlLocale("hi")).toBe(false)
  })

  it("detects locale from query parameter first, then Accept-Language header, else en", () => {
    expect(detectLocale("es-ES,es;q=0.9", "hi")).toBe("hi")
    expect(detectLocale("ar-AE,ar;q=0.9,en;q=0.8", null)).toBe("ar")
    expect(detectLocale("hi-IN,hi;q=0.9", undefined)).toBe("hi")
    expect(detectLocale("de-DE,de;q=0.9", null)).toBe("en")
    expect(detectLocale(null, "unknown")).toBe("en")
  })

  it("returns complete non-empty strings for every locale", () => {
    const enKeys = Object.keys(getGuestStrings("en")).sort()
    for (const { code } of SUPPORTED_LOCALES) {
      const dict = getGuestStrings(code)
      expect(Object.keys(dict).sort()).toEqual(enKeys)
      for (const value of Object.values(dict)) {
        expect(value.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it("translates built-in category keys and falls back to custom labels", () => {
    expect(translateCategoryLabel("hi", "cleanliness", "Cleanliness")).not.toBe("Cleanliness")
    expect(translateCategoryLabel("en", "cleanliness", "Cleanliness")).toBe("Cleanliness")
    expect(translateCategoryLabel("es", "custom_xyz", "Custom Pool Desk")).toBe("Custom Pool Desk")
  })
})

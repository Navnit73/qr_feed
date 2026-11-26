/*
 * Starter feedback categories per industry (phase.md F-2.6). Seeded into each new tenant's
 * `categories` collection at onboarding; admins will edit them in P3. Safety-related
 * categories default to high severity so they reach staff fastest.
 */
export const SEVERITIES = ["low", "medium", "high", "critical"] as const
export type Severity = (typeof SEVERITIES)[number]

export type CategoryPreset = { key: string; label: string; defaultSeverity: Severity }
type Industry = "hospital" | "clinic" | "hotel" | "mall" | "manufacturing" | "other"

const other: CategoryPreset = { key: "other", label: "Something else", defaultSeverity: "medium" }

export const FEEDBACK_PRESETS: Record<Industry, CategoryPreset[]> = {
  hospital: [
    { key: "cleanliness", label: "Cleanliness", defaultSeverity: "medium" },
    { key: "patient_care", label: "Patient care", defaultSeverity: "high" },
    { key: "staff_behaviour", label: "Staff behaviour", defaultSeverity: "medium" },
    { key: "waiting_time", label: "Waiting time", defaultSeverity: "low" },
    { key: "facilities", label: "Facilities & equipment", defaultSeverity: "medium" },
    { key: "safety", label: "Safety concern", defaultSeverity: "high" },
    { key: "billing", label: "Billing", defaultSeverity: "low" },
    other,
  ],
  clinic: [
    { key: "cleanliness", label: "Cleanliness", defaultSeverity: "medium" },
    { key: "waiting_time", label: "Waiting time", defaultSeverity: "low" },
    { key: "staff_behaviour", label: "Staff behaviour", defaultSeverity: "medium" },
    { key: "consultation", label: "Consultation", defaultSeverity: "medium" },
    { key: "facilities", label: "Facilities", defaultSeverity: "medium" },
    { key: "billing", label: "Billing", defaultSeverity: "low" },
    other,
  ],
  hotel: [
    { key: "room_cleanliness", label: "Room cleanliness", defaultSeverity: "medium" },
    { key: "housekeeping", label: "Housekeeping", defaultSeverity: "medium" },
    { key: "maintenance", label: "Maintenance", defaultSeverity: "medium" },
    { key: "food", label: "Food & beverage", defaultSeverity: "medium" },
    { key: "front_desk", label: "Front desk", defaultSeverity: "low" },
    { key: "noise", label: "Noise", defaultSeverity: "low" },
    { key: "wifi", label: "Wi-Fi", defaultSeverity: "low" },
    other,
  ],
  mall: [
    { key: "washroom", label: "Washroom cleanliness", defaultSeverity: "medium" },
    { key: "spill", label: "Spill or hazard", defaultSeverity: "high" },
    { key: "security", label: "Security", defaultSeverity: "high" },
    { key: "lifts", label: "Lift or escalator", defaultSeverity: "medium" },
    { key: "parking", label: "Parking", defaultSeverity: "low" },
    { key: "lost_found", label: "Lost & found", defaultSeverity: "low" },
    other,
  ],
  manufacturing: [
    { key: "safety_hazard", label: "Safety hazard", defaultSeverity: "high" },
    { key: "near_miss", label: "Near miss", defaultSeverity: "high" },
    { key: "breakdown", label: "Machine breakdown", defaultSeverity: "high" },
    { key: "ppe", label: "PPE missing", defaultSeverity: "high" },
    { key: "quality", label: "Quality issue", defaultSeverity: "medium" },
    { key: "housekeeping", label: "Housekeeping (5S)", defaultSeverity: "low" },
    other,
  ],
  other: [
    { key: "cleanliness", label: "Cleanliness", defaultSeverity: "medium" },
    { key: "maintenance", label: "Maintenance", defaultSeverity: "medium" },
    { key: "staff", label: "Staff", defaultSeverity: "medium" },
    { key: "safety", label: "Safety concern", defaultSeverity: "high" },
    { key: "suggestion", label: "Suggestion", defaultSeverity: "low" },
    other,
  ],
}

/** The more severe of two levels. */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITIES.indexOf(a) >= SEVERITIES.indexOf(b) ? a : b
}

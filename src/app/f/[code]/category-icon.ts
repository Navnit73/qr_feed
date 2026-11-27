import type { IconName } from "@/components/icons"

// Keyed by the stable category key (not the label), so renamed or translated labels keep their icon.
const BY_KEY: Record<string, IconName> = {
  cleanliness: "cleaning",
  room_cleanliness: "cleaning",
  housekeeping: "cleaning",
  washroom: "water",
  washrooms: "water",
  spill: "water",
  maintenance: "maintenance",
  facilities: "branch",
  safety: "warning",
  safety_hazard: "warning",
  waiting_time: "clock",
  staff_behaviour: "users",
  staff: "users",
  patient_care: "care",
  consultation: "consultation",
  billing: "billing",
  food: "food",
  food_beverage: "food",
  front_desk: "frontDesk",
  noise: "noise",
  room_comfort: "room",
  wifi: "wifi",
  wifi_tech: "wifi",
}

export function categoryIcon(key: string): IconName {
  return BY_KEY[key] ?? "feedback"
}

import type { MetadataRoute } from "next"

/** PWA Web App Manifest for installable staff & mobile auditor experience (phase.md §8, F-7.2). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QR Feed · Incident-to-Resolution",
    short_name: "QR Feed",
    description: "QR feedback, SLA escalations, RCA/CAPA and mobile offline-ready audits.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#65a30d",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  }
}

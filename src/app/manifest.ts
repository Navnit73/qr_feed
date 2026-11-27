import type { MetadataRoute } from "next"

/** PWA Web App Manifest for installable staff & mobile auditor experience (phase.md §8, F-7.2). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QR Feed · Incident-to-Resolution",
    short_name: "QR Feed",
    description: "QR feedback, SLA escalations, RCA/CAPA and mobile offline-ready audits.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#3730a3",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  }
}

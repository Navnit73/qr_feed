import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { SweetAlertProvider } from "@/components/sweet-alert"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
})

export const metadata: Metadata = {
  title: "QR Feed",
  description: "QR Feedback, SLA Escalation, RCA/CAPA and Audits",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

// Restores saved dark/light theme before first paint (zero FOUC).
const THEME_SCRIPT = `try{var t=localStorage.getItem("qrfeed.theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SweetAlertProvider>{children}</SweetAlertProvider>
      </body>
    </html>
  )
}

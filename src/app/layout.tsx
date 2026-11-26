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
  description: "QR Feed",
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SweetAlertProvider>{children}</SweetAlertProvider>
      </body>
    </html>
  )
}

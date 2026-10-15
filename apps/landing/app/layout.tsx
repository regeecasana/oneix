import type { Metadata } from "next"
import { Fraunces, Inter } from "next/font/google"
import "./globals.css"

const body = Inter({ subsets: ["latin"], variable: "--font-body" })
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600"] })

export const metadata: Metadata = {
  title: "Acme Support",
  description: "Help with orders, billing, and your account. Talk to us from your browser.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} antialiased`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}

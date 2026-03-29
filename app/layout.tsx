import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/providers/auth-provider"
import { PWAMonitor } from "@/components/providers/pwa-monitor"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "FieldMap",
  description: "Gestão inteligente de territórios",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FieldMap",
    startupImage: ["/icons/icon-512x512.png"],
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: "#C65D3B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <AuthProvider>
          <PWAMonitor />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
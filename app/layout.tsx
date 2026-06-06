import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { BottomNav } from '@/components/BottomNav'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Mentor',
  description: "The only AI that remembers who you said you'd be.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#0a0a0a" />

          {/* Android / Chrome PWA */}
          <meta name="mobile-web-app-capable" content="yes" />
          <link rel="icon" sizes="192x192" href="/icons/icon-192.png" />
          <link rel="icon" sizes="512x512" href="/icons/icon-512.png" />

          {/* iOS / Safari PWA */}
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <meta name="apple-mobile-web-app-title" content="AI Mentor" />
          <link rel="apple-touch-icon" href="/icons/icon-180.png" />

          {/* Prevent double-tap zoom on mobile */}
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
          />
        </head>
        <body className={inter.className}>
          <ServiceWorkerRegister />
          {children}
          <BottomNav />
        </body>
      </html>
    </ClerkProvider>
  )
}

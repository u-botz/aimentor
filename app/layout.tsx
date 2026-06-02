import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Mentor',
  description: 'The only AI that remembers who you said you\'d be.',
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
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <meta name="apple-mobile-web-app-title" content="AI Mentor" />
          <link rel="apple-touch-icon" href="/icons/icon-180.png" />
          <meta name="mobile-web-app-capable" content="yes" />
        </head>
        <body className={inter.className}>
          <ServiceWorkerRegister />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'ValuePicks Analytics',
  description: 'Private analytics dashboards and uploads',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-[var(--card-border)] bg-[var(--card)]/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="font-bold text-white">
              ValuePicks <span className="text-[var(--accent)]">Analytics</span>
            </Link>
            <Link href="https://valuepicks.pro" className="text-sm text-[var(--ice)]/70 hover:text-[var(--accent)]">
              Back to Pick’em
            </Link>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 page-gradient min-h-[70vh]">
          {children}
        </main>
      </body>
    </html>
  )
}


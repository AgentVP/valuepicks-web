import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "./components/navbar";
import ScoreboardTicker from "./components/ScoreboardTicker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ValuePicks NHL Contest",
  description: "Daily NHL pick contest with friends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-[var(--card-border)] bg-[var(--card)]/80 backdrop-blur-sm sticky top-0 z-10">
          <Navbar />
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 page-gradient min-h-[60vh] pb-16">
          {children}
        </main>
        <ScoreboardTicker />
      </body>
    </html>
  );
}

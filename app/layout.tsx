import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "./components/navbar";
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
  description: "Daily NHL pick contest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en">

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >

        <div
          style={{
            padding:20,
            borderBottom:'1px solid #ddd',
            marginBottom:20
          }}
        >
          <Navbar />
        </div>

        <div
          style={{
            maxWidth:1000,
            margin:'auto',
            padding:'0 20px'
          }}
        >
          {children}
        </div>

      </body>

    </html>
  );
}

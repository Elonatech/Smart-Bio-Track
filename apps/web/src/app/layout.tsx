import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";

// Inter, per the design system spec — "a precise, modern, technical
// sans-serif," not the default Next.js starter font (Geist).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartBioTrack — Attendance You Can Trust",
  description:
    "Biometric, device, and geo-fenced attendance verification for modern organizations.",
};

// Runs before React hydrates, directly in <head>, so the correct theme
// class is on <html> before the browser paints anything — without
// this, the page would flash light mode for a moment even for a user
// who chose dark, since React itself can't run fast enough to prevent
// that first paint.
const themeInitScript = `
  (function() {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-heading">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

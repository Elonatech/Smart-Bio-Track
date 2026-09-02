import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";


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
    // suppressHydrationWarning is REQUIRED here, not a workaround for
    // sloppy code. themeInitScript below adds the `dark` class to this
    // element before React hydrates, but the server can't know what's in
    // the visitor's localStorage, so it renders without it. React then
    // sees one more class on <html> than the HTML it shipped and reports
    // a mismatch — even though the client is the correct state.
    //
    // The attribute applies to THIS element only, one level deep. It
    // does not silence hydration warnings anywhere else in the tree, so
    // a real mismatch in a page or component still surfaces normally.
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-heading">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

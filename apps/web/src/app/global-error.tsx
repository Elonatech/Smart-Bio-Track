"use client";

import { useEffect } from "react";

// Only fires if the ROOT layout itself throws while rendering — Providers,
// the theme script's surrounding markup, anything above every other page
// and error.tsx. Next.js requires this file to render its own <html> and
// <body>, because at that point layout.tsx (which normally provides them)
// is the very thing that failed.
//
// Deliberately does not import Providers, globals.css's theme tokens, or
// anything else from the tree that just crashed — reaching for the same
// context that broke is how a fallback page ends up crashing too. Plain
// inline styles and the system font stack cannot fail in a way that Tailwind
// classes or app providers theoretically could.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b1220",
          color: "#e5e7eb",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "420px",
            textAlign: "center",
            border: "1px solid #1f2937",
            borderRadius: "12px",
            padding: "24px",
            background: "#111827",
          }}
        >
          <h1 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
            SmartBioTrack hit an unexpected error
          </h1>
          <p style={{ fontSize: "14px", color: "#9ca3af", marginTop: "8px" }}>
            The application failed to load. Reloading usually fixes this.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "20px",
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              background: "#4f6ea8",
              color: "white",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

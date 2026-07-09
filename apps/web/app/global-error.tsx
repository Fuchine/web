"use client";

// Last-resort boundary: fires only when the root layout itself throws, so it
// must render its own <html>/<body> and cannot rely on AppShell or the app's
// CSS being present. Styles are inlined with the brand token values so it looks
// intentional even when everything else has failed.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "40px",
          textAlign: "center",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          background: "#FAF8F4",
          color: "#211E1A",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: "oklch(0.355 0.074 252)",
            color: "#F2F5FB",
            display: "grid",
            placeItems: "center",
            fontFamily: "'Noto Serif JP', serif",
            fontSize: 28,
            lineHeight: 1,
          }}
        >
          淵
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 15, margin: 0, opacity: 0.7, maxWidth: 360 }}>
          The app hit an unexpected error. Try reloading the page.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            height: 38,
            padding: "0 16px",
            border: "1px solid transparent",
            background: "oklch(0.355 0.074 252)",
            color: "#F2F5FB",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 550,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

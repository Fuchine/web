import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fuchine",
  description: "Learn Japanese by immersion in YouTube video.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (incl. the Fuchine extension) inject attributes on
    // <html>/<body> before hydration; suppress the resulting dev warning.
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

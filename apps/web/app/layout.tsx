import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PWA_THEME_COLOR } from "@/lib/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fuchine",
  description: "Learn Japanese by immersion in YouTube video.",
  applicationName: "Fuchine",
  // iOS ignores most of the manifest: home-screen title, icon and standalone mode come from here.
  appleWebApp: { capable: true, title: "Fuchine", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch / home indicator; screens pad with env(safe-area-inset-*).
  viewportFit: "cover",
  // The on-screen keyboard overlays the page instead of shrinking the layout
  // viewport, so typing a cloze answer doesn't reflow the review card (Android).
  interactiveWidget: "resizes-visual",
  themeColor: PWA_THEME_COLOR,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (incl. the Fuchine extension) inject attributes on
    // <html>/<body> before hydration; suppress the resulting dev warning.
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

import type { MetadataRoute } from "next";
import { PWA_THEME_COLOR } from "@/lib/pwa";

// Web app manifest (T3.13). The installed app opens straight into the review
// queue: on a phone, Fuchine is a place to review short clips, not to import or
// watch whole videos. Colors are the light theme tokens (--bg); the icons are
// the 淵 mark rendered once into public/icons (SVG source checked in beside them).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/review",
    name: "Fuchine",
    short_name: "Fuchine",
    description: "Review your mined Japanese sentences with the original video clips.",
    start_url: "/review",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PWA_THEME_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: "en",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

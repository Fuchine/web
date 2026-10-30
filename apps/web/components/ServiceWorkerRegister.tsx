"use client";

import { useEffect } from "react";
import { SERVICE_WORKER_URL } from "@/lib/pwa";

/**
 * Registers public/sw.js (T3.13) — production builds only, so `next dev`
 * never serves stale chunks from a worker cache. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" }).catch(() => {
        // Not fatal: the app works the same without the worker.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}

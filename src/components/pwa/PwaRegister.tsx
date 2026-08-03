"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      registration.update().catch(() => undefined);
    }).catch((error) => {
      console.warn("[PWA] Service worker não registrado", error);
    });
  }, []);

  return null;
}

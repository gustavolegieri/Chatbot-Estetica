// Wraps React.lazy with a one-time reload on chunk load failures.
// Prevents blank screens when a stale index.html references a chunk hash
// that no longer exists after a redeploy.
import { lazy, ComponentType } from "react";

const RELOAD_KEY = "__lazy_chunk_reloaded__";

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isChunkError =
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Loading chunk [\d]+ failed/i.test(msg) ||
        /Importing a module script failed/i.test(msg);

      if (isChunkError && typeof window !== "undefined") {
        const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY);
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
          // Return a never-resolving promise so Suspense keeps the fallback
          // while the page reloads.
          return new Promise(() => {}) as any;
        }
      }
      throw err;
    }
  });
}

import { buildPollinationsUrl } from "@/lib/imageService";

interface DiagnosticImageCandidateInput {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  initialSrc?: string | null;
}

function shortenPrompt(prompt: string, maxLen = 240): string {
  const cleaned = (prompt || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}, fashion editorial, soft natural light`;
}

function buildTurboUrl(prompt: string, w: number, h: number, seed: number): string {
  const clean = (prompt || "").replace(/\s+/g, " ").trim().slice(0, 800);
  // enhance=false skips Pollinations' internal prompt rewriter (~1s faster)
  // referrer hints to the queue that this is a known client
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?width=${w}&height=${h}&seed=${seed}&model=turbo&nologo=true&enhance=false&referrer=estelite`;
}

const imageLoadCache = new Map<string, Promise<string>>();
const resolvedImageCache = new Set<string>();
const staticImageCache = new Map<string, string>();

const LS_PREFIX = "estelite:diagImg:v3:";
const LS_VERSION_KEY = "estelite:diagImg:version";
const CURRENT_CACHE_VERSION = "3";

// One-time purge of stale entries from previous cache versions
try {
  if (typeof localStorage !== "undefined") {
    const v = localStorage.getItem(LS_VERSION_KEY);
    if (v !== CURRENT_CACHE_VERSION) {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("estelite:diagImg:") && !k.startsWith(LS_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(LS_VERSION_KEY, CURRENT_CACHE_VERSION);
    }
  }
} catch { /* ignore */ }

function lsGet(key: string): string | null {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(LS_PREFIX + key) : null; } catch { return null; }
}
function lsSet(key: string, url: string): void {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(LS_PREFIX + key, url); } catch { /* quota */ }
}

/** Clear all persisted diagnosis image URLs (memory + localStorage). */
export function clearDiagnosticImageCache(): void {
  staticImageCache.clear();
  resolvedImageCache.clear();
  imageLoadCache.clear();
  try {
    if (typeof localStorage === "undefined") return;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("estelite:diagImg:")) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export function isDiagnosticImageResolved(url: string | null | undefined): boolean {
  if (!url) return false;
  return resolvedImageCache.has(url);
}

export function getStaticDiagnosticImage(key: string | null | undefined): string | null {
  if (!key) return null;
  const mem = staticImageCache.get(key);
  if (mem) return mem;
  const persisted = lsGet(key);
  if (persisted) {
    staticImageCache.set(key, persisted);
    resolvedImageCache.add(persisted);
    return persisted;
  }
  return null;
}

export function setStaticDiagnosticImage(key: string | null | undefined, url: string | null | undefined): void {
  if (!key || !url) return;
  staticImageCache.set(key, url);
  resolvedImageCache.add(url);
  lsSet(key, url);
}

export function loadDiagnosticImageUrl(url: string, timeoutMs = 30000): Promise<string> {
  if (!url) return Promise.reject(new Error("empty image url"));
  if (resolvedImageCache.has(url)) return Promise.resolve(url);
  const cached = imageLoadCache.get(url);
  if (cached) return cached;

  const promise = new Promise<string>((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (ok) {
        resolvedImageCache.add(url);
        resolve(url);
      } else {
        reject(new Error("image load failed"));
      }
    };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    img.decoding = "async";
    (img as HTMLImageElement & { fetchPriority?: "high" | "low" | "auto" }).fetchPriority = "high";
    img.onload = () => {
      if (typeof img.decode === "function") {
        void img.decode().catch(() => undefined).finally(() => done(true));
        return;
      }
      done(true);
    };
    img.onerror = () => done(false);
    img.src = url;
  }).catch((error) => {
    imageLoadCache.delete(url);
    throw error;
  });

  imageLoadCache.set(url, promise);
  return promise;
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  return Array.from(new Set(urls.filter(Boolean) as string[]));
}

export function getDiagnosticImageCandidateUrls({
  prompt,
  width,
  height,
  seed,
  initialSrc,
}: DiagnosticImageCandidateInput): string[] {
  const baseUrl = buildPollinationsUrl(prompt, width, height, seed);
  // Turbo first — ~3x faster than flux, acceptable quality for editorial fills.
  // Flux variants are kept as fallback for higher-fidelity retries.
  return uniqueUrls([
    initialSrc,
    buildTurboUrl(shortenPrompt(prompt, 240), width, height, seed),
    buildTurboUrl(shortenPrompt(prompt, 140), width, height, seed + 23757),
    initialSrc !== baseUrl ? baseUrl : null,
    buildPollinationsUrl(prompt, width, height, seed + 7919),
    buildPollinationsUrl(shortenPrompt(prompt, 280), width, height, seed + 15838),
  ]);
}

export function getFastDiagnosticImageCandidateUrls({
  prompt,
  width,
  height,
  seed,
  initialSrc,
}: DiagnosticImageCandidateInput): string[] {
  // Cap dimensions for max speed — pollinations turbo responds ~1.5-3s at 512px
  const w = Math.min(width, 512);
  const h = Math.min(height, 512);
  return uniqueUrls([
    initialSrc,
    buildTurboUrl(shortenPrompt(prompt, 140), w, h, seed + 23757),
  ]);
}

export function warmupDiagnosticImages(urls: string[]) {
  const queue = Array.from(new Set(urls.filter(Boolean)));
  let active = 0;
  let index = 0;
  const runNext = () => {
    while (active < 16 && index < queue.length) {
      const url = queue[index++];
      active += 1;
      void loadDiagnosticImageUrl(url, 45000)
        .catch(() => undefined)
        .finally(() => {
          active -= 1;
          runNext();
        });
    }
  };
  runNext();
}


/**
 * Preload one image per "group" (each group is an ordered list of candidate
 * URLs for the same slot). Resolves when every group has either succeeded
 * with one candidate or exhausted all of them.
 */
export function preloadDiagnosticImageGroups(
  groups: Array<string[] | { key?: string; urls: string[] }>,
  onProgress?: (loaded: number, total: number) => void,
  perCandidateTimeoutMs = 30000,
): Promise<void> {
  const cleaned = groups.map((g) => {
    const urls = Array.isArray(g) ? g : g.urls;
    const key = Array.isArray(g) ? undefined : g.key;
    return { key, urls: Array.from(new Set(urls.filter(Boolean))) };
  });
  const total = cleaned.length;
  if (total === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let done = 0;
    let cursor = 0;
    let active = 0;

    const finishOne = () => {
      done += 1;
      onProgress?.(done, total);
      active -= 1;
      if (done >= total) resolve();
      else runNext();
    };

    const processGroup = async (group: { key?: string; urls: string[] }) => {
      if (group.urls.length === 0) {
        finishOne();
        return;
      }

      await new Promise<void>((complete) => {
        let settled = false;
        let failures = 0;
        const timers: number[] = [];
        const finish = (loadedUrl?: string) => {
          if (settled) return;
          settled = true;
          timers.forEach(window.clearTimeout);
          if (loadedUrl) setStaticDiagnosticImage(group.key, loadedUrl);
          finishOne();
          complete();
        };

        group.urls.forEach((url, index) => {
          const timer = window.setTimeout(() => {
            void loadDiagnosticImageUrl(url, perCandidateTimeoutMs)
              .then((loadedUrl) => finish(loadedUrl))
              .catch(() => {
                failures += 1;
                if (failures >= group.urls.length) finish();
              });
          }, index * 180);
          timers.push(timer);
        });

        timers.push(window.setTimeout(() => finish(), perCandidateTimeoutMs + 3200));
      });
    };

    const runNext = () => {
      while (active < 8 && cursor < cleaned.length) {
        const group = cleaned[cursor++];
        active += 1;
        void processGroup(group);
      }
    };

    runNext();
  });
}

/**
 * Strict preloader: resolves only after every non-empty group has a real,
 * browser-loaded URL saved in the static cache. Failed groups keep retrying so
 * the UI is never released with a visible image loader still pending.
 */
export function preloadDiagnosticImageGroupsStrict(
  groups: Array<string[] | { key?: string; urls: string[] }>,
  onProgress?: (loaded: number, total: number) => void,
  perCandidateTimeoutMs = 6000,
  retryDelayMs = 200,
  maxAttempts = 3,
): Promise<void> {
  const cleaned = groups.map((g) => {
    const urls = Array.isArray(g) ? g : g.urls;
    const key = Array.isArray(g) ? undefined : g.key;
    return { key, urls: Array.from(new Set(urls.filter(Boolean))) };
  });
  const total = cleaned.length;
  if (total === 0) return Promise.resolve();

  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const raceGroupOnce = (group: { urls: string[] }): Promise<string | null> => new Promise((complete) => {
    let settled = false;
    let failures = 0;
    const timers: number[] = [];
    const finish = (loadedUrl: string | null) => {
      if (settled) return;
      settled = true;
      timers.forEach(window.clearTimeout);
      complete(loadedUrl);
    };

    // Fire all candidates simultaneously — no stagger, race the fastest
    group.urls.forEach((url) => {
      void loadDiagnosticImageUrl(url, perCandidateTimeoutMs)
        .then((loadedUrl) => finish(loadedUrl))
        .catch(() => {
          failures += 1;
          if (failures >= group.urls.length) finish(null);
        });
    });

    timers.push(window.setTimeout(() => finish(null), perCandidateTimeoutMs + 500));
  });

  return new Promise((resolve) => {
    let done = 0;
    let cursor = 0;
    let active = 0;

    const finishOne = () => {
      done += 1;
      onProgress?.(done, total);
      active -= 1;
      if (done >= total) resolve();
      else runNext();
    };

    const processGroup = async (group: { key?: string; urls: string[] }) => {
      if (group.urls.length === 0) {
        finishOne();
        return;
      }

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const loadedUrl = await raceGroupOnce(group);
        if (loadedUrl) {
          setStaticDiagnosticImage(group.key, loadedUrl);
          finishOne();
          return;
        }
        if (attempt < maxAttempts - 1) await delay(retryDelayMs);
      }
      // After maxAttempts × perCandidateTimeoutMs without a confirmed load,
      // release the gate WITHOUT caching the URL. UI falls back to its own
      // editorial placeholder instead of waiting on an unloaded <img src>.
      finishOne();
    };

    function runNext() {
      while (active < 16 && cursor < cleaned.length) {
        const group = cleaned[cursor++];
        active += 1;
        void processGroup(group);
      }
    }

    runNext();
  });
}

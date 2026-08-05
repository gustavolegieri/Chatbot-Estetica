import { supabase } from '@/integrations/supabase/client';

// Global limiter for edge function invocations that share worker capacity
// (search-clothing-image in particular). Too many parallel invocations cause
// 503 BOOT_ERROR from the runtime; we serialize them and retry on transient
// boot failures.
const MAX_CONCURRENT = 1;
let running = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    const tryRun = () => {
      if (running < MAX_CONCURRENT) {
        running++;
        resolve();
      } else {
        queue.push(tryRun);
      }
    };
    tryRun();
  });
}

function release() {
  running--;
  const next = queue.shift();
  if (next) next();
}

function isBootOr503(err: any, data: any): boolean {
  const msg = String(err?.message || err || '');
  if (/503|BOOT_ERROR|Failed to start|boot error/i.test(msg)) return true;
  const code = (data && (data.code || data.error)) || '';
  return /BOOT_ERROR/i.test(String(code));
}

function isPexelsThrottle(name: string, err: any, data: any): boolean {
  // Pexels foi removido - não há mais throttle
  return false;
}

export async function invokeWithQueue(
  name: string,
  options: { body: unknown },
  { retries = 3, retryDelayMs = 800, timeoutMs }: { retries?: number; retryDelayMs?: number; timeoutMs?: number } = {},
): Promise<{ data: any; error: any }> {
  await acquire();
  const deadline = timeoutMs ? Date.now() + timeoutMs : null;
  try {
    let attempt = 0;
    while (true) {
      const remaining = deadline ? deadline - Date.now() : null;
      if (remaining !== null && remaining <= 0) {
        return { data: null, error: new Error(`invoke ${name} timeout after ${timeoutMs}ms`) };
      }
      let res: any;
      try {
        const invokePromise = supabase.functions.invoke(name, options as any);
        res = remaining === null
          ? await invokePromise
          : await Promise.race([
              invokePromise,
              new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error(`invoke ${name} timeout after ${timeoutMs}ms`) }), remaining)),
            ]);
      } catch (err) {
        if (isPexelsThrottle(name, err, null)) {
          return { data: { imageUrl: null, providerStatus: 429, skipped: true }, error: null };
        }
        return { data: null, error: err };
      }
      if (isPexelsThrottle(name, res.error, res.data)) {
        return { data: { imageUrl: null, providerStatus: 429, skipped: true }, error: null };
      }
      if (!res.error && !(res.data && (res.data as any).code === 'BOOT_ERROR')) {
        return res as any;
      }
      if (attempt >= retries || !isBootOr503(res.error, res.data)) {
        return res as any;
      }
      const wait = retryDelayMs * Math.pow(2, attempt) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
    }
  } finally {
    release();
  }
}

import { useState, useCallback, useEffect, useMemo } from "react";
import { buildPollinationsUrl } from "@/lib/imageService";
import { getDiagnosticImageCandidateUrls, getStaticDiagnosticImage, isDiagnosticImageResolved, loadDiagnosticImageUrl, setStaticDiagnosticImage } from "@/lib/diagnosticImageLoader";

interface DiagnosticImageProps {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  alt?: string;
  className?: string;
  initialSrc?: string | null;
  priority?: boolean;
  staticKey?: string;
  /** Hard cap (per render attempt) before showing error+retry UI. Default 15s. */
  timeoutMs?: number;
}

/**
 * EST ELITE — Image renderer with strict timeout + manual retry.
 * - Races candidate URLs in parallel for fastest first paint.
 * - Hard cap (default 15s): if nothing loads, shows error UI with a Retry button.
 * - NEVER loops forever. User decides when to retry.
 */
export function DiagnosticImage({
  prompt, width, height, seed, alt = "", className = "", initialSrc, priority = true, staticKey,
  timeoutMs = 15000,
}: DiagnosticImageProps) {

  const baseUrl = useMemo(
    () => buildPollinationsUrl(prompt, width, height, seed),
    [prompt, width, height, seed],
  );
  const candidates = useMemo(
    () => getDiagnosticImageCandidateUrls({ prompt, width, height, seed, initialSrc: initialSrc || baseUrl }),
    [initialSrc, baseUrl, prompt, width, height, seed],
  );

  const preResolved = useMemo(
    () => getStaticDiagnosticImage(staticKey) ?? candidates.find((url) => isDiagnosticImageResolved(url)) ?? null,
    [staticKey, candidates],
  );

  const [src, setSrc] = useState<string | null>(preResolved);
  const [loading, setLoading] = useState(!preResolved);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (preResolved) {
      setSrc(preResolved);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    let resolved = false;
    let failures = 0;
    const startedAt = Date.now();

    setError(false);
    setLoading(true);
    setSrc(null);

    // Hard cap — never infinite loading.
    const hardTimer = window.setTimeout(() => {
      if (resolved || cancelled) return;
      cancelled = true;
      console.warn(`[DiagnosticImage] timeout after ${Date.now() - startedAt}ms (key=${staticKey || 'n/a'})`);
      setLoading(false);
      setError(true);
    }, timeoutMs);

    // Race all candidates in parallel — fastest wins.
    candidates.forEach((url) => {
      void loadDiagnosticImageUrl(url, timeoutMs)
        .then((loadedUrl) => {
          if (cancelled || resolved) return;
          resolved = true;
          window.clearTimeout(hardTimer);
          setStaticDiagnosticImage(staticKey, loadedUrl);
          setSrc(loadedUrl);
          setLoading(false);
          setError(false);
          console.log(`[DiagnosticImage] loaded in ${Date.now() - startedAt}ms (key=${staticKey || 'n/a'})`);
        })
        .catch(() => {
          failures += 1;
          if (!cancelled && !resolved && failures >= candidates.length) {
            window.clearTimeout(hardTimer);
            setLoading(false);
            setError(true);
          }
        });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(hardTimer);
    };
  }, [candidates, priority, attempt, preResolved, staticKey, timeoutMs]);

  const handleLoad = useCallback(() => setLoading(false), []);

  const handleError = useCallback(() => {
    setSrc(null);
    setError(true);
    setLoading(false);
  }, []);

  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setAttempt((value) => value + 1);
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-card via-muted/20 to-card" aria-label="Carregando imagem">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/10 via-transparent to-muted/30" aria-hidden />
          <p className="relative z-10 text-[10px] font-sans uppercase tracking-widest text-muted-foreground/80 text-center px-3">
            Gerando recomendação visual...
          </p>
        </div>
      )}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/30 text-muted-foreground/80 text-xs font-sans tracking-wide p-4 text-center">
          <span>Não foi possível gerar esta imagem</span>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1.5 rounded-full border border-primary/40 text-primary text-[10px] uppercase tracking-widest hover:bg-primary/10 transition"
          >
            Tentar novamente
          </button>
        </div>
      ) : src ? (
        <img
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // @ts-expect-error fetchpriority is valid but not typed
          fetchpriority={priority ? "high" : "auto"}
          className={`w-full h-full object-cover transition-opacity duration-200 ${loading ? "opacity-0" : "opacity-100"}`}
        />
      ) : null}
    </div>
  );
}

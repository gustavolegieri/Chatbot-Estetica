// EST ELITE — Read-only section image hook.
//
// Toda a lógica de busca/validação de imagens do dossiê agora é feita
// server-side pela edge function `generate-section-images` (disparada
// uma única vez, dentro de `process-diagnosis`, após o dossiê ser salvo).
// Este hook simplesmente LÊ `diagnosis_section_images` filtrando por
// `diagnosis_id` E pela assinatura (1 cor + 1 tecido + 1 estilo).
//
// Regra dura: se a linha existe mas a assinatura gravada é diferente da
// atual, tratamos como AUSENTE — o SmartSectionImage cai no pipeline live
// e re-grava a linha com a assinatura correta.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DiagnosticData } from '@/types/diagnostic';
import { useSectionImagesContext } from '@/contexts/SectionImagesContext';
import type { SectionId } from '@/lib/imageService';
import { resolveDossierAnchors, resolveSignatureWithDossier } from '@/lib/queryFragments';

export interface CachedRow {
  section: string;
  image_url: string;
  signature_style?: string | null;
  signature_color?: string | null;
  signature_fabric?: string | null;
  query_used?: string | null;
  validation_reason?: string | null;
}

const diagnosisCache = new Map<string, Promise<Record<string, CachedRow>>>();

export function clearDiagnosisImagesCache(diagnosisId?: string | null) {
  if (diagnosisId) diagnosisCache.delete(diagnosisId);
  else diagnosisCache.clear();
}

function normSig(s: string | null | undefined): string {
  return String(s || '').trim().toLowerCase();
}

/** True SOMENTE quando a linha tem assinatura idêntica à atual.
 *  Linhas legadas (sem assinatura gravada) OU com qualquer token
 *  divergente são rejeitadas — nunca reutilizamos imagem antiga. */
export function signatureMatches(
  row: Pick<CachedRow, 'signature_style' | 'signature_color' | 'signature_fabric'>,
  sig: { styleFrag: string; colorFrag: string; fabricFrag: string },
): boolean {
  const st = normSig(row.signature_style);
  const co = normSig(row.signature_color);
  const fa = normSig(row.signature_fabric);
  const wantSt = normSig(sig.styleFrag);
  const wantCo = normSig(sig.colorFrag);
  const wantFa = normSig(sig.fabricFrag);
  if (!st || !co || !fa) return false; // legado sem assinatura → nunca reutiliza
  if (!wantSt || !wantCo || !wantFa) return false; // assinatura atual incompleta → não confia no cache
  return st === wantSt && co === wantCo && fa === wantFa;
}


function mapRowsToCachedRows(rows: Array<Record<string, unknown>> | null | undefined): Record<string, CachedRow> {
  const map: Record<string, CachedRow> = {};
  for (const row of rows || []) {
    const section = typeof row.section === 'string' ? row.section : '';
    const imageUrl = typeof row.image_url === 'string' ? row.image_url : '';
    if (!section || !imageUrl) continue;
    map[section] = {
      section,
      image_url: imageUrl,
      signature_style:  (row.signature_style  as string | null) ?? null,
      signature_color:  (row.signature_color  as string | null) ?? null,
      signature_fabric: (row.signature_fabric as string | null) ?? null,
      query_used: (row.query_used as string | null) ?? null,
      validation_reason: (row.validation_reason as string | null) ?? null,
    };
  }
  return map;
}

async function loadDiagnosisImages(diagnosisId: string): Promise<Record<string, CachedRow>> {
  const existing = diagnosisCache.get(diagnosisId);
  if (existing) return existing;

  const promise = (async () => {
    // select('*') tolera coluna signature_* ausente (migração não aplicada).
    const { data, error } = await supabase
      .from('diagnosis_section_images')
      .select('*')
      .eq('diagnosis_id', diagnosisId);
    if (error) {
      console.warn('[section-image] db read error', error.message);
      return {} as Record<string, CachedRow>;
    }
    return mapRowsToCachedRows(data as Array<Record<string, unknown>>);
  })();

  diagnosisCache.set(diagnosisId, promise);
  return promise;
}

function resolveStorageKey(section: string, variant: 'primary' | 'secondary'): string {
  if (variant === 'secondary') {
    if (section === 'estilo') return 'movimento';
    if (section === 'cores') return 'paleta';
  }
  return section;
}

export function shouldReuseSectionImageRow(
  row: Pick<CachedRow, 'signature_style' | 'signature_color' | 'signature_fabric' | 'query_used' | 'validation_reason'>,
  sig: { styleFrag: string; colorFrag: string; fabricFrag: string },
): boolean {
  if (!signatureMatches(row, sig)) return false;
  const queryUsed = String(row.query_used || '').trim().toLowerCase();
  const validationReason = String(row.validation_reason || '').trim().toLowerCase();
  // Reaproveitar apenas linhas geradas com metadados concretos. Linhas legadas
  // (sem query_used/validation_reason) ou com queries genéricas não podem mais
  // ser reutilizadas, porque elas podem estar vinculadas a um resultado ruim.
  if (!queryUsed && !validationReason) return false;
  // Versões anteriores marcavam como "validated" qualquer primeiro resultado
  // do provedor, mesmo quando a foto não correspondia à seção. Somente o
  // semantic-v8 exige comprovação da cor nos pixels da foto. Qualquer linha
  // anterior foi validada apenas por texto/metadados e deve ser refeita.
  return validationReason.includes('semantic-v9') && validationReason.includes('pixel-color-v6') && Boolean(queryUsed);
}

export function useSectionInternetImage(
  section: SectionId,
  variant: 'primary' | 'secondary',
  _diagnostic: DiagnosticData | null | undefined,
) {
  const ctx = useSectionImagesContext();
  const diagnosisId = ctx.diagnosisId || null;
  const storageKey = resolveStorageKey(section, variant);

  const signature = useMemo(() => {
    const anchors = resolveDossierAnchors(ctx.colorAnalysis ?? null, ctx.modelingAnalysis ?? null);
    return resolveSignatureWithDossier(ctx.diagnostic ?? null, ctx.questionnaire ?? null, anchors);
  }, [ctx.diagnostic, ctx.questionnaire, ctx.colorAnalysis, ctx.modelingAnalysis]);

  const snapshotMap = useMemo(
    () => ctx.sectionImagesSnapshot ? mapRowsToCachedRows(ctx.sectionImagesSnapshot) : null,
    [ctx.sectionImagesSnapshot],
  );

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(diagnosisId));

  useEffect(() => {
    if (!diagnosisId) { setUrl(null); setLoading(false); return; }

    const resolveFromMap = (map: Record<string, CachedRow>): string | null => {
      const row = map[storageKey];
      if (!row) return null;
      const reusable = shouldReuseSectionImageRow(row, signature);
      if (!reusable) {
        console.debug('[section-image] discard legacy/abstract row', {
          storageKey,
          queryUsed: row.query_used,
          validationReason: row.validation_reason,
          want: { s: signature.styleFrag, c: signature.colorFrag, f: signature.fabricFrag },
          got:  { s: row.signature_style, c: row.signature_color, f: row.signature_fabric },
        });
        return null;
      }
      return row.image_url;
    };

    if (snapshotMap) {
      setUrl(resolveFromMap(snapshotMap));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadDiagnosisImages(diagnosisId).then((map) => {
      if (cancelled) return;
      setUrl(resolveFromMap(map));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [diagnosisId, storageKey, snapshotMap, signature]);

  useEffect(() => {
    if (snapshotMap) return;
    if (ctx.frozen) return;
    if (!diagnosisId || url) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      diagnosisCache.delete(diagnosisId);
      loadDiagnosisImages(diagnosisId).then((map) => {
        const row = map[storageKey];
        const resolved = row && shouldReuseSectionImageRow(row, signature) ? row.image_url : null;
        if (resolved) { setUrl(resolved); setLoading(false); clearInterval(timer); }
        else if (tries >= 6) { setLoading(false); clearInterval(timer); }
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [diagnosisId, storageKey, url, snapshotMap, ctx.frozen, signature]);

  const result = useMemo(() => ({ url, loading }), [url, loading]);
  return result;
}

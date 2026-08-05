import { createContext, useContext, useRef, ReactNode, useMemo } from 'react';
import type { DiagnosticData } from '@/types/diagnostic';

export interface SectionImagesContextValue {
  /** Pre-generated server-stored URLs keyed by section id (legacy/fallback). */
  imagesMap?: Record<string, string> | null;
  /** Full diagnostic data used to build varied prompts. */
  diagnostic?: DiagnosticData | null;
  /** Diagnosis UUID — used to read pre-computed section images from DB. */
  diagnosisId?: string | null;
  /** Raw final_diagnosis blob — used to derive image restrictions. */
  finalDiagnosis?: Record<string, unknown> | null;
  /** Pre-computed restriction keywords (EN) to filter image results. */
  restrictions?: string[];
  /** Deduplication set — URLs already used in this dossier render. Shared. */
  usedImageUrls?: Set<string>;
  /** Diagnosis-specific image query hints extracted from generated pieces/colors. */
  imageQueryHints?: { pieces?: string[]; colors?: string[] };
  /** True quando estamos renderizando para PDF — hooks devem evitar novas buscas. */
  isPdfMode?: boolean;
  /** True quando o diagnóstico está concluído — hooks NUNCA devem invocar geração. */
  frozen?: boolean;
  /** Snapshot congelado das imagens de seção usado exclusivamente na renderização PDF. */
  sectionImagesSnapshot?: Array<Record<string, unknown>> | null;
  /** Dispara re-leitura das tabelas de imagens (clothing_images / look_images) após persistência. */
  refreshImages?: () => void;
  /** Raw questionnaire — usado para extrair paleta/exclusões dinamicamente por diagnóstico. */
  questionnaire?: Record<string, unknown> | null;
  /** Análise de cor do dossiê — fonte real da cor-âncora das imagens. */
  colorAnalysis?: Record<string, unknown> | null;
  /** Análise de modelagem do dossiê — fonte real do tecido-âncora das imagens. */
  modelingAnalysis?: Record<string, unknown> | null;
  /** Análise de estilo original — fonte prioritária do estilo predominante. */
  styleAnalysis?: Record<string, unknown> | null;

}


const SectionImagesContext = createContext<SectionImagesContextValue>({});

export function SectionImagesProvider({
  value,
  children,
}: {
  value: SectionImagesContextValue;
  children: ReactNode;
}) {
  const dedupeRef = useRef<Set<string>>(new Set());
  const merged = useMemo<SectionImagesContextValue>(
    () => ({ ...(value || {}), usedImageUrls: value?.usedImageUrls ?? dedupeRef.current }),
    [value],
  );
  return <SectionImagesContext.Provider value={merged}>{children}</SectionImagesContext.Provider>;
}

export function useSectionImagesContext(): SectionImagesContextValue {
  return useContext(SectionImagesContext);
}

/** Legacy compat: just the imagesMap as a flat record. */
export function useSectionImagesMap(): Record<string, string> | null | undefined {
  return useContext(SectionImagesContext).imagesMap;
}

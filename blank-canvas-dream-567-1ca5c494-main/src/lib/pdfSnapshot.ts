export interface PdfSnapshot {
  diagnosisId: string;
  diagnosis?: Record<string, unknown> | null;
  clothingImages?: Array<Record<string, unknown>>;
  lookImages?: Array<Record<string, unknown>>;
  sectionImages?: Array<Record<string, unknown>>;
  createdAt?: string;
}

export function getPdfSnapshot(diagnosisId: string | null | undefined): PdfSnapshot | null {
  if (typeof window === 'undefined' || !diagnosisId) return null;
  try {
    const raw = window.localStorage.getItem(`estelite_pdf_snapshot_${diagnosisId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PdfSnapshot;
    const snapshotDiagnosisId = String(parsed?.diagnosisId || '');
    const rowDiagnosisId = String((parsed?.diagnosis as { id?: unknown } | null)?.id || '');
    if (snapshotDiagnosisId !== diagnosisId || (rowDiagnosisId && rowDiagnosisId !== diagnosisId)) return null;
    return parsed;
  } catch (error) {
    console.warn('[pdf-snapshot] invalid snapshot ignored', error);
    return null;
  }
}

export function getExpectedPdfDiagnosisId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('estelite_pdf_expected_diagnosis_id');
}
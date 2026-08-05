import { useCallback, useRef, useState } from 'react';

export const DIAGNOSIS_DRAFT_KEY = 'est_elite_diagnosis_draft';

const LEGACY_DRAFT_KEY = 'diagnosis_progress_v1';
const LEGACY_PHOTOS_KEY = 'diagnosis_photos_cache';

type StoredPhoto = {
  dataUrl: string;
  name: string;
  type: string;
  lastModified?: number;
};

export type DiagnosisDraft<TAnswers> = {
  version: 1;
  step: number;
  block: number;
  question: number;
  answers: TAnswers;
  photos?: Record<string, StoredPhoto | null>;
  progress?: {
    stepPercent?: number;
    blockPercent?: number;
    totalBlocks?: number;
  };
  updatedAt: string;
};

type SaveDraftInput<TAnswers, TPhotos extends object> = {
  step: number;
  block: number;
  question?: number;
  answers: TAnswers;
  photos?: TPhotos;
  progress?: DiagnosisDraft<TAnswers>['progress'];
};

type UseDiagnosisDraftOptions<TAnswers, TPhotos extends object> = {
  emptyAnswers: TAnswers;
  emptyPhotos: TPhotos;
};

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const clampInteger = (value: unknown, fallback: number, min = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  return true;
};

const mergeAnswers = <TAnswers,>(emptyAnswers: TAnswers, answers: unknown): TAnswers => {
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    return { ...(emptyAnswers as Record<string, unknown>), ...(answers as Record<string, unknown>) } as TAnswers;
  }
  return { ...(emptyAnswers as Record<string, unknown>) } as TAnswers;
};

const parseStoredDraft = <TAnswers,>(raw: string | null, emptyAnswers: TAnswers): DiagnosisDraft<TAnswers> | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const answers = parsed.answers ?? parsed.questionnaire;
    return {
      version: 1,
      step: clampInteger(parsed.step, 1),
      block: clampInteger(parsed.block ?? parsed.currentBlock, 1),
      question: clampInteger(parsed.question ?? parsed.currentQuestion ?? parsed.block, 1),
      answers: mergeAnswers(emptyAnswers, answers),
      photos: (parsed.photos && typeof parsed.photos === 'object' ? parsed.photos : undefined) as DiagnosisDraft<TAnswers>['photos'],
      progress: (parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : undefined) as DiagnosisDraft<TAnswers>['progress'],
      updatedAt: typeof parsed.updatedAt === 'string'
        ? parsed.updatedAt
        : parsed.savedAt
          ? new Date(Number(parsed.savedAt)).toISOString()
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const readDraftFromStorage = <TAnswers,>(emptyAnswers: TAnswers): DiagnosisDraft<TAnswers> | null => {
  if (!isBrowser()) return null;

  const current = parseStoredDraft(window.localStorage.getItem(DIAGNOSIS_DRAFT_KEY), emptyAnswers);
  if (current) return current;

  const legacy = parseStoredDraft(window.localStorage.getItem(LEGACY_DRAFT_KEY), emptyAnswers);
  if (!legacy) return null;

  const legacyPhotosRaw = window.localStorage.getItem(LEGACY_PHOTOS_KEY) || window.sessionStorage.getItem(LEGACY_PHOTOS_KEY);
  if (legacyPhotosRaw) {
    try {
      legacy.photos = JSON.parse(legacyPhotosRaw) as DiagnosisDraft<TAnswers>['photos'];
    } catch {
      legacy.photos = undefined;
    }
  }

  return legacy;
};

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const compressImageDataUrl = (dataUrl: string, maxSide = 900, quality = 0.72) => new Promise<string>((resolve) => {
  const image = new Image();
  image.onload = () => {
    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(dataUrl);
      return;
    }
    ctx.drawImage(image, 0, 0, width, height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
  };
  image.onerror = () => resolve(dataUrl);
  image.src = dataUrl;
});

const fileToStoredPhoto = async (file: File): Promise<StoredPhoto> => {
  const original = await fileToDataUrl(file);
  const dataUrl = file.type.startsWith('image/') ? await compressImageDataUrl(original) : original;
  return {
    dataUrl,
    name: file.name,
    type: dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : file.type,
    lastModified: file.lastModified,
  };
};

const dataUrlToFile = (photo: StoredPhoto): File | null => {
  try {
    const [meta, base64] = photo.dataUrl.split(',');
    if (!base64) return null;
    const mime = /data:(.*?);base64/.exec(meta)?.[1] || photo.type || 'image/jpeg';
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], photo.name || 'diagnostico.jpg', { type: mime, lastModified: photo.lastModified });
  } catch {
    return null;
  }
};

const photosFingerprint = (photos: object) => Object.entries(photos as Record<string, File | null | undefined>)
  .map(([key, file]) => `${key}:${file?.name ?? ''}:${file?.size ?? 0}:${file?.lastModified ?? 0}`)
  .join('|');

export function useDiagnosisDraft<TAnswers, TPhotos extends object>({ emptyAnswers, emptyPhotos }: UseDiagnosisDraftOptions<TAnswers, TPhotos>) {
  const [initialDraft] = useState<DiagnosisDraft<TAnswers> | null>(() => readDraftFromStorage(emptyAnswers));
  const cachedPhotosRef = useRef<Record<string, StoredPhoto | null> | undefined>(initialDraft?.photos);
  const cachedPhotosFingerprintRef = useRef('');
  const saveSequenceRef = useRef(0);

  const readDraft = useCallback(() => readDraftFromStorage(emptyAnswers), [emptyAnswers]);

  const hasDraftContent = useCallback((draft: DiagnosisDraft<TAnswers> | null) => {
    if (!draft) return false;
    if (draft.step > 1 || draft.block > 1 || draft.question > 1) return true;
    if (draft.photos && Object.values(draft.photos).some(Boolean)) return true;
    return hasMeaningfulValue(draft.answers);
  }, []);

  const restorePhotos = useCallback((draft: DiagnosisDraft<TAnswers> | null): TPhotos => {
    const restored = { ...(emptyPhotos as Record<string, File | null>) };
    if (!isBrowser() || !draft?.photos) return restored as TPhotos;

    for (const key of Object.keys(restored)) {
      const stored = draft.photos[key];
      restored[key] = stored ? dataUrlToFile(stored) : null;
    }

    return restored as TPhotos;
  }, [emptyPhotos]);

  const saveDraft = useCallback(async ({ step, block, question, answers, photos, progress }: SaveDraftInput<TAnswers, TPhotos>) => {
    if (!isBrowser()) return;
    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;

    let serializedPhotos = cachedPhotosRef.current;
    if (photos) {
      const fingerprint = photosFingerprint(photos);
      if (fingerprint !== cachedPhotosFingerprintRef.current) {
        const nextPhotos: Record<string, StoredPhoto | null> = {};
        for (const [key, file] of Object.entries(photos as Record<string, File | null | undefined>)) {
          nextPhotos[key] = file ? await fileToStoredPhoto(file) : null;
        }
        cachedPhotosFingerprintRef.current = fingerprint;
        cachedPhotosRef.current = nextPhotos;
        serializedPhotos = nextPhotos;
      }
    }

    if (saveSequence !== saveSequenceRef.current) return;

    const draft: DiagnosisDraft<TAnswers> = {
      version: 1,
      step: clampInteger(step, 1),
      block: clampInteger(block, 1),
      question: clampInteger(question ?? block, 1),
      answers,
      photos: serializedPhotos,
      progress,
      updatedAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(DIAGNOSIS_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      try {
        window.localStorage.setItem(DIAGNOSIS_DRAFT_KEY, JSON.stringify({ ...draft, photos: undefined }));
      } catch {
        try { window.sessionStorage.setItem(DIAGNOSIS_DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage unavailable */ }
      }
    }
  }, []);

  const clearDraft = useCallback(() => {
    if (!isBrowser()) return;
    window.localStorage.removeItem(DIAGNOSIS_DRAFT_KEY);
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
    window.localStorage.removeItem(LEGACY_PHOTOS_KEY);
    window.sessionStorage.removeItem(DIAGNOSIS_DRAFT_KEY);
    window.sessionStorage.removeItem(LEGACY_PHOTOS_KEY);
    cachedPhotosRef.current = undefined;
    cachedPhotosFingerprintRef.current = '';
    saveSequenceRef.current += 1;
  }, []);

  return {
    initialDraft,
    readDraft,
    restorePhotos,
    saveDraft,
    clearDraft,
    hasDraftContent,
  };
}
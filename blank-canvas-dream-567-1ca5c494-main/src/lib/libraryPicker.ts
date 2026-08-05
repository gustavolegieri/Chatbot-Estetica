// Biblioteca curada local — fonte PRIMÁRIA de imagens do dossiê.
// Resolve (estilo × paleta) a partir do diagnóstico + questionário e escolhe
// UMA foto por seção via hash determinístico (mesmo diagnóstico → mesma foto
// na 2ª geração; diagnósticos diferentes com mesmo perfil → fotos diferentes
// dentro do mesmo pool).
//
// Todas as fotos vivem em `public/assets/library/{estilo}_{paleta}/NN.jpg`
// e foram pré-aprovadas visualmente. Não depende de rede em runtime.

import type { DiagnosticData } from '@/types/diagnostic';
import indexJson from '../../public/assets/library/index.json';

const LIBRARY_INDEX = indexJson as Record<string, string[]>;

export type LibraryEstilo =
  | 'classico' | 'romantico' | 'natural' | 'moderno' | 'dramatico' | 'criativo';
export type LibraryPaleta =
  | 'neutros_quentes' | 'frios_profundos' | 'rosados_poeticos' | 'vibrante';

// ---------- Resolução de perfil ----------

const ESTILO_MAP: Record<string, LibraryEstilo> = {
  'Clássico e atemporal':   'classico',
  'Romântico e delicado':   'romantico',
  'Moderno e minimalista':  'moderno',
  'Ousado e marcante':      'dramatico',
  'Boho e despojado':       'natural',
  'Elegante e sofisticado': 'classico',
  'Criativo e artístico':   'criativo',
};

const PALETA_MAP: Record<string, LibraryPaleta> = {
  paleta_neutra:   'neutros_quentes',
  paleta_fria:     'frios_profundos',
  paleta_rose:     'rosados_poeticos',
  paleta_vibrante: 'vibrante',
};

/** Deriva estilo + paleta canônicos a partir do diagnóstico + questionário. */
export function resolveProfile(
  d: DiagnosticData | null | undefined,
  q: Record<string, unknown> | null | undefined,
): { estilo: LibraryEstilo; paleta: LibraryPaleta } {
  const estiloRaw = d?.estiloPersonalidade || '';
  const estilo: LibraryEstilo = ESTILO_MAP[estiloRaw] || 'moderno';

  const paletaRaw = String((q as any)?.psicometrico?.paleta || '');
  let paleta: LibraryPaleta = PALETA_MAP[paletaRaw];
  if (!paleta) {
    // Fallback: infere pela coloração do tom + estilo
    const tom = d?.tomDePele || '';
    const frio = /Cl[aá]ssico|Elegante|Moderno/i.test(estiloRaw);
    if (frio && /Escuro|Muito Escuro|M[eé]dio/i.test(tom)) paleta = 'frios_profundos';
    else if (frio) paleta = 'rosados_poeticos';
    else if (/Escuro|Muito Escuro/i.test(tom)) paleta = 'vibrante';
    else paleta = 'neutros_quentes';
  }
  return { estilo, paleta };
}

// ---------- Hash determinístico (cyrb53) ----------

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// ---------- Picker ----------

const BASE_URL = '/assets/library';

// Reserva síncrona por diagnóstico — evita que múltiplos tiles do mesmo
// dossiê (renderizados no mesmo commit React) escolham a mesma foto quando
// o `used` compartilhado ainda está vazio durante o useMemo.
const RESERVED: Map<string, Set<string>> = new Map();
const PICK_CACHE: Map<string, string> = new Map();
function getReserved(diagnosisId: string): Set<string> {
  let s = RESERVED.get(diagnosisId);
  if (!s) { s = new Set(); RESERVED.set(diagnosisId, s); }
  if (RESERVED.size > 8) {
    const firstKey = RESERVED.keys().next().value;
    if (firstKey && firstKey !== diagnosisId) {
      RESERVED.delete(firstKey);
      // limpa cache do diagnóstico expirado
      for (const k of Array.from(PICK_CACHE.keys())) {
        if (k.startsWith(`${firstKey}::`)) PICK_CACHE.delete(k);
      }
    }
  }
  return s;
}


/**
 * Escolhe UMA foto da biblioteca para (estilo × paleta × seção).
 * - Determinístico: mesmo (diagnosisId, sectionKey) sempre retorna o mesmo arquivo.
 * - Rotação intra-perfil: diagnósticos diferentes com o mesmo perfil pegam
 *   índices diferentes do pool.
 * - Retorna null se a pasta não tiver fotos aprovadas (fallback para API).
 * - Aceita `used` set para evitar reutilizar dentro do mesmo dossiê (tenta
 *   até N vezes com offsets sequenciais). Também respeita reserva síncrona
 *   global para evitar colisões durante o commit inicial.
 */
export function pickFromLibrary(
  diagnosisId: string,
  sectionKey: string,
  estilo: LibraryEstilo,
  paleta: LibraryPaleta,
  used?: Set<string> | null,
): string | null {
  // Cache por tile: garante estabilidade entre re-renders.
  const cacheKey = `${diagnosisId}::${sectionKey}`;
  const cached = PICK_CACHE.get(cacheKey);
  if (cached) return cached;

  // Pool primário + fallback: se a pasta (estilo×paleta) tiver <8 fotos,
  // completa com outras pastas da MESMA paleta (prioriza cor sobre estilo).
  const primary = `${estilo}_${paleta}`;
  const primaryFiles = (LIBRARY_INDEX[primary] || []).map(f => `${BASE_URL}/${primary}/${f}`);

  let pool = primaryFiles;
  if (primaryFiles.length < 8) {
    const NEIGHBORS: LibraryEstilo[] = ['classico','romantico','natural','moderno','dramatico','criativo'];
    for (const est of NEIGHBORS) {
      if (est === estilo) continue;
      const k = `${est}_${paleta}`;
      const arr = (LIBRARY_INDEX[k] || []).map(f => `${BASE_URL}/${k}/${f}`);
      pool = pool.concat(arr);
      if (pool.length >= 16) break;
    }
  }
  if (pool.length === 0) return null;

  const reserved = getReserved(diagnosisId);
  const baseIdx = cyrb53(`${diagnosisId}:${sectionKey}`) % pool.length;
  // Passo co-primo com pool.length dá varredura completa e dispersa (não
  // adjacente), reduzindo repetição visual entre tiles vizinhos.
  let step = 1 + (cyrb53(`step:${sectionKey}`) % Math.max(1, pool.length - 1));
  while (pool.length > 1 && gcd(step, pool.length) !== 1) step += 1;

  for (let n = 0; n < pool.length; n++) {
    const idx = (baseIdx + n * step) % pool.length;
    const url = pool[idx];
    const taken = reserved.has(url) || (used && used.has(url));
    if (!taken) {
      reserved.add(url);
      PICK_CACHE.set(cacheKey, url);
      return url;
    }
  }
  const fallback = pool[baseIdx];
  PICK_CACHE.set(cacheKey, fallback);
  return fallback;
}


function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/** Retorna todas as pastas disponíveis (útil pra debug/admin). */
export function listLibraryFolders(): Array<{ folder: string; count: number }> {
  return Object.entries(LIBRARY_INDEX).map(([folder, files]) => ({ folder, count: files.length }));
}


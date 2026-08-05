import { c as createClient } from '/assets/supabase-vendor-D96CddG4.js';

const SUPABASE_URL = 'https://vuptrdbizivuqwyrcebu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_surcMAtlOHkxeeT33eOW6g_sJT6nirn';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PROVIDERS = ['pexels-search-image', 'unsplash-search-image'];
const CUSTOM_IMAGE_ATTRIBUTE = 'data-diagnosis-curated-image';

let activeDiagnosisId = null;
let activeRun = 0;
let cleanupObserver = null;
let bootInProgressFor = null;

const REPLACEMENT_IDS = [
  'diagnosis-signature-live-image',
  'diagnosis-wardrobe-live-image',
  'diagnosis-capsule-text-only',
  'diagnosis-inspirations-live-images',
];
const DIAGNOSIS_TEMPLATE_ID = 'reference-9b049e89-v1';
const CAPSULE_TEMPLATE_SLOTS = 5;

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function collectStrings(value, output = [], depth = 0) {
  if (depth > 5 || value == null) return output;
  if (typeof value === 'string') {
    const text = normalizeText(value);
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output, depth + 1));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, output, depth + 1));
  }
  return output;
}

function firstField(source, keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && normalizeText(value)) return normalizeText(value);
    if (Array.isArray(value) && value.length) return normalizeText(value[0]);
  }
  return '';
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = normalizeText(value).toLocaleLowerCase('pt-BR');
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function compactStyleCandidates(value, output = [], depth = 0, insideStyleBranch = false) {
  if (depth > 4 || value == null) return output;
  if (typeof value === 'string') {
    const text = normalizeText(value);
    if (text && text.length <= 90) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => compactStyleCandidates(item, output, depth + 1, insideStyleBranch));
    return output;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      const isStyleBranch = insideStyleBranch || /estil|style|predomin|personalidade|assinatura|ranking|perfil/i.test(key);
      if (isStyleBranch) {
        compactStyleCandidates(item, output, depth + 1, true);
      }
    });
  }
  return output;
}

const CANONICAL_STYLES = [
  'Clássico',
  'Elegante',
  'Natural',
  'Romântico',
  'Moderno',
  'Criativo',
  'Dramático',
  'Sensual',
];

function canonicalStyle(value) {
  const style = normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (!style) return '';
  if (/classic|classico|tradicional|atemporal/.test(style)) return 'Clássico';
  if (/elegant|sofistic|refinad/.test(style)) return 'Elegante';
  if (/natural|esportiv|casual|despojad|relax/.test(style)) return 'Natural';
  if (/romantic|romantico|delicad|feminin/.test(style)) return 'Romântico';
  if (/modern|moderno|minimal|contempor|urban|executiv/.test(style)) return 'Moderno';
  if (/creative|criativ|artist|boho|boem|eclet/.test(style)) return 'Criativo';
  if (/dramatic|dramatico|ousad|marcant|impact/.test(style)) return 'Dramático';
  if (/sensual|sexy|sedutor|glam/.test(style)) return 'Sensual';
  return '';
}

function rankedStyleCandidates(diagnosis, styleAnalysis) {
  const internalScore = styleAnalysis?._score_interno?.pontuacoes;
  const sources = [internalScore, styleAnalysis?.pontuacoes, diagnosis.style_intensity_score];
  const ranked = [];
  sources.forEach((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    Object.entries(source)
      .filter(([, score]) => Number.isFinite(Number(score)))
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .forEach(([style]) => ranked.push(style));
  });
  return ranked;
}

function colorsForSeason(season) {
  const normalized = normalizeText(season).toLocaleLowerCase('pt-BR');
  if (normalized.includes('inverno')) return ['azul-royal', 'esmeralda', 'vermelho frio', 'branco puro', 'cinza frio'];
  if (normalized.includes('verão') || normalized.includes('verao')) return ['azul suave', 'rosa frio', 'lavanda', 'cinza claro', 'branco suave'];
  if (normalized.includes('outono')) return ['terracota', 'verde oliva', 'caramelo', 'mostarda', 'creme'];
  if (normalized.includes('primavera')) return ['coral', 'turquesa', 'verde vibrante', 'amarelo quente', 'marfim'];
  return [];
}

function diagnosisProfile(diagnosis) {
  const styleAnalysis = diagnosis.style_analysis || {};
  const colorAnalysis = diagnosis.color_analysis || {};
  const questionnaire = diagnosis.questionnaire || {};
  const rawPrimary = firstField(styleAnalysis, [
    'estilo_predominante', 'estiloPredominante', 'predominant_style', 'predominantStyle',
    'estilo_principal', 'estiloPrincipal', 'estilo_pessoal', 'estiloPessoal',
    'personal_style', 'personalStyle', 'estilo', 'style', 'estilo_personalidade',
    'estiloPersonalidade', 'nome_estilo', 'nomeEstilo', 'resultado',
  ]);
  const questionnaireStyle = firstField(questionnaire, [
    'estiloPredominante', 'estilo_predominante', 'estiloPrincipal', 'estilo_principal',
    'estiloPessoal', 'estilo_pessoal', 'estiloPersonalidade', 'estilo_personalidade',
    'estiloPreferido', 'estilo', 'personalStyle', 'style',
  ]);
  const rankedCandidates = rankedStyleCandidates(diagnosis, styleAnalysis);
  const explicitSecondaryCandidates = [
    ...collectStrings(styleAnalysis.estilos_secundarios),
    ...collectStrings(styleAnalysis.estilosSecundarios),
    ...collectStrings(styleAnalysis.secundarios),
    ...collectStrings(styleAnalysis.complementares),
    ...collectStrings(styleAnalysis.secondary_styles),
    ...collectStrings(styleAnalysis.secondaryStyles),
  ];
  const recognizedStyles = unique([
    rawPrimary,
    ...rankedCandidates,
    ...compactStyleCandidates(styleAnalysis),
    ...explicitSecondaryCandidates,
    questionnaireStyle,
    ...compactStyleCandidates(questionnaire),
  ].map(canonicalStyle).filter(Boolean));
  const primaryStyle = canonicalStyle(rawPrimary) || recognizedStyles[0] || 'Natural';
  const secondaryStyles = unique([
    ...explicitSecondaryCandidates.map(canonicalStyle),
    ...rankedCandidates.map(canonicalStyle),
    ...recognizedStyles,
  ].filter((style) => style && style !== primaryStyle)).slice(0, 2);
  const season = firstField(colorAnalysis, ['estacao', 'estacao_cor', 'cartela']);
  const explicitColors = unique([
    ...collectStrings(colorAnalysis.cores_principais),
    ...collectStrings(colorAnalysis.cores_recomendadas),
    ...collectStrings(colorAnalysis.paleta),
    ...collectStrings(colorAnalysis.cores),
    ...collectStrings(questionnaire.coresPreferidas),
    ...collectStrings(questionnaire.coresQueTeFazemBrilhar),
  ]).filter((color) => color.toLocaleLowerCase('pt-BR') !== season.toLocaleLowerCase('pt-BR'));
  const colors = unique([...explicitColors, ...colorsForSeason(season)]).slice(0, 5);
  const metal = firstField(questionnaire, ['metalPreferido', 'metais', 'metal'])
    || firstField(styleAnalysis, ['metal', 'metais'])
    || collectStrings(questionnaire).find((value) => /prata|dourad|ouro|silver|gold/i.test(value))
    || 'metal alinhado à sua cartela';
  return {
    primaryStyle,
    secondaryStyles,
    styleQuery: unique([primaryStyle, ...secondaryStyles]).join(' with ') || primaryStyle,
    colors,
    colorQuery: colors.join(' ') || 'harmonious personal color palette',
    primaryColor: colors[0] || 'cor principal da sua cartela',
    secondaryColor: colors[1] || colors[0] || 'neutro da sua cartela',
    metal,
  };
}

function fashionSearchStyle(style) {
  const value = normalizeText(style).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const terms = [];
  if (/elegant|sofistic|refinad/.test(value)) terms.push('elegant', 'contemporary', 'sophisticated');
  if (/contempor|atual/.test(value)) terms.push('contemporary', 'polished');
  if (/classic|classico|tradicional|atemporal/.test(value)) terms.push('classic', 'timeless', 'refined');
  if (/natural|casual|esportiv|sporty|confort/.test(value)) terms.push('relaxed', 'natural', 'chic');
  if (/romantic|romantico|delicad|feminin/.test(value)) terms.push('romantic', 'feminine', 'delicate');
  if (/dramatic|dramatico|ousad|impact/.test(value)) terms.push('bold', 'dramatic', 'modern');
  if (/modern|moderno|urban/.test(value)) terms.push('modern', 'urban', 'polished');
  if (/creative|criativ|artist|ecletic/.test(value)) terms.push('creative', 'artistic', 'eclectic');
  if (/sensual|sexy|glam/.test(value)) terms.push('glamorous', 'sensual', 'refined');
  if (/minimal/.test(value)) terms.push('modern', 'minimalist', 'refined');
  if (/bohem|boho/.test(value)) terms.push('bohemian', 'chic');
  if (/preppy/.test(value)) terms.push('polished', 'preppy');
  if (/vintage|retro/.test(value)) terms.push('vintage', 'inspired');
  return unique(terms).slice(0, 7).join(' ') || 'distinctive women fashion';
}

function weightedFashionSearchStyle(profile) {
  const primaryTerms = fashionSearchStyle(profile.primaryStyle).split(/\s+/).filter(Boolean).slice(0, 3);
  const secondaryTerms = profile.secondaryStyles.flatMap((style) => (
    fashionSearchStyle(style).split(/\s+/).filter(Boolean).slice(0, 2)
  ));
  return unique([...primaryTerms, ...secondaryTerms]).slice(0, 7).join(' ') || 'distinctive women fashion';
}

function canonicalImageUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return value;
  }
}

function validateImage(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = '';
      resolve(false);
    }, timeoutMs);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image.naturalWidth >= 320 && image.naturalHeight >= 320);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  });
}

async function searchValidatedImage(spec, diagnosisId, usedUrls) {
  const attemptErrors = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const provider = PROVIDERS[(spec.providerOffset + attempt) % PROVIDERS.length];
    const seed = stableHash(`${diagnosisId}:${spec.key}:${attempt}`);
    let payload;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${provider}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        query: (provider.startsWith('unsplash') ? spec.shortQuery : spec.query).slice(0, 118),
        color: spec.searchColor || undefined,
        mode: 'editorial',
        seed,
        page: (attempt % 5) + 1,
        exclude_urls: Array.from(usedUrls).slice(-80),
        }),
      });
      const rawText = await response.text();
      if (!response.ok) {
        attemptErrors.push(`${provider}: HTTP ${response.status} ${rawText.slice(0, 120)}`);
        continue;
      }
      payload = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
      attemptErrors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    payload ||= {};
    const imageUrl = payload.imageUrl || payload.image_url || payload.url || null;
    if (!imageUrl || !/^https:\/\//i.test(imageUrl)) {
      attemptErrors.push(`${provider}: sem URL para a consulta`);
      continue;
    }
    const canonical = canonicalImageUrl(imageUrl);
    if (usedUrls.has(canonical)) {
      attemptErrors.push(`${provider}: URL repetida`);
      continue;
    }
    usedUrls.add(canonical);
    if (!await validateImage(imageUrl)) {
      usedUrls.delete(canonical);
      attemptErrors.push(`${provider}: URL retornada não carregou como imagem`);
      continue;
    }
    return {
      imageUrl,
      provider: provider.startsWith('pexels') ? 'Pexels' : 'Unsplash',
      query: spec.query,
    };
  }
  throw new Error(`Nenhuma imagem gratuita válida encontrada para ${spec.label}. ${attemptErrors.slice(-6).join(' | ')}`);
}

function ensureStyles() {
  if (document.getElementById('diagnosis-five-images-styles')) return;
  const style = document.createElement('style');
  style.id = 'diagnosis-five-images-styles';
  style.textContent = `
    body[data-diagnosis-five-images="true"] main section[id] img:not([${CUSTOM_IMAGE_ATTRIBUTE}="true"]),
    body[data-diagnosis-five-images="true"] main section[id] picture:not([data-curated-picture="true"]),
    body[data-diagnosis-five-images="true"] main section[id] [aria-label*="fotografia" i],
    body[data-diagnosis-five-images="true"] main section[id] [aria-label*="imagem real" i] {
      display: none !important;
    }
    .diagnosis-curated-block {
      margin: 2rem 0;
      padding: 1rem;
      border: 1px solid hsl(var(--primary) / .22);
      border-radius: 1rem;
      background: hsl(var(--card) / .7);
    }
    .diagnosis-chapter-legacy { display: none !important; }
    .diagnosis-chapter-replacement {
      position: relative;
      overflow: hidden;
      margin: 0 auto;
      padding: clamp(1.25rem, 3vw, 2.6rem);
      border: 1px solid hsl(var(--primary) / .24);
      border-radius: 1.5rem;
      background:
        radial-gradient(circle at 92% 8%, hsl(var(--primary) / .13), transparent 34%),
        linear-gradient(145deg, hsl(var(--card) / .98), hsl(var(--background) / .96));
      box-shadow: 0 24px 80px hsl(0 0% 0% / .28);
    }
    .diagnosis-chapter-replacement::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: linear-gradient(180deg, transparent, hsl(var(--primary)), transparent);
    }
    .diagnosis-replacement-eyebrow {
      margin: 0 0 .65rem;
      color: hsl(var(--primary));
      font-size: .72rem;
      font-weight: 700;
      letter-spacing: .24em;
      text-transform: uppercase;
    }
    .diagnosis-replacement-heading {
      margin: 0;
      max-width: 780px;
      color: hsl(var(--foreground));
      font: 500 clamp(2rem, 5vw, 4rem)/1.02 ui-serif, Georgia, serif;
      letter-spacing: -.025em;
    }
    .diagnosis-replacement-subtitle {
      margin: .9rem 0 0;
      max-width: 760px;
      color: hsl(var(--muted-foreground));
      font-size: clamp(.92rem, 1.6vw, 1.08rem);
      line-height: 1.7;
    }
    .diagnosis-replacement-content { margin-top: clamp(1.25rem, 3vw, 2.25rem); }
    .diagnosis-curated-two-column {
      display: grid;
      grid-template-columns: minmax(0, .9fr) minmax(300px, 1.1fr);
      gap: clamp(1rem, 3vw, 2.2rem);
      align-items: stretch;
    }
    .diagnosis-style-card {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 260px;
      padding: clamp(1rem, 2.5vw, 1.8rem);
      border-radius: 1rem;
      background: hsl(var(--muted) / .2);
      border: 1px solid hsl(var(--border) / .6);
    }
    .diagnosis-style-card strong {
      color: hsl(var(--foreground));
      font: 500 clamp(1.35rem, 3vw, 2.2rem)/1.2 ui-serif, Georgia, serif;
    }
    .diagnosis-style-card p {
      margin: .8rem 0 0;
      color: hsl(var(--muted-foreground));
      line-height: 1.7;
    }
    .diagnosis-style-chips { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: 1rem; }
    .diagnosis-style-chip {
      padding: .38rem .62rem;
      border: 1px solid hsl(var(--primary) / .3);
      border-radius: 999px;
      color: hsl(var(--primary));
      background: hsl(var(--primary) / .07);
      font-size: .72rem;
    }
    .diagnosis-curated-media-single .diagnosis-curated-figure img {
      max-height: 620px;
      aspect-ratio: 4 / 5;
    }
    .diagnosis-accessory-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .7rem;
      margin-top: 1rem;
    }
    .diagnosis-accessory-card {
      padding: 1rem;
      border: 1px solid hsl(var(--border) / .65);
      border-radius: .9rem;
      background: hsl(var(--muted) / .18);
    }
    .diagnosis-accessory-number {
      display: inline-grid;
      place-items: center;
      width: 1.65rem;
      height: 1.65rem;
      margin-bottom: .7rem;
      border-radius: 50%;
      background: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      font-size: .72rem;
      font-weight: 800;
    }
    .diagnosis-accessory-card strong { display: block; color: hsl(var(--foreground)); line-height: 1.35; }
    .diagnosis-accessory-card p { margin: .45rem 0 0; color: hsl(var(--muted-foreground)); font-size: .82rem; line-height: 1.5; }
    .diagnosis-capsule-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .65rem;
    }
    .diagnosis-capsule-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: .75rem;
      align-items: start;
      padding: .9rem 1rem;
      border: 1px solid hsl(var(--border) / .6);
      border-radius: .9rem;
      background: hsl(var(--muted) / .16);
    }
    .diagnosis-color-dot {
      width: .72rem;
      height: .72rem;
      margin-top: .32rem;
      border: 2px solid hsl(var(--primary) / .65);
      border-radius: 50%;
      box-shadow: 0 0 0 4px hsl(var(--primary) / .08);
    }
    .diagnosis-capsule-card strong { display: block; color: hsl(var(--foreground)); }
    .diagnosis-capsule-card span { display: block; margin-top: .25rem; color: hsl(var(--primary)); font-size: .78rem; }
    .diagnosis-curated-title {
      margin: 0 0 .85rem;
      font: 600 1.05rem/1.35 ui-serif, Georgia, serif;
      color: hsl(var(--foreground));
    }
    .diagnosis-curated-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: .7rem;
    }
    .diagnosis-curated-figure { margin: 0; min-width: 0; }
    .diagnosis-curated-figure img {
      display: block !important;
      width: 100%;
      aspect-ratio: 3 / 4;
      object-fit: cover;
      border-radius: .75rem;
      background: hsl(var(--muted));
    }
    .diagnosis-curated-figure figcaption {
      margin-top: .45rem;
      font-size: .72rem;
      line-height: 1.35;
      color: hsl(var(--muted-foreground));
    }
    .diagnosis-curated-loading {
      display: grid;
      place-items: center;
      min-height: 280px;
      border-radius: .75rem;
      background: linear-gradient(110deg, hsl(var(--muted)) 8%, hsl(var(--muted) / .55) 18%, hsl(var(--muted)) 33%);
      background-size: 200% 100%;
      animation: diagnosis-curated-pulse 1.4s linear infinite;
      color: hsl(var(--muted-foreground));
      text-align: center;
      padding: 1rem;
    }
    .diagnosis-text-only-list {
      display: grid;
      gap: .65rem;
      margin: .75rem 0 0;
      padding: 0;
      list-style: none;
    }
    .diagnosis-text-only-list li {
      padding: .75rem .9rem;
      border-left: 2px solid hsl(var(--primary) / .65);
      background: hsl(var(--muted) / .25);
    }
    .diagnosis-text-only-list strong { display: block; color: hsl(var(--foreground)); }
    .diagnosis-text-only-list span { color: hsl(var(--muted-foreground)); font-size: .86rem; }
    @keyframes diagnosis-curated-pulse { to { background-position-x: -200%; } }

    /* Editorial aberto: sem caixa ou moldura dourada. */
    .diagnosis-chapter-replacement {
      overflow: visible;
      margin: 0;
      padding: clamp(3rem, 7vw, 6.5rem) 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    .diagnosis-chapter-replacement::before { display: none; }
    .diagnosis-chapter-replacement::after {
      content: '';
      display: block;
      width: min(9rem, 24vw);
      height: 1px;
      margin-top: clamp(2.2rem, 5vw, 4.5rem);
      background: linear-gradient(90deg, var(--diagnosis-accent), transparent);
      opacity: .55;
    }
    .diagnosis-replacement-eyebrow {
      color: var(--diagnosis-accent);
      font-size: .68rem;
      letter-spacing: .3em;
    }
    .diagnosis-replacement-heading {
      max-width: 920px;
      font-size: clamp(2.65rem, 6.8vw, 5.8rem);
      font-weight: 400;
      line-height: .98;
    }
    .diagnosis-replacement-subtitle {
      max-width: 720px;
      margin-top: 1.15rem;
      font-size: clamp(.94rem, 1.7vw, 1.12rem);
      line-height: 1.8;
    }
    .diagnosis-replacement-content { margin-top: clamp(2rem, 5vw, 4rem); }
    .diagnosis-curated-two-column {
      grid-template-columns: minmax(0, .82fr) minmax(340px, 1.18fr);
      gap: clamp(2rem, 6vw, 5rem);
      align-items: center;
    }
    #diagnosis-wardrobe-live-image .diagnosis-curated-two-column {
      grid-template-columns: minmax(340px, 1.02fr) minmax(0, .98fr);
      align-items: start;
    }
    .diagnosis-style-card {
      min-height: 0;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
    }
    .diagnosis-style-card strong {
      color: var(--diagnosis-accent);
      font-size: clamp(2rem, 4.4vw, 3.9rem);
      font-weight: 400;
    }
    .diagnosis-style-card p { max-width: 590px; margin-top: 1rem; font-size: .98rem; line-height: 1.8; }
    .diagnosis-style-chips { gap: .7rem 1rem; margin-top: 1.5rem; }
    .diagnosis-style-chip {
      display: inline-flex;
      align-items: center;
      gap: .45rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: hsl(var(--muted-foreground));
      font-size: .76rem;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .diagnosis-style-chip:first-child { color: var(--diagnosis-accent); }
    .diagnosis-style-chip-color i {
      display: inline-block;
      width: .72rem;
      height: .72rem;
      border: 1px solid hsl(var(--foreground) / .24);
      border-radius: 50%;
      box-shadow: 0 0 0 3px hsl(var(--foreground) / .04);
    }
    .diagnosis-curated-figure {
      position: relative;
      overflow: hidden;
      border-radius: clamp(.8rem, 2vw, 1.4rem);
      background: rgba(201, 154, 67, .10);
      box-shadow: 0 22px 60px hsl(0 0% 0% / .3);
      isolation: isolate;
    }
    .diagnosis-curated-figure::after {
      content: '';
      position: absolute;
      inset: auto 0 0;
      height: 45%;
      z-index: 1;
      pointer-events: none;
      background: linear-gradient(transparent, hsl(0 0% 0% / .76));
    }
    .diagnosis-curated-figure img {
      border-radius: 0;
      transition: transform .7s cubic-bezier(.2,.8,.2,1), filter .4s ease;
    }
    .diagnosis-curated-figure:hover img { transform: scale(1.025); filter: saturate(1.06); }
    .diagnosis-curated-figure figcaption {
      position: absolute;
      left: 1rem;
      right: 1rem;
      bottom: .9rem;
      z-index: 2;
      margin: 0;
      color: white;
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .14em;
      line-height: 1.35;
      text-transform: uppercase;
    }
    .diagnosis-curated-media-single .diagnosis-curated-figure img { max-height: 680px; }
    .diagnosis-curated-grid { gap: clamp(.55rem, 1.4vw, 1rem); align-items: start; }
    #diagnosis-inspirations-live-images .diagnosis-curated-figure:nth-child(2) { margin-top: clamp(1rem, 2.4vw, 2.1rem); }
    .diagnosis-curated-loading {
      border-radius: 1.1rem;
      background: linear-gradient(110deg,
        rgba(201, 154, 67, .08) 8%,
        rgba(201, 154, 67, .15) 18%,
        rgba(201, 154, 67, .08) 33%);
    }
    .diagnosis-curated-title {
      margin: clamp(2rem, 4vw, 3rem) 0 1.1rem;
      color: var(--diagnosis-accent);
      font-size: .72rem;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-weight: 800;
      letter-spacing: .2em;
      text-transform: uppercase;
    }
    .diagnosis-accessory-grid { gap: 0; margin-top: 0; }
    #diagnosis-three-accessories {
      margin-top: clamp(2.5rem, 6vw, 5rem);
      padding-top: clamp(1.5rem, 3vw, 2.5rem);
      border-top: 1px solid hsl(var(--border) / .62);
    }
    .diagnosis-accessory-card {
      padding: .25rem 1.1rem 1rem;
      border: 0;
      border-left: 1px solid hsl(var(--border) / .75);
      border-radius: 0;
      background: transparent;
    }
    .diagnosis-accessory-card:first-child { padding-left: 0; border-left: 0; }
    .diagnosis-accessory-number {
      width: auto;
      height: auto;
      margin-bottom: .8rem;
      border-radius: 0;
      background: transparent;
      color: var(--diagnosis-accent);
      font-size: .64rem;
      letter-spacing: .18em;
    }
    .diagnosis-accessory-card strong { font-family: ui-serif, Georgia, serif; font-size: 1rem; font-weight: 500; }
    .diagnosis-accessory-card p { margin-top: .65rem; line-height: 1.65; }
    .diagnosis-capsule-carousel { position: relative; }
    .diagnosis-capsule-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: .55rem;
      margin: 0 0 1rem;
    }
    .diagnosis-capsule-controls > span {
      margin-right: auto;
      color: hsl(var(--muted-foreground));
      font-size: .66rem;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .diagnosis-capsule-controls button {
      display: inline-grid;
      place-items: center;
      width: 2.35rem;
      height: 2.35rem;
      border: 1px solid rgba(201, 154, 67, .55);
      border-radius: 999px;
      background: transparent;
      color: var(--diagnosis-accent);
      font-size: 1rem;
      cursor: pointer;
      transition: background .2s ease, color .2s ease, transform .2s ease;
    }
    .diagnosis-capsule-controls button:hover {
      background: var(--diagnosis-accent);
      color: #111;
      transform: translateY(-1px);
    }
    .diagnosis-capsule-grid {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: minmax(250px, calc((100% - 1.7rem) / 3));
      gap: .85rem;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scroll-behavior: smooth;
      scroll-snap-type: inline mandatory;
      scrollbar-width: none;
      padding: .15rem .1rem .7rem;
    }
    .diagnosis-capsule-grid::-webkit-scrollbar { display: none; }
    .diagnosis-capsule-card {
      min-height: 11rem;
      padding: 1.35rem 1.3rem 1.15rem;
      border: 1px solid hsl(var(--border) / .52);
      border-left: 2px solid var(--diagnosis-accent);
      border-radius: .85rem;
      background: linear-gradient(135deg, rgba(201, 154, 67, .05), transparent 58%);
      scroll-snap-align: start;
    }
    .diagnosis-capsule-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .55rem;
      padding-top: .15rem;
    }
    .diagnosis-capsule-index {
      color: var(--diagnosis-accent);
      font-size: .62rem;
      font-weight: 800;
      letter-spacing: .14em;
      line-height: 1;
    }
    .diagnosis-color-dot {
      width: .78rem;
      height: .78rem;
      border: 0;
      box-shadow: 0 0 0 4px rgba(201, 154, 67, .10);
    }
    .diagnosis-capsule-copy { align-self: center; }
    .diagnosis-capsule-card strong { font-family: ui-serif, Georgia, serif; font-size: 1.05rem; font-weight: 500; line-height: 1.42; }
    .diagnosis-capsule-copy > span { color: var(--diagnosis-accent); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; }
    .diagnosis-capsule-swatch {
      display: block;
      width: 100%;
      height: .28rem;
      margin-top: 1.25rem;
      border-radius: 999px;
      box-shadow: 0 0 18px rgba(201, 154, 67, .10);
    }
    @media (max-width: 560px) {
      .diagnosis-curated-grid { gap: .35rem; }
      .diagnosis-curated-block { padding: .65rem; }
      .diagnosis-curated-figure figcaption { font-size: .62rem; }
      .diagnosis-curated-loading { min-height: 170px; font-size: .72rem; }
      .diagnosis-curated-two-column { grid-template-columns: 1fr; }
      .diagnosis-accessory-grid { grid-template-columns: 1fr; }
      .diagnosis-capsule-grid { grid-template-columns: none; grid-auto-columns: 84%; }
      .diagnosis-capsule-controls > span { letter-spacing: .1em; }
      .diagnosis-chapter-replacement { padding: 2.7rem 0; border-radius: 0; }
      .diagnosis-replacement-heading { font-size: clamp(2.3rem, 13vw, 3.7rem); }
      #diagnosis-inspirations-live-images .diagnosis-curated-figure:nth-child(2) { margin-top: .8rem; }
      .diagnosis-accessory-card { padding: 1rem 0; border-left: 0; border-bottom: 1px solid hsl(var(--border) / .62); }
    }
  `;
  document.head.appendChild(style);
}

function waitForElement(selector, timeoutMs = 30000) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Seção não encontrada: ${selector}`));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(element);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function createLoadingBlock(id, title, slots) {
  document.getElementById(id)?.remove();
  const block = document.createElement('div');
  block.id = id;
  block.className = 'diagnosis-curated-block';
  const heading = document.createElement('h3');
  heading.className = 'diagnosis-curated-title';
  heading.textContent = title;
  const grid = document.createElement('div');
  grid.className = slots === 3 ? 'diagnosis-curated-grid' : '';
  for (let index = 0; index < slots; index += 1) {
    const loading = document.createElement('div');
    loading.className = 'diagnosis-curated-loading';
    loading.textContent = 'Buscando fotografia gratuita de acordo com o seu estilo…';
    grid.appendChild(loading);
  }
  block.append(heading, grid);
  return { block, grid };
}

function renderFigure(result, label, alt) {
  const figure = document.createElement('figure');
  figure.className = 'diagnosis-curated-figure';
  figure.dataset.curatedPicture = 'true';
  const image = document.createElement('img');
  image.setAttribute(CUSTOM_IMAGE_ATTRIBUTE, 'true');
  image.src = result.imageUrl;
  image.alt = alt;
  image.loading = 'eager';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  const caption = document.createElement('figcaption');
  caption.textContent = label;
  figure.append(image, caption);
  return figure;
}

const COLOR_ROOT_PATTERN = '(?:off[- ]white|navy|taupe|âmbar|ambar|creme|marfim|champagne|greige|cáqui|caqui|ocre|cobre|bronze|ouro|prata|azul|verde|amarelo|vermelho|rosa|coral|turquesa|cinza|branco|preto|bege|caramelo|terracota|oliva|lavanda|lilás|lilas|roxo|violeta|berinjela|ameixa|marsala|vinho|bordô|bordo|marrom|chocolate|camel|nude|mostarda|dourado|dourada|prateado|prateada|esmeralda|petróleo|petroleo|teal|fúcsia|fucsia|magenta)';
const COLOR_MODIFIER_PATTERN = '(?:claro|clara|escuro|escura|médio|media|medio|média|suave|vivo|viva|vibrante|quente|frio|fria|puro|pura|queimado|queimada|empoeirado|empoeirada|lavado|lavada|pastel|profundo|profunda|intenso|intensa|neon|pérola|perola|céu|ceu|bebê|bebe|folha|sálvia|salvia|menta|royal|marinho|marinha|petróleo|petroleo|dourado|dourada|prateado|prateada|anil|índigo|indigo|cobalto|musgo|militar|bandeira|limão|limao|blush|chá|cha|seco|seca|cereja|rubi|rubí|tijolo|café|cafe)';
const PIECE_COLOR_PATTERN = new RegExp(`(?:^|[\\s,(])(${COLOR_ROOT_PATTERN}(?:[-\\s]+${COLOR_MODIFIER_PATTERN}){0,2})(?=$|[\\s,.;)])`, 'giu');

function extractColorFromPiece(piece) {
  const text = normalizeText(piece).toLocaleLowerCase('pt-BR');
  let detected = '';
  for (const match of text.matchAll(PIECE_COLOR_PATTERN)) detected = normalizeText(match[1]);
  return detected;
}

function shortenPieceLabel(piece, color) {
  let label = normalizeText(piece);
  if (!label) return label;
  if (color) {
    const escapedColor = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]+/g, '[ -]+');
    label = label.replace(new RegExp(`(?:[ -]+)${escapedColor}(?=$|[,.])`, 'iu'), '');
  }
  label = label
    .replace(/\b(?:stonewashed|premium|artesanal|refinad[oa]|pesad[oa]|maci[oa]|confortável|confortavel|lavada?|lavado|pura?|italian[oa]|envernizad[oa]|luxo)\b/giu, '')
    .replace(/\b([\p{L}-]+)(?:\s+\1\b)+/giu, '$1')
    .replace(/\b(em|de)\s+([\p{L}-]+(?:\s+[\p{L}-]+){0,2})\s+em\s+\2\b/giu, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .trim();

  const fabricPattern = /(?:^|[\s-])(algodão|algodao|linho|modal|seda|crepe|lã|la|couro|camurça|camurca|sarja|jeans|denim|malha|tricô|trico|tricot|cetim|veludo|musselina|tweed|bouclé|boucle)(?=$|[\s,.;-])/giu;
  const fabricMatches = [...label.matchAll(fabricPattern)];
  for (let index = 1; index < fabricMatches.length; index += 1) {
    const previousStart = (fabricMatches[index - 1].index || 0) + fabricMatches[index - 1][0].length - fabricMatches[index - 1][1].length;
    const previousEnd = previousStart + fabricMatches[index - 1][1].length;
    const currentStart = (fabricMatches[index].index || 0) + fabricMatches[index][0].length - fabricMatches[index][1].length;
    const between = label.slice(previousEnd, currentStart);
    const connectorOffset = between.toLocaleLowerCase('pt-BR').lastIndexOf(' em ');
    if (connectorOffset >= 0) {
      label = label.slice(0, previousEnd + connectorOffset).trim();
      break;
    }
  }

  const words = label.split(/\s+/).filter(Boolean);
  if (words.length > 10) label = words.slice(0, 10).join(' ');
  return label.replace(/\b(?:de|em|com)\s*$/iu, '').replace(/[,:;-]+$/, '').trim();
}

function parseCapsulePieces(diagnosis, profile) {
  const capsule = diagnosis.capsule_wardrobe || {};
  const source = capsule.pecas_capsula || capsule.pecas || diagnosis.wardrobe_essentials || {};
  const rows = [];
  const knownColors = unique([
    ...profile.colors,
    'off-white quente', 'off-white frio', 'off-white',
    'navy claro', 'navy escuro', 'navy',
    'amarelo vivo', 'amarelo quente', 'amarelo claro',
    'verde-folha', 'verde folha', 'verde vibrante', 'verde claro', 'verde escuro',
    'azul claro', 'azul escuro', 'azul suave',
    'coral', 'turquesa',
    'azul-royal', 'esmeralda', 'vermelho frio', 'branco puro', 'cinza claro frio',
    'preto', 'marinho', 'bege', 'caramelo', 'terracota', 'verde oliva', 'rosa', 'lavanda',
  ]).sort((left, right) => right.length - left.length);
  const inferColor = (piece, fallback) => {
    const extractedColor = extractColorFromPiece(piece);
    if (extractedColor) return extractedColor;
    const normalizedPiece = normalizeText(piece).toLocaleLowerCase('pt-BR').replace(/-/g, ' ');
    return knownColors.find((color) => normalizedPiece.includes(color.toLocaleLowerCase('pt-BR').replace(/-/g, ' '))) || fallback;
  };
  const add = (item, fallbackGroup = '') => {
    if (typeof item === 'string') {
      const piece = normalizeText(item);
      if (piece && !/^\d+(?:[.,]\d+)?$/.test(piece)) rows.push({ piece, color: inferColor(piece, profile.primaryColor), group: fallbackGroup });
      return;
    }
    if (!item || typeof item !== 'object') return;
    const piece = firstField(item, ['peca', 'peça', 'nome', 'descricao', 'descrição', 'item']);
    const explicitColor = firstField(item, ['cor', 'color', 'tom']);
    const color = inferColor(piece, '') || explicitColor || profile.primaryColor;
    if (piece && !/^\d+(?:[.,]\d+)?$/.test(piece)) rows.push({ piece, color, group: fallbackGroup });
  };
  if (Array.isArray(source)) source.forEach((item) => add(item));
  else if (source && typeof source === 'object') {
    Object.entries(source).forEach(([group, value]) => {
      if (Array.isArray(value)) value.forEach((item) => add(item, group));
      else add(value, group);
    });
  }
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.piece.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 18);
}

function appendTextOnlyContent(wardrobeSection, capsuleSection, diagnosis, profile) {
  document.getElementById('diagnosis-three-accessories')?.remove();
  const accessories = document.createElement('div');
  accessories.id = 'diagnosis-three-accessories';
  accessories.className = 'diagnosis-curated-block';
  const accessoriesTitle = document.createElement('h3');
  accessoriesTitle.className = 'diagnosis-curated-title';
  accessoriesTitle.textContent = '3 acessórios essenciais';
  const accessoriesList = document.createElement('ul');
  accessoriesList.className = 'diagnosis-text-only-list';
  [
    [`Brinco de assinatura em ${profile.metal}`, `Acabamento ${profile.primaryStyle}, usado como ponto de presença.`],
    [`Bolsa estruturada em ${profile.primaryColor}`, 'Formato funcional para sustentar a linguagem do diagnóstico.'],
    [`Cinto de acabamento em ${profile.secondaryColor}`, 'Detalhe que organiza proporção e finaliza os looks sem excesso.'],
  ].forEach(([name, description]) => {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = name;
    const span = document.createElement('span');
    span.textContent = description;
    item.append(strong, span);
    accessoriesList.appendChild(item);
  });
  accessories.append(accessoriesTitle, accessoriesList);
  wardrobeSection.appendChild(accessories);

  document.getElementById('diagnosis-capsule-text-only')?.remove();
  const capsuleBlock = document.createElement('div');
  capsuleBlock.id = 'diagnosis-capsule-text-only';
  capsuleBlock.className = 'diagnosis-curated-block';
  const capsuleTitle = document.createElement('h3');
  capsuleTitle.className = 'diagnosis-curated-title';
  capsuleTitle.textContent = 'Peças e cores do seu guarda-roupa cápsula';
  const capsuleList = document.createElement('ul');
  capsuleList.className = 'diagnosis-text-only-list';
  const pieces = parseCapsulePieces(diagnosis, profile);
  (pieces.length ? pieces : [
    { piece: 'Peça-base versátil', color: profile.primaryColor },
    { piece: 'Terceira peça de assinatura', color: profile.secondaryColor },
    { piece: 'Calçado funcional', color: profile.primaryColor },
  ]).forEach((row) => {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = row.piece;
    const span = document.createElement('span');
    span.textContent = `Cor indicada: ${row.color}`;
    item.append(strong, span);
    capsuleList.appendChild(item);
  });
  capsuleBlock.append(capsuleTitle, capsuleList);
  capsuleSection.appendChild(capsuleBlock);
}

function hideLegacyDiagnosisImages() {
  document.body.dataset.diagnosisFiveImages = 'true';
  document.querySelectorAll('[data-diagnosis-replacement="true"]').forEach((replacement) => {
    Array.from(replacement.parentElement?.children || []).forEach((sibling) => {
      if (sibling !== replacement) sibling.classList.add('diagnosis-chapter-legacy');
    });
  });
  document.querySelectorAll(`main section[id] img:not([${CUSTOM_IMAGE_ATTRIBUTE}="true"])`).forEach((image) => {
    image.style.setProperty('display', 'none', 'important');
    const figure = image.closest('figure');
    if (figure && !figure.querySelector(`[${CUSTOM_IMAGE_ATTRIBUTE}="true"]`)) {
      figure.style.setProperty('display', 'none', 'important');
    }
  });
  document.querySelectorAll('main section[id] [aria-label]').forEach((element) => {
    const label = (element.getAttribute('aria-label') || '').toLocaleLowerCase('pt-BR');
    if (label.includes('fotografia') || label.includes('imagem real')) {
      element.style.setProperty('display', 'none', 'important');
    }
  });
}

function sanitizeProfileLifestyleText() {
  const profileSection = document.querySelector('section#perfil, #perfil');
  if (!profileSection) return;
  profileSection.querySelectorAll('dd, p').forEach((element) => {
    if (element.children.length) return;
    const text = normalizeText(element.textContent);
    if (!/^Este diagnóstico lê sua imagem a partir de /i.test(text)) return;
    const goalMatch = text.match(/\s+e (?:do|o) desejo de (.+)$/i);
    const sanitized = goalMatch
      ? `Este diagnóstico lê sua imagem a partir das suas respostas e do desejo de ${goalMatch[1]}`
      : 'Este diagnóstico lê sua imagem a partir das suas respostas, objetivos e preferências. A construção visual nasce do encontro entre intenção, realidade e presença.';
    element.textContent = sanitized;
  });
}

function enforceDiagnosisPresentation() {
  hideLegacyDiagnosisImages();
  sanitizeProfileLifestyleText();
}

function findChapterRoot(id, title) {
  const normalizedTitle = normalizeText(title).toLocaleLowerCase('pt-BR');
  const heading = Array.from(document.querySelectorAll('main h1, main h2'))
    .find((element) => normalizeText(element.textContent).toLocaleLowerCase('pt-BR') === normalizedTitle);
  if (heading) {
    const section = heading.closest('section');
    if (section) return section;
    const article = heading.closest('article');
    if (article?.parentElement) return article.parentElement;
  }
  const anchor = document.getElementById(id);
  if (!anchor) return null;
  return anchor.closest('section') || anchor;
}

function waitForChapter(id, title, timeoutMs = 30000) {
  const existing = findChapterRoot(id, title);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Capítulo não encontrado: ${title}`));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const chapter = findChapterRoot(id, title);
      if (!chapter) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(chapter);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function createReplacementFrame(id, eyebrow, title, subtitle) {
  const frame = document.createElement('div');
  frame.id = id;
  frame.className = 'diagnosis-chapter-replacement';
  frame.dataset.diagnosisReplacement = 'true';
  const eyebrowElement = document.createElement('p');
  eyebrowElement.className = 'diagnosis-replacement-eyebrow';
  eyebrowElement.textContent = eyebrow;
  const heading = document.createElement('h2');
  heading.className = 'diagnosis-replacement-heading';
  heading.textContent = title;
  const subtitleElement = document.createElement('p');
  subtitleElement.className = 'diagnosis-replacement-subtitle';
  subtitleElement.textContent = subtitle;
  const content = document.createElement('div');
  content.className = 'diagnosis-replacement-content';
  frame.append(eyebrowElement, heading, subtitleElement, content);
  return { frame, content };
}

function colorHex(value) {
  const color = normalizeText(value).toLocaleLowerCase('pt-BR');
  const palette = [
    [/azul[- ]?royal|cobalto/, '#4169e1'],
    [/azul[- ]?marinho|marinho|navy/, '#243b6b'],
    [/azul/, '#4f78c8'],
    [/esmeralda/, '#15936f'],
    [/turquesa/, '#2ca6a4'],
    [/sálvia|salvia|menta/, '#82a58d'],
    [/verde oliva|oliva/, '#718052'],
    [/verde/, '#3f8f68'],
    [/vermelho|bord[oô]|vinho/, '#b63c52'],
    [/rosa|pink|f[uú]csia/, '#d7598b'],
    [/lavanda|lil[aá]s|malva/, '#9c7fc1'],
    [/berinjela|ameixa|plum/, '#67415f'],
    [/coral/, '#e8776f'],
    [/terracota|laranja/, '#c56e50'],
    [/caramelo|camel/, '#b98758'],
    [/taupe/, '#8b7d6b'],
    [/âmbar|ambar|ocre|bronze|cobre/, '#c58a32'],
    [/creme dourad/, '#d8c08a'],
    [/dourad|ouro/, '#c9a34a'],
    [/amarelo|mostarda/, '#d2a936'],
    [/branco|marfim|creme|off[- ]?white/, '#e9e6df'],
    [/cinza|chumbo/, '#8e98a8'],
    [/preto/, '#34343a'],
    [/bege/, '#c8b79c'],
  ];
  return palette.find(([pattern]) => pattern.test(color))?.[1] || '#7d8fb3';
}

function applyProfileTheme(frame, profile) {
  frame.style.setProperty('--diagnosis-accent', '#c99a43');
  frame.style.setProperty('--diagnosis-accent-secondary', '#e2bf78');
}

function createLoadingGrid(slots, extraClass = '') {
  const grid = document.createElement('div');
  grid.className = `${slots === 3 ? 'diagnosis-curated-grid' : 'diagnosis-curated-media-single'} ${extraClass}`.trim();
  for (let index = 0; index < slots; index += 1) {
    const loading = document.createElement('div');
    loading.className = 'diagnosis-curated-loading';
    loading.textContent = 'Buscando fotografia gratuita de acordo com o seu estilo…';
    grid.appendChild(loading);
  }
  return grid;
}

function createStyleCard(profile, description) {
  const card = document.createElement('div');
  card.className = 'diagnosis-style-card';
  const title = document.createElement('strong');
  title.textContent = profile.primaryStyle;
  const paragraph = document.createElement('p');
  paragraph.textContent = description;
  const chips = document.createElement('div');
  chips.className = 'diagnosis-style-chips';
  unique([profile.primaryStyle, ...profile.colors.slice(0, 4)]).forEach((label) => {
    const chip = document.createElement('span');
    chip.className = 'diagnosis-style-chip';
    if (profile.colors.includes(label)) {
      chip.classList.add('diagnosis-style-chip-color');
      const swatch = document.createElement('i');
      swatch.style.background = colorHex(label);
      chip.append(swatch, document.createTextNode(label));
    } else {
      chip.textContent = label;
    }
    chips.appendChild(chip);
  });
  card.append(title, paragraph, chips);
  return card;
}

function accessoryDefinitions(profile) {
  return [
    {
      name: `Brinco de assinatura em ${profile.metal}`,
      description: `Um ponto de presença com acabamento ${profile.primaryStyle}, sem competir com o rosto.`,
    },
    {
      name: `Bolsa estruturada em ${profile.primaryColor}`,
      description: 'Formato funcional que sustenta a linguagem do diagnóstico e organiza a rotina.',
    },
    {
      name: `Cinto de acabamento em ${profile.secondaryColor}`,
      description: 'O detalhe que define proporção e finaliza os looks com intenção.',
    },
  ];
}

function createAccessoriesGrid(profile) {
  const wrapper = document.createElement('div');
  wrapper.id = 'diagnosis-three-accessories';
  const title = document.createElement('h3');
  title.className = 'diagnosis-curated-title';
  title.textContent = 'Peças essenciais · 3 acessórios';
  const grid = document.createElement('div');
  grid.className = 'diagnosis-accessory-grid';
  accessoryDefinitions(profile).forEach((accessory, index) => {
    const card = document.createElement('article');
    card.className = 'diagnosis-accessory-card';
    const number = document.createElement('span');
    number.className = 'diagnosis-accessory-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = accessory.name;
    const description = document.createElement('p');
    description.textContent = accessory.description;
    card.append(number, name, description);
    grid.appendChild(card);
  });
  wrapper.append(title, grid);
  return wrapper;
}

function createCapsuleGrid(diagnosis, profile) {
  const carousel = document.createElement('div');
  carousel.className = 'diagnosis-capsule-carousel';
  const controls = document.createElement('div');
  controls.className = 'diagnosis-capsule-controls';
  const controlsLabel = document.createElement('span');
  controlsLabel.textContent = 'Deslize para explorar';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.setAttribute('aria-label', 'Ver peça anterior');
  previous.textContent = '←';
  const next = document.createElement('button');
  next.type = 'button';
  next.setAttribute('aria-label', 'Ver próxima peça');
  next.textContent = '→';
  controls.append(controlsLabel, previous, next);
  const grid = document.createElement('div');
  grid.id = 'diagnosis-capsule-piece-grid';
  grid.className = 'diagnosis-capsule-grid';
  const pieces = parseCapsulePieces(diagnosis, profile).slice(0, CAPSULE_TEMPLATE_SLOTS);
  const fallbackRows = [
    { piece: 'camisa versátil de bom caimento', color: profile.primaryColor },
    { piece: 'calça de corte estratégico', color: profile.secondaryColor },
    { piece: 'calçado funcional para a rotina', color: profile.colors[2] || profile.primaryColor },
    { piece: 'peça única coordenável', color: profile.colors[3] || profile.secondaryColor },
    { piece: 'vestido midi versátil', color: profile.colors[4] || profile.primaryColor },
  ];
  const rows = [...pieces];
  while (rows.length < CAPSULE_TEMPLATE_SLOTS) rows.push(fallbackRows[rows.length]);
  rows.forEach((row, index) => {
    const card = document.createElement('article');
    card.className = 'diagnosis-capsule-card';
    const marker = document.createElement('div');
    marker.className = 'diagnosis-capsule-marker';
    const number = document.createElement('span');
    number.className = 'diagnosis-capsule-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const dot = document.createElement('span');
    dot.className = 'diagnosis-color-dot';
    dot.style.background = colorHex(row.color);
    marker.append(number, dot);
    const copy = document.createElement('div');
    copy.className = 'diagnosis-capsule-copy';
    const piece = document.createElement('strong');
    const shortPiece = shortenPieceLabel(row.piece, row.color);
    piece.textContent = shortPiece || row.piece;
    if (shortPiece && shortPiece !== row.piece) card.title = row.piece;
    const color = document.createElement('span');
    color.textContent = `Cor indicada · ${row.color}`;
    const swatch = document.createElement('i');
    swatch.className = 'diagnosis-capsule-swatch';
    swatch.style.background = colorHex(row.color);
    copy.append(piece, color, swatch);
    card.append(marker, copy);
    grid.appendChild(card);
  });
  const move = (direction) => {
    grid.scrollBy({ left: direction * Math.max(grid.clientWidth * .72, 260), behavior: 'smooth' });
  };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  carousel.append(controls, grid);
  return carousel;
}

function replaceWholeChapter(chapter, replacement) {
  chapter.querySelectorAll(':scope > [data-diagnosis-replacement="true"]').forEach((element) => element.remove());
  Array.from(chapter.children).forEach((child) => child.classList.add('diagnosis-chapter-legacy'));
  chapter.prepend(replacement);
}

function buildReplacementViews(diagnosis, profile) {
  const secondaryLabel = profile.secondaryStyles.length
    ? profile.secondaryStyles.join(' e ')
    : 'sem influência secundária dominante';
  const paletteLabel = profile.colors.slice(0, 3).join(', ') || profile.primaryColor;
  const signatureDescription = `Estilo principal: ${profile.primaryStyle}. Influências: ${secondaryLabel}. Cores estratégicas: ${paletteLabel}.`;

  const signature = createReplacementFrame(
    'diagnosis-signature-live-image',
    'Assinatura visual',
    'Sua imagem em uma única direção',
    'Uma referência visual precisa, escolhida no momento do diagnóstico a partir do seu estilo e da sua cartela.',
  );
  applyProfileTheme(signature.frame, profile);
  const signatureLayout = document.createElement('div');
  signatureLayout.className = 'diagnosis-curated-two-column';
  const signatureGrid = createLoadingGrid(1);
  signatureLayout.append(createStyleCard(profile, signatureDescription), signatureGrid);
  signature.content.appendChild(signatureLayout);

  const wardrobe = createReplacementFrame(
    'diagnosis-wardrobe-live-image',
    'Guarda-roupa estratégico',
    'Uma referência, três detalhes essenciais',
    'A imagem mostra a direção do conjunto; os acessórios escritos transformam essa direção em decisões práticas.',
  );
  applyProfileTheme(wardrobe.frame, profile);
  const wardrobeLayout = document.createElement('div');
  wardrobeLayout.className = 'diagnosis-curated-two-column';
  const wardrobeGrid = createLoadingGrid(1);
  const wardrobeStyle = createStyleCard(profile, `Priorize coerência com ${profile.primaryStyle}, repetição inteligente e cores que conversem com ${profile.primaryColor}.`);
  wardrobeLayout.append(wardrobeGrid, wardrobeStyle);
  wardrobe.content.append(wardrobeLayout, createAccessoriesGrid(profile));

  const capsule = createReplacementFrame(
    'diagnosis-capsule-text-only',
    'Guarda-roupa cápsula',
    'Peças e cores estratégicas',
    'Uma seleção objetiva para multiplicar combinações, respeitar sua rotina e manter unidade visual.',
  );
  applyProfileTheme(capsule.frame, profile);
  capsule.content.appendChild(createCapsuleGrid(diagnosis, profile));

  const inspirations = createReplacementFrame(
    'diagnosis-inspirations-live-images',
    'Inspirações visuais',
    'Três formas de viver o seu estilo',
    'Referências profissional, casual e de impacto para traduzir seu estilo em diferentes momentos.',
  );
  applyProfileTheme(inspirations.frame, profile);
  const inspirationsGrid = createLoadingGrid(3);
  inspirations.content.appendChild(inspirationsGrid);

  return {
    signature,
    signatureGrid,
    wardrobe,
    wardrobeGrid,
    capsule,
    inspirations,
    inspirationsGrid,
  };
}

async function runForDiagnosis(diagnosisId, runId) {
  ensureStyles();
  document.body.dataset.diagnosisFiveImages = 'true';
  await supabase.auth.getSession();
  const response = await supabase
    .from('diagnoses')
    .select('id,style_analysis,style_intensity_score,color_analysis,questionnaire,wardrobe_essentials,capsule_wardrobe')
    .eq('id', diagnosisId)
    .single();
  if (response.error || !response.data) throw new Error(response.error?.message || 'Diagnóstico não encontrado');
  if (runId !== activeRun) return;

  const diagnosis = response.data;
  const profile = diagnosisProfile(diagnosis);
  const [styleSection, wardrobeSection, capsuleSection, inspirationsSection] = await Promise.all([
    waitForChapter('estilo', 'Sua Assinatura Visual'),
    waitForChapter('pecas', 'Guarda-Roupa Estratégico'),
    waitForChapter('capsula', 'Guarda-Roupa Cápsula'),
    waitForChapter('inspiracoes', 'Inspirações Visuais'),
  ]);
  if (runId !== activeRun) return;

  const views = buildReplacementViews(diagnosis, profile);
  replaceWholeChapter(styleSection, views.signature.frame);
  replaceWholeChapter(wardrobeSection, views.wardrobe.frame);
  replaceWholeChapter(capsuleSection, views.capsule.frame);
  replaceWholeChapter(inspirationsSection, views.inspirations.frame);
  enforceDiagnosisPresentation();

  cleanupObserver?.disconnect();
  cleanupObserver = new MutationObserver(enforceDiagnosisPresentation);
  cleanupObserver.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });

  const searchStyle = weightedFashionSearchStyle(profile);
  [views.signature.frame, views.wardrobe.frame, views.capsule.frame, views.inspirations.frame].forEach((frame) => {
    frame.dataset.diagnosisTemplate = DIAGNOSIS_TEMPLATE_ID;
    frame.dataset.diagnosisStyleTaxonomy = CANONICAL_STYLES.join(' | ');
    frame.dataset.diagnosisPrimaryStyle = profile.primaryStyle;
    frame.dataset.diagnosisSecondaryStyles = profile.secondaryStyles.join(' | ');
    frame.dataset.diagnosisSearchStyle = searchStyle;
  });
  const specs = [
    {
      key: 'signature', label: 'Assinatura visual', providerOffset: 0, color: profile.primaryColor,
      shortQuery: `woman ${searchStyle} fashion outfit portrait`,
      query: `woman ${searchStyle} fashion outfit portrait`,
    },
    {
      key: 'wardrobe', label: 'Guarda-roupa estratégico', providerOffset: 1, color: profile.secondaryColor,
      shortQuery: `woman ${searchStyle} wardrobe outfit`,
      query: `woman ${searchStyle} wardrobe outfit full body`,
    },
    {
      key: 'inspiration-work', label: 'Inspiração profissional', providerOffset: 0, color: profile.primaryColor,
      shortQuery: `woman ${searchStyle} professional fashion outfit`,
      query: `woman ${searchStyle} professional fashion outfit`,
    },
    {
      key: 'inspiration-casual', label: 'Inspiração casual', providerOffset: 1, color: profile.secondaryColor,
      shortQuery: `woman ${searchStyle} casual fashion outfit`,
      query: `woman ${searchStyle} casual fashion outfit street style`,
    },
    {
      key: 'inspiration-impact', label: 'Inspiração de impacto', providerOffset: 0, color: profile.primaryColor,
      shortQuery: `woman ${searchStyle} bold statement fashion outfit`,
      query: `woman ${searchStyle} bold statement fashion outfit editorial`,
    },
  ];

  const usedUrls = new Set();
  const results = [];
  for (const spec of specs) {
    if (runId !== activeRun) return;
    results.push(await searchValidatedImage(spec, diagnosisId, usedUrls));
  }
  if (runId !== activeRun) return;

  views.signatureGrid.replaceChildren(renderFigure(results[0], specs[0].label, `Assinatura visual ${profile.primaryStyle}`));
  views.wardrobeGrid.replaceChildren(renderFigure(results[1], specs[1].label, `Guarda-roupa estratégico ${profile.primaryStyle}`));
  views.inspirationsGrid.replaceChildren(
    renderFigure(results[2], specs[2].label, `Inspiração profissional ${profile.primaryStyle}`),
    renderFigure(results[3], specs[3].label, `Inspiração casual ${profile.primaryStyle}`),
    renderFigure(results[4], specs[4].label, `Inspiração de impacto ${profile.primaryStyle}`),
  );
  enforceDiagnosisPresentation();
  document.body.dataset.diagnosisCuratedReady = 'true';
}

async function bootForCurrentRoute() {
  const match = window.location.pathname.match(/^\/diagnosis\/([0-9a-f-]{36})(?:\/|$)/i);
  if (!match || window.location.pathname.includes('/share/')) {
    activeDiagnosisId = null;
    bootInProgressFor = null;
    activeRun += 1;
    cleanupObserver?.disconnect();
    delete document.body.dataset.diagnosisFiveImages;
    return;
  }
  const diagnosisId = match[1];
  const replacementBaseIsComplete = REPLACEMENT_IDS.every((id) => (
    document.getElementById(id)?.dataset.diagnosisReplacement === 'true'
  ));
  if (diagnosisId === activeDiagnosisId && (replacementBaseIsComplete || bootInProgressFor === diagnosisId)) return;
  activeDiagnosisId = diagnosisId;
  bootInProgressFor = diagnosisId;
  const runId = ++activeRun;
  document.querySelectorAll('[id^="diagnosis-"][id$="live-image"], #diagnosis-inspirations-live-images, #diagnosis-three-accessories, #diagnosis-capsule-text-only').forEach((element) => element.remove());
  runForDiagnosis(diagnosisId, runId)
    .catch((error) => {
      if (runId !== activeRun) return;
      console.error('[diagnosis-live-images]', error);
      document.querySelectorAll('.diagnosis-curated-loading').forEach((element) => {
        element.textContent = `Não foi possível carregar esta referência gratuita agora. ${error instanceof Error ? error.message : String(error)}`;
      });
    })
    .finally(() => {
      if (runId === activeRun) bootInProgressFor = null;
    });
}

window.setInterval(bootForCurrentRoute, 500);
bootForCurrentRoute();

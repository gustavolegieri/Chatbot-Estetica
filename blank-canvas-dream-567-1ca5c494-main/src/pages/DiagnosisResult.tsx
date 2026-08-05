import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { Loader2, Download, Share2, ArrowLeft, MessageCircle, UserCircle2, Shirt, Eye, Target, Layers, Palette as PaletteIcon, Ruler, ShoppingBag, ThumbsUp, Ban, LayoutGrid, CalendarClock, Sparkles as SparklesIcon, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';



import { PageTransition } from '@/components/layout/PageTransition';
import { CapsuleSection } from '@/components/diagnosis/result/CapsuleSection';
import { StyleSection } from '@/components/diagnosis/result/StyleSection';
import { AnalysisSection } from '@/components/diagnosis/result/AnalysisSection';
import { InspirationsSection } from '@/components/diagnosis/result/InspirationsSection';
import {
  PerceptionSection, StrategySection, DnaVisualSection,
  StrategicPaletteSection, SilhouetteGuideSection, KeyPiecesSection,
  BetOnSection, AvoidSection, EvolutionPlanSection,
} from '@/components/diagnosis/result/DossierSections';
import { RitualSection } from '@/components/diagnosis/result/RitualSection';
import { DossierLayout, Chapter, type DossierChapterMeta } from '@/components/diagnosis/dossier/DossierLayout';
import { ChapterNarrative } from '@/components/diagnosis/result/ChapterNarrative';
import { ChapterMoodboard } from '@/components/diagnosis/result/ChapterMoodboard';
import { StructuredMoodboards } from '@/components/diagnosis/result/StructuredMoodboards';
import { MasterProfileOverview } from '@/components/diagnosis/result/MasterProfileOverview';
import { DossierCover } from '@/components/diagnosis/dossier/DossierCover';
import { getFastDiagnosticImageCandidateUrls, getStaticDiagnosticImage, preloadDiagnosticImageGroupsStrict, setStaticDiagnosticImage, warmupDiagnosticImages } from '@/lib/diagnosticImageLoader';

import { useDiagnosisImages } from '@/hooks/useDiagnosisImages';
import { useLookImages } from '@/hooks/useLookImages';
import { usePlanAccess } from '@/hooks/usePlanAccess';
import { Lock } from 'lucide-react';

import { SectionImagesProvider } from '@/contexts/SectionImagesContext';
import { clearDiagnosisImagesCache } from '@/hooks/useSectionInternetImage';
import { extractRestrictions } from '@/lib/imageRestrictions';

import {
  normalizeOcasiao, normalizeClima, normalizeTipoCorporal, normalizeCaimento,
  normalizeFormalidade, normalizeTomDePele, normalizeEstilo, normalizeOrcamento,
  buildAllPrompts,
  stableDiagnosticImageHash,
} from '@/lib/imageService';
import { getExpectedPdfDiagnosisId, getPdfSnapshot } from '@/lib/pdfSnapshot';
import { exportWebPerfectPdf } from '@/lib/exportWebPerfectPdf';
import type { DiagnosticData } from '@/types/diagnostic';

import { motion } from 'framer-motion';



interface DiagnosisData {
  id: string;
  status: string;
  created_at: string;
  body_analysis: Record<string, unknown> | null;
  color_analysis: Record<string, unknown> | null;
  style_analysis: Record<string, unknown> | null;
  modeling_analysis: Record<string, unknown> | null;
  wardrobe_essentials: Record<string, unknown> | null;
  capsule_wardrobe: Record<string, unknown> | null;
  final_diagnosis: Record<string, unknown> | null;
  generated_images: Record<string, unknown> | null;
  share_token: string | null;
  updated_at?: string | null;
  photo_front_url: string | null;
  photo_side_url: string | null;
  photo_back_url: string | null;
  photo_face_url: string | null;
  questionnaire: Record<string, unknown> | null;
  height_cm: number | null;
  weight_kg: number | null;
  top_size: string | null;
  bottom_size: string | null;
  shoe_size: string | null;
  body_notes: string | null;
  hair_color: string | null;
  eye_color: string | null;
  skin_tone: string | null;
  fit_preference: string | null;
  formality_level: string | null;
  style_intensity_score: Record<string, number> | null;
  body_balance_score: Record<string, number> | null;
}

type SectionId =
  | 'perfil' | 'estilo' | 'percepcao' | 'estrategia' | 'dna' | 'paleta' | 'silhueta'
  | 'pecas' | 'apostar' | 'evitar' | 'capsula' | 'evolucao' | 'inspiracoes'
  // Turno 3 — capítulos narrativos adicionais
  | 'essencia' | 'arquetipos' | 'coloracao_avancada' | 'tecidos_materiais'
  | 'acessorios' | 'beleza' | 'ocasioes' | 'digital' | 'viagens'
  | 'sazonalidade' | 'investimento' | 'encerramento'
  // Capítulo prático (sem imagens, sai no PDF)
  | 'ritual';

const CHAPTER_META_MAP: Record<SectionId, { number: string; label: string; title: string; eyebrow: string; subtitle?: string }> = {
  essencia:            { number: 'I',     label: 'Essência',       title: 'Essência e Momento',                  eyebrow: 'Capítulo I · Abertura',           subtitle: 'Um retrato íntimo de quem você é hoje e do momento que atravessa.' },
  perfil:              { number: 'II',    label: 'Perfil Mestre',  title: 'Perfil Mestre',                       eyebrow: 'Capítulo II · Perfil Mestre',     subtitle: 'A síntese que ancora todo o seu dossiê.' },
  arquetipos:          { number: 'III',   label: 'Arquétipos',     title: 'Arquétipos Pessoais',                 eyebrow: 'Capítulo III · Arquétipos',       subtitle: 'As forças simbólicas que regem sua presença e como equilibrá-las.' },
  percepcao:           { number: 'IV',    label: 'Diagnóstico',    title: 'Diagnóstico de Imagem',               eyebrow: 'Capítulo IV · Percepção',         subtitle: 'Como sua imagem comunica hoje versus o que você deseja projetar.' },
  estilo:              { number: 'V',     label: 'Assinatura',     title: 'Sua Assinatura Visual',               eyebrow: 'Capítulo V · Estilo',             subtitle: 'A frase que traduz sua presença — estilos, arquétipo e assinatura.' },
  estrategia:          { number: 'VI',    label: 'Estratégia',     title: 'Estratégia de Imagem',                eyebrow: 'Capítulo VI · Estratégia',        subtitle: 'Os eixos que definem como sua presença é lida — e como cultivá-los.' },
  dna:                 { number: 'VII',   label: 'DNA Visual',     title: 'DNA Visual',                          eyebrow: 'Capítulo VII · Linguagem',        subtitle: 'Tecidos, texturas, estampas, modelagens e acessórios da sua gramática.' },
  paleta:              { number: 'VIII',  label: 'Paleta',         title: 'Coloração e Paleta Estratégica',      eyebrow: 'Capítulo VIII · Cor',             subtitle: 'A cartela que sustenta sua imagem — por intenção, contexto e função.' },
  coloracao_avancada:  { number: 'IX',    label: 'Cor Aplicada',   title: 'Coloração Aplicada',                  eyebrow: 'Capítulo IX · Coloração',         subtitle: 'Como usar sua paleta em combinações, proporções e camadas reais.' },
  silhueta:            { number: 'X',     label: 'Silhueta',       title: 'Guia de Silhueta',                    eyebrow: 'Capítulo X · Corpo',              subtitle: 'Como vestir a sua estrutura corporal com equilíbrio e estratégia.' },
  tecidos_materiais:   { number: 'XI',    label: 'Tecidos',        title: 'Tecidos e Materiais',                 eyebrow: 'Capítulo XI · Materiais',         subtitle: 'A textura e o caimento como camada silenciosa da sua imagem.' },
  acessorios:          { number: 'XII',   label: 'Acessórios',     title: 'Acessórios e Detalhes',               eyebrow: 'Capítulo XII · Detalhes',         subtitle: 'Joias, bolsas, sapatos e detalhes que finalizam sua narrativa.' },
  beleza:              { number: 'XIII',  label: 'Beleza',         title: 'Beleza e Presença',                   eyebrow: 'Capítulo XIII · Beleza',          subtitle: 'Cabelo, maquiagem e cuidados que dialogam com sua assinatura.' },
  pecas:               { number: 'XIV',   label: 'Guarda-roupa',   title: 'Guarda-Roupa Estratégico',            eyebrow: 'Capítulo XIV · Peças',            subtitle: 'A hierarquia das peças: essenciais, impacto, assinatura e investimento.' },
  apostar:             { number: 'XV',    label: 'Apostar',        title: 'O Que Apostar',                       eyebrow: 'Capítulo XV · Escolhas',          subtitle: 'Elementos que amplificam seu impacto visual — cada um com justificativa.' },
  evitar:              { number: 'XVI',   label: 'Evitar',         title: 'O Que Evitar',                        eyebrow: 'Capítulo XVI · Ruído',            subtitle: 'Escolhas que enfraquecem sua mensagem, com as alternativas recomendadas.' },
  capsula:             { number: 'XVII',  label: 'Cápsula',        title: 'Guarda-Roupa Cápsula',                eyebrow: 'Capítulo XVII · Planejamento',    subtitle: 'Base, construção e impacto — combinados em looks reais por ocasião.' },
  ocasioes:            { number: 'XVIII', label: 'Ocasiões',       title: 'Ocasiões e Contextos',                eyebrow: 'Capítulo XVIII · Contexto',       subtitle: 'Como sua imagem se traduz em cada cenário da sua vida.' },
  digital:             { number: 'XIX',   label: 'Digital',        title: 'Imagem Digital',                      eyebrow: 'Capítulo XIX · Presença Online',  subtitle: 'Como sua assinatura se comporta em fotos, vídeo e telas.' },
  viagens:             { number: 'XX',    label: 'Viagens',        title: 'Viagens e Deslocamento',              eyebrow: 'Capítulo XX · Movimento',         subtitle: 'Vestir-se bem em trânsito, com poucas peças e alto impacto.' },
  sazonalidade:        { number: 'XXI',   label: 'Sazonalidade',   title: 'Sazonalidade e Estações',             eyebrow: 'Capítulo XXI · Estações',         subtitle: 'Como sua paleta e cápsula respondem ao clima e ao calendário.' },
  investimento:        { number: 'XXII',  label: 'Investimento',   title: 'Investimento e Prioridades',          eyebrow: 'Capítulo XXII · Investir',        subtitle: 'Onde colocar orçamento primeiro e o que deixar para depois.' },
  evolucao:            { number: 'XXIII', label: 'Evolução',       title: 'Plano de Evolução',                   eyebrow: 'Capítulo XXIII · Roadmap',        subtitle: 'Um caminho em 30, 60 e 90 dias para consolidar sua assinatura visual.' },
  inspiracoes:         { number: 'XXIV',  label: 'Inspirações',    title: 'Inspirações Visuais',                 eyebrow: 'Capítulo XXIV · Moodboard',       subtitle: 'Referências curadas para o seu perfil, separadas por contexto de uso.' },
  encerramento:        { number: 'XXV',   label: 'Carta Final',    title: 'Carta Final',                         eyebrow: 'Capítulo XXV · Encerramento',     subtitle: 'Uma síntese autoral e o primeiro passo para amanhã.' },
  ritual:              { number: 'XXVI',  label: 'Ritual',         title: 'Ritual de Estilo Diário',             eyebrow: 'Capítulo XXVI · Prática',         subtitle: 'Um protocolo curto para transformar o dossiê em rotina.' },
};

function normalizeImageToken(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function asDisplayText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (Array.isArray(value)) {
    const text = value.map((item) => asDisplayText(item)).filter(Boolean).join(' · ');
    return text || fallback;
  }
  if (value && typeof value === 'object') {
    const text = Object.values(value as Record<string, unknown>).map((item) => asDisplayText(item)).filter(Boolean).join(' · ');
    return text || fallback;
  }
  return fallback;
}

function buildClientMasterProfile(diagnosis: DiagnosisData, fd: Record<string, unknown> | null): Record<string, string> {
  const q = (diagnosis.questionnaire || {}) as Record<string, unknown>;
  const body = (diagnosis.body_analysis || {}) as Record<string, unknown>;
  const color = (diagnosis.color_analysis || {}) as Record<string, unknown>;
  const style = (diagnosis.style_analysis || {}) as Record<string, unknown>;
  const modeling = (diagnosis.modeling_analysis || {}) as Record<string, unknown>;
  const final = (fd || {}) as Record<string, unknown>;

  const occasions = asDisplayText(q.occasions, 'trabalho, vida social e momentos de presença');
  const goals = asDisplayText(q.goals || q.objetivosImagem || final.transformacao_proposta, 'alinhar imagem e intenção');
  const styleName = asDisplayText(style.estilo_predominante || style.estilo_principal || final.estilo_predominante, 'uma assinatura visual autoral');
  const secondaryStyles = asDisplayText(style.estilos_secundarios || final.estilos_secundarios, 'elegância, personalidade e adaptação');
  const bodyType = asDisplayText(body.tipo_corporal || body.biotipo || body.formato_corporal, 'uma estrutura corporal que pede equilíbrio visual');
  const season = asDisplayText(color.estacao || color.estacao_cor || color.coloracao_pessoal || color.paleta_nome, 'uma paleta estratégica');
  const palette = asDisplayText(color.paleta_cores_ideais || color.paleta || color.cores_recomendadas, 'cores que sustentam presença e harmonia');
  const modelingText = asDisplayText(modeling.dicas_modelagem || modeling.modelagens_ideais || final.modelagens_ideais, 'modelagens com estrutura, proporção e conforto visual');
  const challenges = asDisplayText(q.challenges || q.dores || final.principais_descobertas, 'transformar escolhas em uma imagem mais coerente');
  const budget = asDisplayText(q.budget || q.orcamentoMensal, 'investimento consciente e progressivo');

  return {
    historia: `Este diagnóstico lê sua imagem a partir das suas respostas e do desejo de ${goals}. A construção visual indicada nasce do encontro entre intenção, objetivo e presença.`,
    momento_de_vida: `O momento pede uma imagem mais editada, menos acidental e mais alinhada ao que você deseja comunicar. ${challenges} funciona como ponto de virada para organizar escolhas com mais intenção.`,
    momento_profissional: `No campo profissional, sua imagem precisa sustentar credibilidade sem apagar personalidade. A estratégia é parecer preparada, coerente e reconhecível nos contextos de ${occasions}.`,
    estilo_de_vida: `Sua vida pede um guarda-roupa funcional, mas não genérico. Bases confiáveis, pontos de assinatura e repetição inteligente tornam a rotina mais simples e mais elegante.`,
    rotina: `A rotina deve ser atendida por combinações prontas, tecidos possíveis e modelagens que acompanhem movimento. O foco é reduzir esforço e aumentar domínio sobre a própria imagem.`,
    ocasioes_prioritarias: `${occasions} orientam as escolhas mais importantes do dossiê. Cada peça deve ter função clara e circular entre cenários reais.`,
    personalidade: `Sua personalidade visual se organiza em torno de ${styleName}, com nuances de ${secondaryStyles}. A imagem recomendada tem intenção, presença e adaptação.`,
    essencia: 'A leitura definitiva da sua imagem — uma obra única, feita para permanecer.',
    pontos_fortes: `Os pontos fortes estão na possibilidade de unir cor, caimento e estilo em uma assinatura reconhecível. Quando esses eixos caminham juntos, sua imagem ganha presença sem excesso.`,
    pontos_fracos: `O principal risco é dispersar a imagem em peças sem função, cores pouco estratégicas ou modelagens que não sustentam a mensagem desejada. O caminho é editar antes de acrescentar.`,
    potencial_nao_expresso: `Há potencial para uma presença mais marcante, madura e memorável. Ele aparece quando o guarda-roupa traduz quem você é, onde circula e como deseja ser lembrada.`,
    biotipo_interpretado: `${bodyType}. A estratégia corporal conduz o olhar por proporções, linhas e pontos de equilíbrio que valorizam sua estrutura.`,
    coloracao_interpretada: `${season}. A cor deve aproximar, iluminar, sofisticar e criar coerência entre rosto, roupa e contexto.`,
    subtom_e_paleta: `A paleta trabalha com ${palette}. O uso ideal combina bases seguras com acentos colocados de forma intencional.`,
    estilo_predominante: `${styleName}. Ele aparece como eixo nas linhas, materiais, combinações e no nível de impacto escolhido para cada ocasião.`,
    estilos_secundarios: `${secondaryStyles}. Essas camadas ajudam a adaptar a assinatura principal para trabalho, casualidade, eventos e momentos de maior presença.`,
    arquetipos: asDisplayText(final.arquetipos || style.arquetipos, 'Arquétipos de presença, refinamento e intenção.'),
    dna_visual: `Seu DNA visual se apoia em ${modelingText}, paleta coerente e peças com função. A imagem ideal deve parecer clara, pessoal e aplicável.`,
    personalidade_visual: asDisplayText(final.persona_visual || final.assinatura_visual, `Uma presença ${styleName.toLowerCase()} com intenção, realidade e permanência.`),
    estrategia_imagem: `A estratégia é priorizar coerência antes de quantidade. Com ${budget}, o melhor caminho é investir em bases certeiras, camada de assinatura e combinações que resolvam a rotina.`,
    nivel_investimento: `${budget}. A compra ideal deve ser avaliada por repetição de uso, qualidade percebida, aderência à paleta e capacidade de compor mais de um contexto.`,
    marcas_compativeis: 'As marcas compatíveis são aquelas que entregam bom caimento, tecidos consistentes e design sem excesso.',
    celebridades_compativeis: 'As referências devem ser usadas como atmosfera, não como cópia: presença, edição e naturalidade adaptadas à sua própria rotina.',
    gaps_guarda_roupa: 'Os principais gaps aparecem quando faltam peças-ponte: itens capazes de transformar bases simples em looks completos.',
    erros_atuais: 'Os erros a evitar são compras isoladas, excesso de informação em um mesmo look e escolhas que ignoram caimento.',
    imagem_atual_vs_desejada: `A imagem atual pode carregar intenção, mas precisa de edição para comunicar ${goals} com mais força. A ponte está em repetir códigos certos até que sua presença pareça consistente.`,
    referencias_visuais_ancoras: 'As âncoras visuais são: paleta perto do rosto, silhueta bem direcionada, acabamento de qualidade percebida e uma peça de assinatura por look.',
  };
}

function collectDiagnosisPieces(diagnosis: DiagnosisData): string[] {
  const names = new Set<string>();
  const add = (value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) names.add(text);
  };
  const essentials = (diagnosis.wardrobe_essentials || {}) as Record<string, unknown>;
  Object.values(essentials).forEach((value) => {
    if (!Array.isArray(value)) return;
    value.forEach((item) => {
      if (typeof item === 'string') add(item);
      else if (item && typeof item === 'object') add((item as Record<string, unknown>).peca || (item as Record<string, unknown>).descricao);
    });
  });
  const capsule = (diagnosis.capsule_wardrobe || {}) as Record<string, unknown>;
  const pieces = (capsule.pecas_capsula || {}) as Record<string, unknown>;
  Object.values(pieces).forEach((value) => Array.isArray(value) && value.forEach(add));
  ['looks_trabalho', 'looks_casual', 'looks_eventos'].forEach((key) => {
    const looks = capsule[key];
    if (!Array.isArray(looks)) return;
    looks.forEach((look) => {
      const lookPieces = (look as Record<string, unknown>)?.pecas;
      if (Array.isArray(lookPieces)) lookPieces.forEach((piece) => String(piece).split(/\s*\+\s*/).forEach(add));
    });
  });
  return Array.from(names);
}

function getPdfImageSrc(img: HTMLImageElement): string {
  const src = img.currentSrc || img.src || img.getAttribute('src') || '';
  return src && !src.startsWith('blob:') ? src : '';
}

// Propriedades suficientes para transformar o dossiê renderizado na tela em
// um HTML estático fiel. Isso remove a dependência de o Browserless conseguir
// baixar o CSS compilado do domínio publicado/preview; o clone já carrega as
// medidas, cores, fontes, grids e espaçamentos computados pelo navegador real.
const PDF_COMPUTED_STYLE_PROPS = [
  'display', 'position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index',
  'box-sizing', 'float', 'clear',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'outline',
  'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat',
  'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style',
  'font-variant', 'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'text-decoration', 'text-indent', 'white-space', 'word-break', 'overflow-wrap',
  'vertical-align', 'list-style', 'list-style-position', 'list-style-type',
  'opacity', 'visibility', 'overflow', 'overflow-x', 'overflow-y',
  'object-fit', 'object-position', 'aspect-ratio',
  'box-shadow', 'text-shadow', 'filter',
  'transform', 'transform-origin',
  'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink',
  'flex-wrap', 'align-items', 'align-content', 'align-self', 'justify-content',
  'justify-items', 'justify-self', 'gap', 'row-gap', 'column-gap',
  'grid', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow', 'grid-column', 'grid-row',
  'place-content', 'place-items', 'place-self',
  'columns', 'column-count', 'column-gap',
] as const;

function inlineComputedStylesForPdf(originalRoot: HTMLElement, clonedRoot: HTMLElement) {
  const originals = [originalRoot, ...Array.from(originalRoot.querySelectorAll<HTMLElement>('*'))];
  const clones = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll<HTMLElement>('*'))];

  originals.forEach((original, index) => {
    const clone = clones[index];
    if (!clone) return;
    const computed = window.getComputedStyle(original);
    const inline = clone.style;

    PDF_COMPUTED_STYLE_PROPS.forEach((prop) => {
      const value = computed.getPropertyValue(prop);
      if (value) inline.setProperty(prop, value);
    });

    // Congela animações/motion para não capturar estados intermediários no PDF.
    inline.setProperty('animation', 'none');
    inline.setProperty('transition', 'none');
    inline.setProperty('-webkit-print-color-adjust', 'exact');
    inline.setProperty('print-color-adjust', 'exact');

    // Framer Motion pode deixar elementos fora do viewport com opacity/transform
    // inicial. Para PDF, o dossiê precisa aparecer completo.
    const opacity = Number(computed.opacity || '1');
    if (Number.isFinite(opacity) && opacity < 0.98) inline.setProperty('opacity', '1');
    if (computed.visibility === 'hidden') inline.setProperty('visibility', 'visible');

    if (original instanceof HTMLImageElement && clone instanceof HTMLImageElement) {
      const rect = original.getBoundingClientRect();
      if (rect.width > 0) inline.setProperty('width', `${Math.round(rect.width)}px`);
      if (rect.height > 0) inline.setProperty('height', `${Math.round(rect.height)}px`);
    }
  });
}

function collectPdfImageOverrides(root: HTMLElement) {
  const sectionImages: Array<{ section: string; image_url: string }> = [];
  const clothingImages: Array<{ piece_key: string; normalized_key: string; image_url: string }> = [];
  const lookImages: Array<{ look_name: string; image_url: string }> = [];
  const seenSection = new Set<string>();
  const seenClothing = new Set<string>();
  const seenLook = new Set<string>();

  root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const imageUrl = getPdfImageSrc(img);
    if (!imageUrl) return;

    const section = img.dataset.pdfSectionKey;
    if (section && !seenSection.has(section)) {
      seenSection.add(section);
      sectionImages.push({ section, image_url: imageUrl });
    }

    const pieceKey = img.dataset.pdfPieceKey;
    const pieceRaw = img.dataset.pdfPieceRaw || pieceKey;
    if (pieceKey && !seenClothing.has(pieceKey)) {
      seenClothing.add(pieceKey);
      clothingImages.push({ piece_key: pieceRaw || pieceKey, normalized_key: pieceKey, image_url: imageUrl });
    }

    const lookName = img.dataset.pdfLookName;
    if (lookName && !seenLook.has(lookName)) {
      seenLook.add(lookName);
      lookImages.push({ look_name: lookName, image_url: imageUrl });
    }
  });

  return { sectionImages, clothingImages, lookImages };
}

async function inlineStylesheet(href: string): Promise<string> {
  try {
    const res = await fetch(href, { credentials: 'same-origin' });
    if (!res.ok) return '';
    let css = await res.text();
    // Reescreve url(...) relativos para absolutos contra o href do CSS
    css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => {
      if (/^(data:|https?:|\/\/)/i.test(url)) return match;
      try {
        const abs = new URL(url, href).toString();
        return `url(${quote}${abs}${quote})`;
      } catch {
        return match;
      }
    });
    return css;
  } catch {
    return '';
  }
}

async function buildFrozenPdfHtml(root: HTMLElement): Promise<string> {
  const clone = root.cloneNode(true) as HTMLElement;
  const rootRect = root.getBoundingClientRect();
  const rootWidth = Math.max(Math.ceil(rootRect.width || root.scrollWidth || 1100), 320);
  const originalImages = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  const clonedImages = Array.from(clone.querySelectorAll<HTMLImageElement>('img'));

  clonedImages.forEach((img, index) => {
    const src = getPdfImageSrc(originalImages[index] || img);
    if (src) {
      img.setAttribute('src', src);
      img.setAttribute('data-pdf-frozen-src', src);
    }
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.removeAttribute('loading');
    img.setAttribute('decoding', 'sync');
    img.setAttribute('crossorigin', 'anonymous');
  });

  inlineComputedStylesForPdf(root, clone);

  clone.style.setProperty('display', 'block');
  clone.style.setProperty('margin', '0 auto');
  clone.style.setProperty('width', `${rootWidth}px`);
  clone.style.setProperty('max-width', 'none');
  clone.style.setProperty('background', window.getComputedStyle(root).background || '#0A0A0A');

  clone.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
    if (el.style.opacity && Number(el.style.opacity) < 1) el.style.opacity = '1';
    if (el.style.transform) el.style.transform = 'none';
    if (el.style.visibility === 'hidden') el.style.visibility = 'visible';
  });

  // Inlina TODOS os stylesheets para o Browserless não precisar buscar
  // recursos numa origem gated/autenticada (preview lovable, etc).
  const headNodes = Array.from(
    document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'),
  );
  const headParts = await Promise.all(
    headNodes.map(async (node) => {
      if (node.tagName.toLowerCase() === 'link') {
        const link = node as HTMLLinkElement;
        const href = link.href || link.getAttribute('href');
        if (!href) return '';
        const css = await inlineStylesheet(href);
        return css ? `<style data-inlined-href="${href.replace(/"/g, '&quot;')}">${css}</style>` : '';
      }
      return `<style>${node.textContent || ''}</style>`;
    }),
  );

  // Também captura regras injetadas em runtime via CSSStyleSheet (styled-jsx, etc.)
  const runtimeCss: string[] = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = (sheet as CSSStyleSheet).cssRules;
        if (!rules) continue;
        let text = '';
        for (const rule of Array.from(rules)) text += rule.cssText + '\n';
        if (text) runtimeCss.push(text);
      } catch {
        // cross-origin stylesheet — já tratado via inlineStylesheet
      }
    }
  } catch { /* ignore */ }

  const fontLinks = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"], link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]'))
    .map((l) => l.outerHTML)
    .join('\n');

  return `<!doctype html>
<html class="pdf-static-clone">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base href="${window.location.origin}/">
    ${fontLinks}
    ${headParts.join('\n')}
    <style data-runtime-css>${runtimeCss.join('\n')}</style>
    <style data-pdf-static-clone-base>
      @page { size: ${rootWidth}px ${Math.round(rootWidth * 1.41421356)}px; margin: 0; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${rootWidth}px !important;
        background: #0A0A0A !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body { overflow: visible !important; }
      * { box-sizing: border-box; animation: none !important; transition: none !important; }
      img { max-width: 100%; break-inside: avoid; page-break-inside: avoid; }
      svg { max-width: 100%; }
      [data-sonner-toaster], [data-radix-portal] { display: none !important; }
    </style>
  </head>
  <body>${clone.outerHTML}</body>
</html>`;
}

function collectDiagnosisImageHints(diagnosis: DiagnosisData): { pieces: string[]; colors: string[] } {
  const pieces = new Set<string>();
  const colors = new Set<string>();
  const addText = (target: Set<string>, value: unknown) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (text) target.add(text);
  };

  const essentials = (diagnosis.wardrobe_essentials || {}) as Record<string, unknown>;
  Object.values(essentials).forEach((value) => {
    if (!Array.isArray(value)) return;
    value.forEach((item) => {
      if (typeof item === 'string') addText(pieces, item);
      else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        addText(pieces, row.peca || row.descricao || row.nome);
        addText(colors, row.cor || row.color || row.tom);
      }
    });
  });

  const capsule = (diagnosis.capsule_wardrobe || {}) as Record<string, unknown>;
  const capsulePieces = (capsule.pecas_capsula || {}) as Record<string, unknown>;
  Object.values(capsulePieces).forEach((value) => Array.isArray(value) && value.forEach((item) => addText(pieces, item)));
  ['looks_trabalho', 'looks_casual', 'looks_eventos'].forEach((key) => {
    const looks = capsule[key];
    if (!Array.isArray(looks)) return;
    looks.forEach((look) => {
      const lookPieces = (look as Record<string, unknown>)?.pecas;
      if (Array.isArray(lookPieces)) {
        lookPieces.forEach((piece) => String(piece).split(/\s*\+\s*/).forEach((part) => addText(pieces, part)));
      }
    });
  });

  const colorAnalysis = (diagnosis.color_analysis || {}) as Record<string, unknown>;
  const finalDiagnosis = (diagnosis.final_diagnosis || {}) as Record<string, unknown>;
  [
    colorAnalysis.cartela,
    colorAnalysis.paleta,
    colorAnalysis.cores_principais,
    colorAnalysis.cores_ideais,
    finalDiagnosis.paleta_estrategica,
    finalDiagnosis.cores_base,
    finalDiagnosis.cores_destaque,
  ].forEach((value) => {
    if (Array.isArray(value)) value.forEach((item) => addText(colors, item));
    else if (typeof value === 'string') value.split(/[,;|]/).forEach((part) => addText(colors, part));
  });

  return {
    pieces: Array.from(pieces).slice(0, 40),
    colors: Array.from(colors).slice(0, 20),
  };
}

function hasPieceImage(imagesMap: Map<string, string>, pieceName: string, diagnosisId?: string): boolean {
  const key = normalizeImageToken(pieceName);
  if (!key) return true;
  if (diagnosisId && getStaticDiagnosticImage(`${diagnosisId}:piece:${key}`)) return true;
  if (imagesMap.has(key)) return true;
  return Array.from(imagesMap.keys()).some((storedKey) => storedKey.includes(key) || key.includes(storedKey));
}

function getPieceImage(imagesMap: Map<string, string>, pieceName: string, diagnosisId?: string): string | null {
  const key = normalizeImageToken(pieceName);
  if (!key) return null;
  const staticUrl = diagnosisId ? getStaticDiagnosticImage(`${diagnosisId}:piece:${key}`) : null;
  if (staticUrl) return staticUrl;
  const exact = imagesMap.get(key);
  if (exact) return exact;
  for (const [storedKey, url] of imagesMap.entries()) {
    if (storedKey.includes(key) || key.includes(storedKey)) return url;
  }
  return null;
}

function getStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return undefined;
}

function buildDiagnosisImageFingerprint(diagnosis: DiagnosisData): string {
  return stableDiagnosticImageHash({
    id: diagnosis.id,
    questionnaire: diagnosis.questionnaire,
    body: {
      height_cm: diagnosis.height_cm,
      weight_kg: diagnosis.weight_kg,
      top_size: diagnosis.top_size,
      bottom_size: diagnosis.bottom_size,
      shoe_size: diagnosis.shoe_size,
      body_notes: diagnosis.body_notes,
      body_analysis: diagnosis.body_analysis,
      body_balance_score: diagnosis.body_balance_score,
    },
    color: {
      hair_color: diagnosis.hair_color,
      eye_color: diagnosis.eye_color,
      skin_tone: diagnosis.skin_tone,
      color_analysis: diagnosis.color_analysis,
    },
    style: {
      fit_preference: diagnosis.fit_preference,
      formality_level: diagnosis.formality_level,
      style_intensity_score: diagnosis.style_intensity_score,
      style_analysis: diagnosis.style_analysis,
      modeling_analysis: diagnosis.modeling_analysis,
    },
    wardrobe: diagnosis.wardrobe_essentials,
    capsule: diagnosis.capsule_wardrobe,
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DiagnosisResult() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('token');
  const regenFlag = searchParams.get('regen') === '1';

  // Gatilho manual: /diagnosis/<id>?regen=1 força reprocessar todas as imagens
  // (apaga rows antigas em diagnosis_section_images e chama generate-section-images).
  useEffect(() => {
    if (!regenFlag || !id) return;
    let cancelled = false;
    (async () => {
      try {
        toast.info('Regenerando imagens do dossiê…');
        const { error } = await supabase.functions.invoke('generate-section-images', {
          body: { diagnosis_id: id, content_type: 'all', force: true },
        });
        if (cancelled) return;
        if (error) {
          console.warn('[regen] erro:', error.message);
          toast.error('Falha ao regenerar imagens');
        } else {
          toast.success('Imagens regeradas — recarregando…');
          setTimeout(() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('regen');
            window.location.replace(url.toString());
          }, 800);
        }
      } catch (e) {
        console.warn('[regen] throw:', (e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [regenFlag, id]);

  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useAdmin();

  const { access: planAccess } = usePlanAccess();
  const canPdf = planAccess?.is_admin || planAccess?.can_download_pdf || false;
  const canShare = planAccess?.is_admin || planAccess?.can_share || false;

  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  // Editorial dossier: single scroll, no active tab state needed.
  const [imagesReady, setImagesReady] = useState(false);
  const [imagesProgress, setImagesProgress] = useState({ loaded: 0, total: 0 });
  const [pieceAssetsReady, setPieceAssetsReady] = useState(false);
  const [lookAssetsReady, setLookAssetsReady] = useState(false);
  const [pieceRefresh, setPieceRefresh] = useState(0);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  // Correção #3: gating do botão PDF. Enquanto o motor ainda persiste
  // imagens em clothing_images, o botão fica "Preparando…". Polling curto
  // (3s) re-lê o banco; timeout duro de 20s libera com aviso.
  const [pdfGateOverride, setPdfGateOverride] = useState(false);
  const refreshPieceImages = useCallback(() => setPieceRefresh((v) => v + 1), []);
  const [pdfProgress, setPdfProgress] = useState('');
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Detecta modo de renderização para PDF: querystring ?pdf=1, flag global
  // injetada pelo Browserless, ou classe `print-mode` no <html>. Um observer
  // reage caso a classe seja adicionada após o primeiro render.
  const detectPdfMode = () => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('pdf') === '1' ||
      Boolean((window as Window & { __EST_ELITE_PDF__?: boolean }).__EST_ELITE_PDF__) ||
      document.documentElement.classList.contains('print-mode')
    );
  };
  const [isPdfMode, setIsPdfMode] = useState<boolean>(detectPdfMode);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setIsPdfMode(detectPdfMode());
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const pdfSnapshot = useMemo(() => (isPdfMode ? getPdfSnapshot(id) : null), [id, isPdfMode]);
  const expectedPdfDiagnosisId = useMemo(() => (isPdfMode ? getExpectedPdfDiagnosisId() : null), [isPdfMode]);
  const generatingPiecesRef = useRef<string>('');
  const imageRefreshKey = `${diagnosis?.updated_at || ''}:${pieceRefresh}`;
  const { imagesMap, isLoading: imagesLoading } = useDiagnosisImages(diagnosis?.id, undefined, imageRefreshKey, pdfSnapshot?.clothingImages ?? null);
  const { lookImagesMap, isLoading: lookImagesLoading } = useLookImages(diagnosis?.id, imageRefreshKey, pdfSnapshot?.lookImages ?? null);
  const requiredPieceNames = useMemo(() => diagnosis ? collectDiagnosisPieces(diagnosis) : [], [diagnosis]);
  const pieceImagesReady = !imagesLoading && requiredPieceNames.every((name) => hasPieceImage(imagesMap, name, diagnosis?.id));
  // Sem gate de imagens: o diagnóstico renderiza imediatamente e cada
  // imagem carrega de forma independente (skeleton + retry/fallback locais).
  void imagesReady; void pieceImagesReady; void pieceAssetsReady; void lookAssetsReady;

  // Diagnóstico completo é IMUTÁVEL — não geramos nada depois disso.
  // O botão de PDF fica liberado assim que o diagnóstico existir.
  const pdfReady = true;
  void setPdfGateOverride; void pdfGateOverride; void setPieceRefresh; void pieceRefresh;



  useEffect(() => {
    // Ao (re)abrir um diagnóstico, invalida o cache module-scoped de imagens
    // de seção — assim a tela sempre relê do banco (mesma fonte que o PDF).
    if (id) clearDiagnosisImagesCache(id);
  }, [id]);

  useEffect(() => {
    // Modo "print via share_token": pula auth e busca via RPC pública.
    if (shareToken && id) { fetchDiagnosis(); return; }
    if (!authLoading && !user) { navigate('/auth'); return; }
    if (id && user) fetchDiagnosis();
  }, [id, user, authLoading, shareToken]);


  useEffect(() => {
    if (isPdfMode || !diagnosis || diagnosis.status === 'failed') return;
    // PONTO FINAL: quando o diagnóstico está `completed`, o dossiê é
    // considerado FIXO. Não fazemos mais polling nem disparamos qualquer
    // geração adicional em background — o que o usuário vê ao carregar é
    // exatamente o dossiê final. Isso evita que a IA fique "travando" ou
    // reprocessando capítulos/imagens depois de entregue.
    if (diagnosis.status === 'completed') return;

    const fd = (diagnosis.final_diagnosis as Record<string, unknown> | null);
    const chapters = (fd?.chapters as Record<string, any> | undefined) || {};
    const dossierStatus = (fd?.dossier_status as string | undefined);
    const progress = (fd?.dossier_progress as { total?: number; enriched?: number } | undefined);
    const total = progress?.total ?? 25;
    const enriched = progress?.enriched ?? Object.values(chapters).filter((c: any) => c && !c._seed).length;
    const dossierGenerating = dossierStatus !== 'error' && enriched < total;

    const delay = dossierGenerating ? 4000 : 2500;
    const timer = window.setTimeout(() => {
      fetchDiagnosis();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [diagnosis?.id, diagnosis?.status, diagnosis?.generated_images, diagnosis?.final_diagnosis, isPdfMode]);


  useEffect(() => {
    setImagesReady(false);
    setPieceAssetsReady(false);
    setLookAssetsReady(false);
    setImagesProgress({ loaded: 0, total: 0 });
    generatingPiecesRef.current = '';
  }, [diagnosis?.id]);

  // ── Warm-up: dispara em paralelo todas as URLs das seções para que o CDN
  // do Pollinations já tenha a imagem pronta quando o usuário trocar de aba.
  // Não muda prompt nem geração — só pré-carrega as mesmas URLs.
  useEffect(() => {
    if (isPdfMode || !diagnosis || diagnosis.status !== 'completed' || !user?.id) return;
    try {
      const q = (diagnosis.questionnaire || {}) as Record<string, unknown>;
      const occ = Array.isArray((q as { occasions?: unknown }).occasions)
        ? ((q as { occasions: string[] }).occasions[0] ?? '')
        : (((q as { occasion?: string }).occasion) ?? '');
      const bodyType = (diagnosis.body_analysis as Record<string, unknown> | null)?.tipo_corporal as string | undefined;
      const estiloPredominante = (diagnosis.style_analysis as Record<string, unknown> | null)?.estilo_predominante as string | undefined;
      const imageFingerprint = buildDiagnosisImageFingerprint(diagnosis);
      const d: DiagnosticData = {
        userId: diagnosis.id,
        imageFingerprint,
        estiloDeVida: ((q as { lifestyle?: string }).lifestyle) || '',
        profissao: ((q as { profession?: string }).profession) || '',
        ocasiao: normalizeOcasiao(occ),
        orcamento: normalizeOrcamento((q as { budget?: string; orcamentoMensal?: string }).budget || (q as { orcamentoMensal?: string }).orcamentoMensal),
        clima: normalizeClima((q as { climate?: string }).climate),
        altura: diagnosis.height_cm || 165,
        peso: diagnosis.weight_kg || 60,
        tamanhoSuperior: diagnosis.top_size || 'M',
        tamanhoInferior: diagnosis.bottom_size || '38',
        tipoCorporal: normalizeTipoCorporal(bodyType),
        caimento: normalizeCaimento(diagnosis.fit_preference),
        formalidade: normalizeFormalidade(diagnosis.formality_level),
        observacoesCorpo: diagnosis.body_notes || undefined,
        corCabelo: (diagnosis.hair_color || '').replace(/_/g, ' '),
        corOlhos: (diagnosis.eye_color || '').replace(/_/g, ' '),
        tomDePele: normalizeTomDePele(diagnosis.skin_tone),
        estiloPersonalidade: normalizeEstilo(estiloPredominante),
        objetivos: String((q as { goals?: unknown; objetivosImagem?: unknown }).goals || getStringArray((q as { objetivosImagem?: unknown }).objetivosImagem)?.join(', ') || ''),
        desafios: String((q as { challenges?: unknown; dores?: unknown }).challenges || getStringArray((q as { dores?: unknown }).dores)?.join(', ') || ''),
        restricoes: getStringArray((q as { restricoes?: unknown; restrictions?: unknown }).restricoes || (q as { restrictions?: unknown }).restrictions),
        tecidosEvitar: getStringArray((q as { tecidosEvitar?: unknown }).tecidosEvitar),
        elementosEvitar: getStringArray((q as { elementosEvitar?: unknown }).elementosEvitar),
        decotesEvitar: getStringArray((q as { decotesEvitar?: unknown }).decotesEvitar),
        coresEvitar: getStringArray((q as { coresEvitar?: unknown }).coresEvitar),
        estampasEvitar: getStringArray((q as { estampasEvitar?: unknown }).estampasEvitar),
      };
      const all = buildAllPrompts(d);
      const storedSectionImages = (diagnosis.generated_images || {}) as Record<string, string>;
      const buildGroup = (spec: { prompt: string; w: number; h: number; seed: number }, section: string, variant: string) => ({
        key: `${imageFingerprint}:${section}:${variant}`,
        urls: getFastDiagnosticImageCandidateUrls({
          prompt: spec.prompt,
          width: spec.w,
          height: spec.h,
          seed: spec.seed,
          initialSrc: storedSectionImages[`${section}_${variant}`] || storedSectionImages[`${section}:${variant}`] || (variant === 'primary' ? storedSectionImages[section] : undefined),
        }),
      });
      // 🔒 Gating MÍNIMO: apenas as imagens imediatamente visíveis na aba
      // inicial (Resumo). Outras secondary/extras seguem em warmup paralelo
      // e ficam prontas no cache até o usuário trocar de aba.
      const gatingGroups = [
        ...all.resumo.slice(0, 1).map((spec) => buildGroup(spec, 'resumo', 'primary')),
        ...all.corporal.slice(0, 1).map((spec) => buildGroup(spec, 'corpo', 'primary')),
        ...all.coloracao.slice(0, 1).map((spec) => buildGroup(spec, 'cores', 'primary')),
        ...all.estilo.slice(0, 1).map((spec) => buildGroup(spec, 'estilo', 'primary')),
        ...all.modelagens.slice(0, 1).map((spec) => buildGroup(spec, 'modelagens', 'primary')),
        ...all.essenciais.slice(0, 1).map((spec) => buildGroup(spec, 'essenciais', 'primary')),
        ...all.resumo.slice(1).map((spec) => buildGroup(spec, 'resumo', 'secondary')),
      ];
      // Não-bloqueante: demais abas (corpo/cores/estilo/modelagens/essenciais secondary + extras)
      const warmupGroups = [
        ...all.corporal.slice(1).map((spec, i) => buildGroup(spec, 'corpo', i === 0 ? 'secondary' : `extra-${i}`)),
        ...all.coloracao.slice(1).map((spec, i) => buildGroup(spec, 'cores', i === 0 ? 'secondary' : `extra-${i}`)),
        ...all.estilo.slice(1).map((spec) => buildGroup(spec, 'estilo', 'secondary')),
        ...all.modelagens.slice(1).map((spec) => buildGroup(spec, 'modelagens', 'secondary')),
        ...all.essenciais.slice(1).map((spec) => buildGroup(spec, 'essenciais', 'secondary')),
      ];
      setImagesProgress({ loaded: 0, total: gatingGroups.length });
      setImagesReady(false);
      // 🔥 Warm-up agressivo: gating + não-bloqueantes em paralelo
      warmupDiagnosticImages([...gatingGroups, ...warmupGroups].flatMap((g) => g.urls));
      let cancelled = false;
      preloadDiagnosticImageGroupsStrict(gatingGroups, (loaded, total) => {
        if (cancelled) return;
        setImagesProgress({ loaded, total });
      }).then(() => {
        if (!cancelled) setImagesReady(true);
      });
      return () => { cancelled = true; };


    } catch (err) {
      // silencioso — se falhar aqui, os outros bloqueios ainda seguram a tela de processamento
      console.warn('[warmup] failed', err);
    }
  }, [diagnosis?.id, diagnosis?.status, user?.id, isPdfMode]);

  useEffect(() => {
    if (!diagnosis || diagnosis.status !== 'completed') return;
    if (lookImagesLoading) {
      setLookAssetsReady(false);
      return;
    }
    setLookAssetsReady(false);
    let cancelled = false;
    const entries = Object.entries(lookImagesMap).filter(([, url]) => Boolean(url));
    preloadDiagnosticImageGroupsStrict(entries.map(([name, url]) => ({
      key: `${diagnosis.id}:look:${normalizeImageToken(name)}`,
      urls: [url],
    })), undefined).then(() => {
      if (!cancelled) setLookAssetsReady(true);
    });
    return () => { cancelled = true; };
  }, [diagnosis?.id, diagnosis?.status, lookImagesLoading, lookImagesMap]);

  // Diagnóstico completo é IMUTÁVEL: apenas pré-carrega as imagens JÁ
  // persistidas em `clothing_images` (via imagesMap). NÃO invoca nenhuma
  // função de geração — o que existir no banco é o que aparece na tela e
  // no PDF, sem substituições posteriores.
  useEffect(() => {
    if (isPdfMode || !diagnosis || diagnosis.status !== 'completed' || imagesLoading) return;
    const readyUrls = requiredPieceNames
      .map((name) => ({ name, url: getPieceImage(imagesMap, name, diagnosis.id) }))
      .filter((item): item is { name: string; url: string } => Boolean(item.url));
    setPieceAssetsReady(false);
    let cancelled = false;
    preloadDiagnosticImageGroupsStrict(readyUrls.map(({ name, url }) => ({
      key: `${diagnosis.id}:piece:${normalizeImageToken(name)}`,
      urls: [url],
    })), undefined).then(() => {
      if (!cancelled) setPieceAssetsReady(true);
    });
    return () => { cancelled = true; };
  }, [diagnosis?.id, diagnosis?.status, imagesLoading, requiredPieceNames, imagesMap, isPdfMode]);



  const fetchDiagnosis = async () => {
    try {
      let data: unknown;
      if (isPdfMode) {
        if (expectedPdfDiagnosisId && id && expectedPdfDiagnosisId !== id) {
          throw new Error('ID do PDF não corresponde ao diagnóstico solicitado.');
        }
        const snapshotDiagnosis = pdfSnapshot?.diagnosis;
        if (snapshotDiagnosis?.id && snapshotDiagnosis.id === id) {
          data = snapshotDiagnosis;
        } else {
          const { data: rowData, error } = await supabase.from('diagnoses').select('*').eq('id', id).single();
          if (error) throw error;
          data = rowData;
        }
        if ((data as { id?: string } | null)?.id !== id) {
          throw new Error('O PDF tentou carregar um diagnóstico diferente do solicitado.');
        }
      } else if (shareToken) {
        const { data: rpcData, error } = await supabase.rpc('get_diagnosis_by_share_token', { _token: shareToken });
        if (error) throw error;
        data = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!data) throw new Error('Diagnóstico não encontrado para este token.');
        // Trava de segurança para PDF: o token DEVE resolver exatamente o
        // diagnosisId da URL — senão o Browserless poderia renderizar outro
        // diagnóstico e as imagens do PDF ficariam desalinhadas com o web.
        if (id && (data as { id?: string }).id && (data as { id?: string }).id !== id) {
          throw new Error('Token não corresponde ao diagnóstico solicitado.');
        }
      } else {
        const { data: rowData, error } = await supabase.from('diagnoses').select('*').eq('id', id).single();
        if (error) throw error;
        data = rowData;
      }
      setDiagnosis(data as DiagnosisData);

    } catch (error) {
      console.error('Error fetching diagnosis:', error);
      if (!shareToken && !isPdfMode) {
        toast.error('Erro ao carregar diagnóstico');
        navigate('/account');
      }
    } finally {
      setLoading(false);
    }
  };


  const generateShareToken = async (): Promise<string | null> => {
    if (!diagnosis) return null;
    if (diagnosis.share_token) return diagnosis.share_token;
    setSharing(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await (supabase.from('diagnoses') as any).update({ share_token: token }).eq('id', diagnosis.id);
      if (error) throw error;
      setDiagnosis({ ...diagnosis, share_token: token });
      return token;
    } catch (err) {
      console.error('Error generating share token:', err);
      toast.error('Erro ao gerar link de compartilhamento');
      return null;
    } finally {
      setSharing(false);
    }
  };

  if (loading || (!shareToken && authLoading)) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              <Sparkles className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest animate-pulse">Carregando diagnóstico</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!diagnosis) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-6">
          <p className="text-muted-foreground font-sans">Diagnóstico não encontrado</p>
          <Button variant="premium" onClick={() => navigate('/account')}>Voltar</Button>
        </div>
      </Layout>
    );
  }

  if (diagnosis.status !== 'completed') {
    const failed = diagnosis.status === 'failed';
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-5 text-center max-w-md w-full">
            {failed ? (
              <div className="w-16 h-16 rounded-full border border-destructive/30 bg-destructive/10 flex items-center justify-center">
                <span className="text-destructive font-serif text-2xl">!</span>
              </div>
            ) : (
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <Sparkles className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
            )}
            <div className="space-y-2">
              <h1 className="font-serif text-2xl text-foreground">
                {failed ? 'Diagnóstico não concluído' : 'Preparando seu diagnóstico'}
              </h1>
              <p className="text-sm text-muted-foreground font-sans leading-relaxed">
                {failed
                  ? 'Não foi possível finalizar este diagnóstico. Volte e tente gerar novamente.'
                  : 'Seu diagnóstico está sendo finalizado. As imagens serão carregadas individualmente assim que o resultado abrir.'}
              </p>
            </div>
            {failed && (
              <Button variant="premium" onClick={() => navigate('/account')}>
                Voltar
              </Button>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  const getShareUrl = (token: string) => `${window.location.origin}/diagnosis/share/${token}`;

  const handleShare = async () => {
    const token = await generateShareToken();
    if (!token) return;
    const url = getShareUrl(token);
    if (navigator.share) { try { await navigator.share({ title: 'Meu Diagnóstico EST ELITE', url }); } catch { return; } }
    else { await navigator.clipboard.writeText(url); toast.success('Link copiado!'); }
  };

  const handleShareWhatsApp = async () => {
    // Abre a aba SINCRONAMENTE (dentro do handler de click) para não ser bloqueada por popup blocker.
    const popup = window.open('about:blank', '_blank');
    const token = await generateShareToken();
    if (!token) {
      popup?.close();
      return;
    }
    const url = getShareUrl(token);
    const text = encodeURIComponent(`✨ Confira meu diagnóstico de estilo pessoal na EST ELITE!\n\n${url}`);
    const waUrl = `https://wa.me/?text=${text}`;
    if (popup && !popup.closed) {
      popup.location.href = waUrl;
    } else {
      // Fallback caso o popup tenha sido bloqueado — navega na mesma aba.
      window.location.href = waUrl;
    }
  };

  // Diagnóstico concluído é imutável — sem regeneração de dossiê/imagens.




  const handleDownloadPDF = async () => {
    if (!diagnosis) return;
    const liveDossierRoot = document.getElementById('diagnosis-dossier') as HTMLElement | null;
    if (!liveDossierRoot) {
      toast.error('Dossiê não encontrado na tela.');
      return;
    }

    // Congela exatamente o DOM e as URLs que o usuário está vendo antes de
    // alterar o estado do botão. Re-renders e novas buscas de imagem não podem
    // trocar fotografias enquanto o PDF está sendo montado.
    const frozenDossierRoot = liveDossierRoot.cloneNode(true) as HTMLElement;
    const liveImages = Array.from(liveDossierRoot.querySelectorAll<HTMLImageElement>('img'));
    const frozenImages = Array.from(frozenDossierRoot.querySelectorAll<HTMLImageElement>('img'));
    frozenImages.forEach((image, index) => {
      const src = getPdfImageSrc(liveImages[index] || image);
      if (src) image.src = src;
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      image.removeAttribute('loading');
      image.decoding = 'sync';
    });

    const originalRootId = liveDossierRoot.id;
    const originalRootDisplay = liveDossierRoot.style.display;
    liveDossierRoot.id = `${originalRootId}-live`;
    liveDossierRoot.style.display = 'none';
    frozenDossierRoot.id = originalRootId;
    frozenDossierRoot.dataset.pdfFrozenClone = 'true';
    liveDossierRoot.insertAdjacentElement('afterend', frozenDossierRoot);

    setPdfGenerating(true);
    setPdfError(null);
    setPdfProgress('Gerando PDF…');
    const toastId = toast.loading('Exportando dossiê em PDF…');
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 120));

      const rawName =
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.email ? user.email.split('@')[0] : 'cliente');
      const safeName = (rawName || 'cliente')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'cliente';

      await exportWebPerfectPdf(frozenDossierRoot, {
        filename: `EST_ELITE_Dossie_${safeName}.pdf`,
        onProgress: (msg) => setPdfProgress(msg),
      });
      toast.success('PDF exportado.', { id: toastId });
    } catch (err) {
      const e = err as Error;
      console.error('[PDF] ERRO:', e);
      toast.dismiss(toastId);
      setPdfError(`${e?.name || 'Error'}: ${e?.message || String(err)}`);
      toast.error('Falha ao gerar PDF.');
      document.documentElement.classList.remove('print-mode');
    } finally {
      frozenDossierRoot.remove();
      liveDossierRoot.id = originalRootId;
      liveDossierRoot.style.display = originalRootDisplay;
      setPdfGenerating(false);
      setPdfProgress('');
    }
  };








  const isValid = (data: Record<string, unknown> | null) => data && !(data as Record<string, unknown>).error;

  const bodyType = (diagnosis.body_analysis as Record<string, unknown> | null)?.tipo_corporal as string | undefined;
  const colorSeason = (diagnosis.color_analysis as Record<string, unknown> | null)?.estacao_cor as string | undefined;
  const estacaoCor = (diagnosis.color_analysis as Record<string, unknown> | null)?.estacao as string | undefined;
  const estiloPredominante = (diagnosis.style_analysis as Record<string, unknown> | null)?.estilo_predominante as string | undefined;

  const capsuleData = diagnosis.capsule_wardrobe as Record<string, unknown> | null;
  const pecas = (capsuleData?.pecas_capsula || {}) as Record<string, unknown>;
  const topsCount = Array.isArray(pecas.tops) ? pecas.tops.length : 0;
  const bottomsCount = Array.isArray(pecas.bottoms) ? pecas.bottoms.length : 0;
  const tercasCount = Array.isArray(pecas.tercas_pecas) ? pecas.tercas_pecas.length : 0;
  const calculatedCombinations = topsCount * Math.max(bottomsCount, 1) * Math.max(tercasCount, 1);

  const sectionButtons: Array<{ id: SectionId; label: string; shortLabel: string; icon: React.ElementType; enabled: boolean }> = [
    // Modelo editorial fixo: todos os diagnósticos concluídos têm exatamente
    // os mesmos capítulos. O conteúdo pode variar, mas a navegação nunca muda.
    { id: 'essencia',           label: 'Essência',        shortLabel: 'Essência', icon: SparklesIcon,  enabled: false },
    { id: 'perfil',             label: 'Perfil Mestre',   shortLabel: 'Perfil',   icon: UserCircle2,   enabled: true },
    { id: 'arquetipos',         label: 'Arquétipos',      shortLabel: 'Arquét.',  icon: SparklesIcon,  enabled: false },
    { id: 'percepcao',          label: 'Percepção',       shortLabel: 'Percep.',  icon: Eye,           enabled: true },
    { id: 'estilo',             label: 'Estilo Único',    shortLabel: 'Estilo',   icon: Shirt,         enabled: true },
    { id: 'estrategia',         label: 'Estratégia',      shortLabel: 'Estrat.',  icon: Target,        enabled: true },
    { id: 'dna',                label: 'DNA Visual',      shortLabel: 'DNA',      icon: Layers,        enabled: true },
    { id: 'paleta',             label: 'Paleta',          shortLabel: 'Paleta',   icon: PaletteIcon,   enabled: false },
    { id: 'coloracao_avancada', label: 'Coloração Aplicada', shortLabel: 'Cor Apl.', icon: PaletteIcon, enabled: false },
    { id: 'silhueta',           label: 'Silhueta',        shortLabel: 'Silhueta', icon: Ruler,         enabled: false },
    { id: 'tecidos_materiais',  label: 'Tecidos',         shortLabel: 'Tecidos',  icon: Layers,        enabled: false },
    { id: 'acessorios',         label: 'Acessórios',      shortLabel: 'Acess.',   icon: ShoppingBag,   enabled: false },
    { id: 'beleza',             label: 'Beleza',          shortLabel: 'Beleza',   icon: SparklesIcon,  enabled: false },
    { id: 'pecas',              label: 'Peças-Chave',     shortLabel: 'Peças',    icon: ShoppingBag,   enabled: true },
    { id: 'apostar',            label: 'Apostar',         shortLabel: 'Apostar',  icon: ThumbsUp,      enabled: true },
    { id: 'evitar',             label: 'Evitar',          shortLabel: 'Evitar',   icon: Ban,           enabled: true },
    { id: 'capsula',            label: 'Cápsula',         shortLabel: 'Cápsula',  icon: LayoutGrid,    enabled: true },
    { id: 'ocasioes',           label: 'Ocasiões',        shortLabel: 'Ocasiões', icon: CalendarClock, enabled: false },
    { id: 'digital',            label: 'Digital',         shortLabel: 'Digital',  icon: Eye,           enabled: false },
    { id: 'viagens',            label: 'Viagens',         shortLabel: 'Viagens',  icon: LayoutGrid,    enabled: false },
    { id: 'sazonalidade',       label: 'Sazonalidade',    shortLabel: 'Estações', icon: CalendarClock, enabled: false },
    // Capítulo "Investimento e Prioridades" removido — aparecia apenas em alguns diagnósticos
    // e gerava inconsistência entre dossiês. Mantido no meta apenas para compatibilidade histórica.
    { id: 'investimento',       label: 'Investimento',    shortLabel: 'Investir', icon: Target,        enabled: false },
    { id: 'evolucao',           label: 'Evolução',        shortLabel: 'Evol.',    icon: CalendarClock, enabled: true },
    { id: 'inspiracoes',        label: 'Inspirações',     shortLabel: 'Inspirar', icon: SparklesIcon,  enabled: true },
    { id: 'encerramento',       label: 'Carta Final',     shortLabel: 'Carta',    icon: SparklesIcon,  enabled: false },
    { id: 'ritual',             label: 'Ritual Diário',   shortLabel: 'Ritual',   icon: CalendarClock, enabled: true },
  ];

  // Web e PDF compartilham os mesmos capítulos e as mesmas fotografias.
  const availableSections = sectionButtons.filter(section => section.enabled);



  const fd = (diagnosis.final_diagnosis as Record<string, unknown> | null);
  const storedMasterProfile = (fd?.master_profile as Record<string, unknown> | undefined) ?? null;
  const masterProfileForDisplay = storedMasterProfile || buildClientMasterProfile(diagnosis, fd);

  const renderSection = (sectionId: SectionId) => {
    switch (sectionId) {
      case 'perfil':
        return <MasterProfileOverview masterProfile={masterProfileForDisplay} embedded />;
      case 'estilo': {
        const internalScores = ((diagnosis.style_analysis as Record<string, unknown> | null)?._score_interno as Record<string, unknown> | undefined)?.pontuacoes as Record<string, unknown> | undefined;
        const calculatedWeighted = internalScores
          ? Object.entries(internalScores).map(([nome, peso]) => ({ nome, peso: Number(peso) || 0 }))
          : [];
        const weighted = calculatedWeighted.length
          ? calculatedWeighted
          : fd?.estilos_com_peso as Array<{ nome?: string; peso?: number; palavra_chave?: string; elementos?: string[] }> | undefined;
        return isValid(diagnosis.style_analysis)
          ? <StyleSection data={diagnosis.style_analysis!} colorSeason={colorSeason} weightedStyles={weighted} />
          : <AnalysisSection data={diagnosis.style_analysis} label="Estilo" />;
      }
      case 'percepcao':
        return isValid(fd) ? <PerceptionSection data={fd} questionnaire={diagnosis.questionnaire as Record<string, unknown> | null} /> : <AnalysisSection data={fd} label="Percepção" />;
      case 'estrategia':
        return isValid(fd) ? <StrategySection data={fd} questionnaire={diagnosis.questionnaire as Record<string, unknown> | null} /> : <AnalysisSection data={fd} label="Estratégia" />;
      case 'dna':
        return isValid(fd) ? <DnaVisualSection data={fd} questionnaire={diagnosis.questionnaire as Record<string, unknown> | null} /> : <AnalysisSection data={fd} label="DNA Visual" />;
      case 'paleta':
        return isValid(diagnosis.color_analysis)
          ? <StrategicPaletteSection finalDiagnosis={fd} colorAnalysis={diagnosis.color_analysis!} />
          : <AnalysisSection data={diagnosis.color_analysis} label="Paleta" />;
      case 'silhueta':
        return isValid(diagnosis.body_analysis)
          ? <SilhouetteGuideSection
              finalDiagnosis={fd}
              bodyAnalysis={diagnosis.body_analysis!}
              modelingAnalysis={isValid(diagnosis.modeling_analysis) ? diagnosis.modeling_analysis : null}
              questionnaire={diagnosis.questionnaire as Record<string, unknown> | null}
              body={{
                heightCm: diagnosis.height_cm, weightKg: diagnosis.weight_kg,
                topSize: diagnosis.top_size, bottomSize: diagnosis.bottom_size, shoeSize: diagnosis.shoe_size,
                hairColor: diagnosis.hair_color, eyeColor: diagnosis.eye_color, skinTone: diagnosis.skin_tone,
                bodyNotes: diagnosis.body_notes,
              }}
            />
          : <AnalysisSection data={diagnosis.body_analysis} label="Silhueta" />;
      case 'pecas':
        return isValid(diagnosis.wardrobe_essentials)
          ? <KeyPiecesSection
              finalDiagnosis={fd}
              wardrobeEssentials={diagnosis.wardrobe_essentials!}
              diagnosisId={diagnosis.id}
              imagesMap={imagesMap}
              imagesLoading={imagesLoading}
              questionnaire={diagnosis.questionnaire as Record<string, unknown> | null}
              colorAnalysis={diagnosis.color_analysis as Record<string, unknown> | null}
            />
          : <AnalysisSection data={diagnosis.wardrobe_essentials} label="Peças-Chave" />;
      case 'apostar':
        return isValid(fd) ? <BetOnSection data={fd} questionnaire={diagnosis.questionnaire as Record<string, unknown> | null} /> : <AnalysisSection data={fd} label="Apostar" />;
      case 'evitar':
        return isValid(fd) ? <AvoidSection data={fd} questionnaire={diagnosis.questionnaire as Record<string, unknown> | null} /> : <AnalysisSection data={fd} label="Evitar" />;
      case 'capsula':
        return isValid(diagnosis.capsule_wardrobe)
          ? <CapsuleSection data={diagnosis.capsule_wardrobe!} combinations={calculatedCombinations} diagnosisId={diagnosis.id} imagesMap={imagesMap} imagesLoading={imagesLoading} lookImagesMap={lookImagesMap} lookImagesLoading={lookImagesLoading} questionnaire={diagnosis.questionnaire as Record<string, unknown> | null} colorAnalysis={diagnosis.color_analysis as Record<string, unknown> | null} />
          : <AnalysisSection data={diagnosis.capsule_wardrobe} label="Cápsula" />;
      case 'evolucao':
        return isValid(fd) ? <EvolutionPlanSection data={fd} /> : <AnalysisSection data={fd} label="Evolução" />;
      case 'inspiracoes':
        return <>
          <StructuredMoodboards moodboards={(fd?.moodboards as React.ComponentProps<typeof StructuredMoodboards>['moodboards']) ?? null} />
          <InspirationsSection
            style={estiloPredominante}
            colorSeason={estacaoCor}
            perContext={(fd?.inspiracoes_por_contexto as React.ComponentProps<typeof InspirationsSection>['perContext']) ?? null}
          />
        </>;

      case 'ritual':
        return <RitualSection data={fd} />;
      default:
        return null;
    }
  };

  const sectionImagesMap = diagnosis.generated_images
    ? { ...(diagnosis.generated_images as Record<string, string>) }
    : null;

  // Build DiagnosticData for the new image prompt builders
  const q = (diagnosis.questionnaire || {}) as Record<string, unknown>;
  const occ = Array.isArray((q as { occasions?: unknown }).occasions)
    ? ((q as { occasions: string[] }).occasions[0] ?? '')
    : (((q as { occasion?: string }).occasion) ?? '');
  const diagnostic: DiagnosticData = {
    userId: diagnosis.id,
    imageFingerprint: buildDiagnosisImageFingerprint(diagnosis),
    estiloDeVida: ((q as { lifestyle?: string }).lifestyle) || '',
    profissao: ((q as { profession?: string }).profession) || '',
    ocasiao: normalizeOcasiao(occ),
    orcamento: normalizeOrcamento((q as { budget?: string; orcamentoMensal?: string }).budget || (q as { orcamentoMensal?: string }).orcamentoMensal),
    clima: normalizeClima((q as { climate?: string }).climate),
    altura: diagnosis.height_cm || 165,
    peso: diagnosis.weight_kg || 60,
    tamanhoSuperior: diagnosis.top_size || 'M',
    tamanhoInferior: diagnosis.bottom_size || '38',
    tipoCorporal: normalizeTipoCorporal(bodyType),
    caimento: normalizeCaimento(diagnosis.fit_preference),
    formalidade: normalizeFormalidade(diagnosis.formality_level),
    observacoesCorpo: diagnosis.body_notes || undefined,
    corCabelo: (diagnosis.hair_color || '').replace(/_/g, ' '),
    corOlhos: (diagnosis.eye_color || '').replace(/_/g, ' '),
    tomDePele: normalizeTomDePele(diagnosis.skin_tone),
    estiloPersonalidade: normalizeEstilo(estiloPredominante),
    objetivos: String((q as { goals?: unknown; objetivosImagem?: unknown }).goals || getStringArray((q as { objetivosImagem?: unknown }).objetivosImagem)?.join(', ') || ''),
    desafios: String((q as { challenges?: unknown; dores?: unknown }).challenges || getStringArray((q as { dores?: unknown }).dores)?.join(', ') || ''),
    restricoes: getStringArray((q as { restricoes?: unknown; restrictions?: unknown }).restricoes || (q as { restrictions?: unknown }).restrictions),
    tecidosEvitar: getStringArray((q as { tecidosEvitar?: unknown }).tecidosEvitar),
    elementosEvitar: getStringArray((q as { elementosEvitar?: unknown }).elementosEvitar),
    decotesEvitar: getStringArray((q as { decotesEvitar?: unknown }).decotesEvitar),
    coresEvitar: getStringArray((q as { coresEvitar?: unknown }).coresEvitar),
    estampasEvitar: getStringArray((q as { estampasEvitar?: unknown }).estampasEvitar),
  };

  const finalDiagnosisRaw = diagnosis.final_diagnosis as Record<string, unknown> | null;
  const restrictions = extractRestrictions(diagnostic, finalDiagnosisRaw);
  const imageQueryHints = collectDiagnosisImageHints(diagnosis);

  return (
    <SectionImagesProvider value={{ imagesMap: sectionImagesMap, diagnostic, diagnosisId: diagnosis.id, finalDiagnosis: finalDiagnosisRaw, restrictions, imageQueryHints, isPdfMode, frozen: diagnosis.status === 'completed', sectionImagesSnapshot: pdfSnapshot?.sectionImages ?? null, refreshImages: refreshPieceImages, questionnaire: q as Record<string, unknown>, colorAnalysis: diagnosis.color_analysis, modelingAnalysis: diagnosis.modeling_analysis, styleAnalysis: diagnosis.style_analysis }}>


    <PageTransition>
      <Layout showFooter={false}>
        <div className="min-h-screen bg-background text-foreground">
          {/* ── Sticky Header ── */}
          <div className="sticky top-16 z-30 border-b border-border/30 backdrop-blur-xl bg-background/80">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
              <button onClick={() => navigate('/account')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-300 group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="hidden sm:inline font-sans text-xs tracking-wide">Voltar</span>
              </button>

              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                <span className="hidden md:inline font-sans">
                  {new Date(diagnosis.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>

              <div className="flex gap-1.5">
                {/*
                  Botão "Regenerar (Admin)" removido intencionalmente.
                  Uma vez concluído o diagnóstico, as imagens e capítulos ficam
                  imutáveis para garantir paridade absoluta entre Web e PDF.
                */}
                {canShare ? (
                  <>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-primary h-8" onClick={handleShareWhatsApp} disabled={sharing}>
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">WhatsApp</span>
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground/60 hover:text-primary h-8" onClick={() => { toast.info('Compartilhamento disponível no plano Elite.', { action: { label: 'Ver planos', onClick: () => navigate('/pricing') } }); }}>
                    <Lock className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Compartilhar</span>
                  </Button>
                )}
                {canPdf ? (
                  <Button
                    size="sm"
                    variant="premium"
                    className="gap-1.5 text-xs h-8"
                    aria-label={pdfGenerating ? 'Gerando PDF' : 'Baixar PDF'}
                    onClick={() => {
                      if (pdfGateOverride && !pieceImagesReady) {
                        toast.warning('Algumas imagens ainda estavam processando — o PDF pode ficar incompleto.');
                      }
                      handleDownloadPDF();
                    }}
                    disabled={pdfGenerating || !pdfReady}
                    title={!pdfReady ? 'Aguardando o motor terminar de salvar as imagens…' : undefined}
                  >
                    {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span className="hidden md:inline">
                      {pdfGenerating ? (pdfProgress || 'Gerando PDF…') : (!pdfReady ? 'Preparando…' : 'PDF')}
                    </span>
                  </Button>
                ) : (
                  <Button size="sm" variant="premium" className="gap-1.5 text-xs h-8 opacity-80" onClick={() => { toast.info('Download em PDF disponível nos planos Premium e Elite.', { action: { label: 'Fazer upgrade', onClick: () => navigate('/pricing') } }); }}>
                    <Lock className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">PDF</span>
                  </Button>
                )}
              </div>

            </div>
          </div>

          {/* ── Status do dossiê longo ── */}
          {(() => {
            const dossierStatus = (fd?.dossier_status as string | undefined);
            const progress = (fd?.dossier_progress as { total?: number; completed?: number; enriched?: number } | undefined);
            const chapters = (fd?.chapters as Record<string, any> | undefined) || {};
            const chapterKeys = Object.keys(chapters);
            const total = progress?.total ?? 25;
            const enriched = progress?.enriched ?? chapterKeys.filter((k) => chapters[k] && !chapters[k]._seed).length;
            const seedsReady = chapterKeys.length;

            if (dossierStatus === 'error' && seedsReady === 0) {
              return (
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    A composição do dossiê foi interrompida. Gere um novo diagnóstico para tentar novamente.
                  </div>
                </div>
              );
            }

            void enriched; void seedsReady;
            return null;
          })()}

          <div id="diagnosis-dossier" data-dossier data-pdf-root data-diagnosis-id={diagnosis.id}>
            {/* ── Editorial Dossier (single scroll, TOC-driven) ── */}
            {(() => {
            const chapterMeta = CHAPTER_META_MAP;
            const meta: DossierChapterMeta[] = availableSections.map((s) => ({
              id: s.id,
              number: chapterMeta[s.id].number,
              label: chapterMeta[s.id].label,
              title: chapterMeta[s.id].title,
              eyebrow: chapterMeta[s.id].eyebrow,
            }));
            const mp = masterProfileForDisplay;
            const essenceLine =
              (typeof mp.essencia === 'string' && mp.essencia) ||
              (typeof mp.assinatura === 'string' && mp.assinatura) ||
              (typeof mp.frase_guia === 'string' && mp.frase_guia) ||
              '';
            return (
              <>
                <DossierCover
                  createdAt={diagnosis.created_at}
                  essenceLine={essenceLine || undefined}
                  chapters={meta}
                />
              <DossierLayout chapters={meta}>
                {availableSections.map((s) => (
                  <Chapter
                    key={s.id}
                    id={s.id}
                    number={chapterMeta[s.id].number}
                    eyebrow={chapterMeta[s.id].eyebrow}
                    title={chapterMeta[s.id].title}
                    subtitle={chapterMeta[s.id].subtitle}
                  >
                    {(() => {
                      const chapters = (fd?.chapters as Record<string, unknown> | undefined);
                      const chapterKeyMap: Record<string, string> = {
                        perfil: 'identidade', percepcao: 'diagnostico', estilo: 'assinatura',
                        estrategia: 'estrategia', dna: 'dna_visual', paleta: 'coloracao',
                        silhueta: 'silhueta', pecas: 'guarda_roupa', apostar: 'apostar',
                        evitar: 'evitar', capsula: 'capsula', evolucao: 'evolucao',
                        inspiracoes: 'inspiracoes',
                      };
                      const chap = chapters?.[chapterKeyMap[s.id]] as { intro?: string; body?: string; closing?: string } | undefined;
                      const hasNarrative = !!(chap && (chap.intro || chap.body || chap.closing));
                      const structuralSections = new Set(['perfil', 'paleta', 'silhueta', 'pecas', 'capsula', 'inspiracoes']);
                      const keepStructural = structuralSections.has(s.id);
                      return (
                        <>
                          <ChapterNarrative finalDiagnosis={fd} sectionId={s.id} />
                          {keepStructural && <ChapterMoodboard sectionId={s.id} />}
                          {(!hasNarrative || keepStructural) && (
                            <div className={hasNarrative ? "mt-16 lg:mt-20 pt-10 border-t border-primary/10" : ""}>
                              {renderSection(s.id)}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </Chapter>
                ))}
              </DossierLayout>
               </>
            );
          })()}
          </div>

          {/* ── Footer branding ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-12 pt-8 pb-16 border-t border-border/10 max-w-[1400px] mx-auto px-4"
          >
            <p className="text-primary/40 font-serif text-sm tracking-widest">EST ELITE</p>
            <p className="text-muted-foreground/30 text-xs mt-1">Diagnóstico de estilo com inteligência artificial</p>
          </motion.div>
        </div>

        {pdfError && (
          <div
            className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPdfError(null)}
          >
            <div
              className="max-w-3xl w-full max-h-[85vh] overflow-auto rounded-lg bg-white p-6 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-red-600 mb-3">Erro na exportação do PDF</h2>
              <pre className="whitespace-pre-wrap break-words text-xs text-gray-800 font-mono">
                {pdfError}
              </pre>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="px-4 py-2 rounded bg-gray-200 text-gray-800"
                  onClick={() => {
                    navigator.clipboard?.writeText(pdfError);
                  }}
                >
                  Copiar
                </button>
                <button
                  className="px-4 py-2 rounded bg-black text-white"
                  onClick={() => setPdfError(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>

    </PageTransition>
    </SectionImagesProvider>
  );
}

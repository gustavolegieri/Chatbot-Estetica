import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_SELECTOR =
  '[data-pdf-page-block], [data-pdf-cover-page], [data-pdf-index], [data-pdf-prologue], [data-pdf-chapter]';

const nextFrame = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

async function scrollThrough(root: HTMLElement): Promise<void> {
  const previousY = window.scrollY;
  const rootTop = root.getBoundingClientRect().top + window.scrollY;
  const rootBottom = rootTop + root.scrollHeight;

  for (let y = Math.max(0, rootTop); y <= rootBottom; y += 700) {
    window.scrollTo(0, y);
    await new Promise((resolve) => window.setTimeout(resolve, 70));
  }

  window.scrollTo(0, previousY);
  await nextFrame();
}

function getLogicalPageBlocks(root: HTMLElement): HTMLElement[] {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
  const topLevelBlocks = blocks.filter((block) => !block.parentElement?.closest(PAGE_SELECTOR));
  return topLevelBlocks.length > 0 ? topLevelBlocks : [root];
}

function visiblePendingImageSlots(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    '[data-image-source="awaiting-verified-real-photo"]',
  )).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function visibleImages(root: HTMLElement): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>('img')).filter((image) => {
    const style = window.getComputedStyle(image);
    const rect = image.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0
      && image.getClientRects().length > 0
      && rect.width > 1
      && rect.height > 1;
  });
}

const UNSUPPORTED_PDF_COLOR = /\b(?:color|color-mix|oklch|oklab|lab|lch)\(/i;

function sanitizePdfCloneColors(clonedDocument: Document): void {
  const view = clonedDocument.defaultView;
  if (!view) return;

  const safeProperties: Array<[string, string]> = [
    ['color', '#f4f0e8'],
    ['background-color', '#0a0a0a'],
    ['background-image', 'none'],
    ['border-top-color', 'rgba(201, 154, 67, 0.35)'],
    ['border-right-color', 'rgba(201, 154, 67, 0.35)'],
    ['border-bottom-color', 'rgba(201, 154, 67, 0.35)'],
    ['border-left-color', 'rgba(201, 154, 67, 0.35)'],
    ['outline-color', 'rgba(201, 154, 67, 0.45)'],
    ['text-decoration-color', 'currentColor'],
    ['box-shadow', 'none'],
    ['text-shadow', 'none'],
  ];

  clonedDocument.querySelectorAll<HTMLElement>('#diagnosis-dossier, #diagnosis-dossier *')
    .forEach((element) => {
      const computed = view.getComputedStyle(element);
      safeProperties.forEach(([property, fallback]) => {
        const computedValue = computed.getPropertyValue(property);
        const inlineValue = element.style.getPropertyValue(property);
        if (UNSUPPORTED_PDF_COLOR.test(computedValue) || UNSUPPORTED_PDF_COLOR.test(inlineValue)) {
          element.style.setProperty(property, fallback, 'important');
        }
      });
    });
}

async function waitForVisualAssets(
  root: HTMLElement,
  timeoutMs: number,
  onProgress?: (message: string) => void,
): Promise<void> {
  const startedAt = Date.now();
  let lastPending = -1;

  while (Date.now() - startedAt < timeoutMs) {
    const pendingSlots = visiblePendingImageSlots(root);
    const images = visibleImages(root);

    images.forEach((image) => {
      image.loading = 'eager';
      image.decoding = 'sync';
      image.setAttribute('fetchpriority', 'high');
    });

    const loadingImages = images.filter((image) => !image.complete);
    const brokenImages = images.filter((image) => image.complete && image.naturalWidth === 0);

    if (pendingSlots.length !== lastPending) {
      lastPending = pendingSlots.length;
      if (pendingSlots.length > 0) {
        onProgress?.(`Aguardando ${pendingSlots.length} fotografia${pendingSlots.length === 1 ? '' : 's'}…`);
      }
    }

    if (pendingSlots.length === 0 && loadingImages.length === 0 && brokenImages.length === 0) {
      await Promise.all(images.map(async (image) => {
        if (typeof image.decode !== 'function' || image.naturalWidth === 0) return;
        try {
          await image.decode();
        } catch {
          // A imagem já está carregada; decode() pode falhar em alguns WebViews.
        }
      }));
      await nextFrame();
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }

  const pending = visiblePendingImageSlots(root).length;
  const broken = visibleImages(root)
    .filter((image) => image.complete && image.naturalWidth === 0).length;
  throw new Error(
    `As fotografias do dossiê não terminaram de carregar (${pending} pendente${pending === 1 ? '' : 's'}, ${broken} inválida${broken === 1 ? '' : 's'}). Tente novamente em instantes.`,
  );
}

interface BlockBreakData {
  candidates: number[];
  protectedRanges: Array<{ top: number; bottom: number }>;
}

function collectBlockBreakData(block: HTMLElement): BlockBreakData {
  const blockRect = block.getBoundingClientRect();
  const candidates = new Set<number>();

  block.querySelectorAll<HTMLElement>(
    'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,article,figure,table,[data-pdf-break-after]',
  ).forEach((element) => {
    Array.from(element.getClientRects()).forEach((rect) => {
      const bottom = rect.bottom - blockRect.top;
      if (bottom > 0 && bottom < blockRect.height) candidates.add(bottom);
    });
  });

  const protectedRanges = Array.from(block.querySelectorAll<HTMLElement>(
    'img,figure,table,[data-pdf-keep-together],[data-image-source]',
  )).flatMap((element) => Array.from(element.getClientRects()).map((rect) => ({
    top: Math.max(0, rect.top - blockRect.top),
    bottom: Math.min(blockRect.height, rect.bottom - blockRect.top),
  }))).filter((range) => range.bottom - range.top > 12);

  return {
    candidates: Array.from(candidates).sort((a, b) => a - b),
    protectedRanges,
  };
}

function resolveSafeBreak(
  cursor: number,
  idealEnd: number,
  canvasHeight: number,
  pageHeightPx: number,
  data: BlockBreakData,
  cssToCanvasScale: number,
): number {
  if (canvasHeight - cursor <= pageHeightPx) return canvasHeight;

  const minimumEnd = cursor + pageHeightPx * 0.62;
  const candidates = data.candidates
    .map((value) => Math.round(value * cssToCanvasScale))
    .filter((value) => value >= minimumEnd && value <= idealEnd - 4);

  let chosen = candidates.length > 0 ? candidates[candidates.length - 1] : idealEnd;
  const protectedRanges = data.protectedRanges.map((range) => ({
    top: Math.round(range.top * cssToCanvasScale),
    bottom: Math.round(range.bottom * cssToCanvasScale),
  }));

  const crossing = protectedRanges
    .filter((range) => range.top < chosen && range.bottom > chosen)
    .sort((a, b) => b.top - a.top)[0];

  if (crossing) {
    if (crossing.top >= minimumEnd) chosen = crossing.top;
    else if (crossing.bottom <= idealEnd) chosen = crossing.bottom;
  }

  return Math.max(cursor + 1, Math.min(chosen, canvasHeight));
}

function canvasHasVisibleContent(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = 120;
  probe.height = 170;
  const context = probe.getContext('2d');
  if (!context) return false;

  context.drawImage(canvas, 0, 0, probe.width, probe.height);
  const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
  let visiblePixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > 36 || pixels[index + 1] > 36 || pixels[index + 2] > 36) {
      visiblePixels += 1;
      if (visiblePixels >= 12) return true;
    }
  }
  return false;
}

function downloadPdfBlob(pdf: jsPDF, filename: string): void {
  const blob = pdf.output('blob');
  const pdfWindow = window as Window & { __ESTELITE_LAST_PDF_BLOB__?: Blob };
  pdfWindow.__ESTELITE_LAST_PDF_BLOB__ = blob;
  const url = URL.createObjectURL(blob);
  document.getElementById('estelite-pdf-download-link')?.remove();
  const anchor = document.createElement('a');
  anchor.id = 'estelite-pdf-download-link';
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.dataset.pdfSize = String(blob.size);
  anchor.dataset.pdfPages = String(pdf.getNumberOfPages());
  let debugContainer: HTMLDivElement | null = null;
  const auditOnly = new URLSearchParams(window.location.search).get('pdfAudit') === '1';
  if (import.meta.env.DEV || auditOnly) {
    // Disponível apenas no servidor local para a auditoria automatizada do PDF.
    document.getElementById('estelite-pdf-debug-chunks')?.remove();
    const debugUri = pdf.output('datauristring');
    const debugChunkSize = 192_000;
    debugContainer = document.createElement('div');
    debugContainer.id = 'estelite-pdf-debug-chunks';
    debugContainer.style.display = 'none';
    for (let start = 0, index = 0; start < debugUri.length; start += debugChunkSize, index += 1) {
      const chunk = document.createElement('span');
      chunk.dataset.pdfChunk = String(index);
      chunk.textContent = debugUri.slice(start, start + debugChunkSize);
      debugContainer.appendChild(chunk);
    }
    anchor.dataset.pdfDebugChunks = String(debugContainer.childElementCount);
  }
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  if (debugContainer) document.body.appendChild(debugContainer);
  if (!auditOnly) anchor.click();
  // Mantém o link por alguns minutos: além do clique automático, o navegador
  // pode repetir o download sem remontar o dossiê caso tenha bloqueado o primeiro.
  window.setTimeout(() => {
    anchor.remove();
    debugContainer?.remove();
    URL.revokeObjectURL(url);
    if (pdfWindow.__ESTELITE_LAST_PDF_BLOB__ === blob) {
      delete pdfWindow.__ESTELITE_LAST_PDF_BLOB__;
    }
  }, 5 * 60_000);
}

export interface WebPerfectPdfOptions {
  filename: string;
  onProgress?: (message: string) => void;
}

/**
 * Exporta o mesmo dossiê e as mesmas fotografias que já estão renderizados na
 * tela. Cada capítulo é capturado isoladamente para limitar memória e impedir
 * PDFs vazios/travados em diagnósticos longos.
 */
export async function exportWebPerfectPdf(
  root: HTMLElement,
  { filename, onProgress }: WebPerfectPdfOptions,
): Promise<void> {
  const previousY = window.scrollY;

  try {
    onProgress?.('Preparando dossiê…');
    await scrollThrough(root);

    onProgress?.('Conferindo fotografias…');
    await waitForVisualAssets(root, 125_000, onProgress);

    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Fontes já disponíveis no navegador continuam sendo usadas.
      }
    }

    const blocks = getLogicalPageBlocks(root);
    if (blocks.length === 0) throw new Error('Nenhuma página do dossiê foi encontrada.');

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: true,
    });
    pdf.setProperties({
      title: 'EST ELITE — Dossiê de Estilo',
      creator: 'EST ELITE',
      subject: 'Diagnóstico de imagem pessoal',
    });

    let addedPages = 0;
    // 1.5–1.75x mantém texto nítido em A4 e evita bloquear o navegador por
    // vários minutos em dossiês longos com muitas fotografias.
    const scale = Math.max(1.5, Math.min(1.75, (window.devicePixelRatio || 1) * 1.5));

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex];
      const isFullBleed = block.hasAttribute('data-pdf-cover-page') || block.hasAttribute('data-pdf-index');
      const horizontalMarginMm = isFullBleed ? 0 : 10;
      const verticalMarginMm = isFullBleed ? 0 : 10;
      const contentWidthMm = A4_WIDTH_MM - horizontalMarginMm * 2;
      const contentHeightMm = A4_HEIGHT_MM - verticalMarginMm * 2;

      onProgress?.(`Capturando capítulo ${blockIndex + 1}/${blocks.length}…`);
      block.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
      await nextFrame();

      const breakData = collectBlockBreakData(block);
      const blockRect = block.getBoundingClientRect();
      const canvas = await html2canvas(block, {
        backgroundColor: '#0A0A0A',
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 30_000,
        windowWidth: Math.max(document.documentElement.clientWidth, Math.ceil(blockRect.width)),
        windowHeight: Math.max(720, window.innerHeight || document.documentElement.clientHeight || 900),
        onclone: (clonedDocument) => {
          const style = clonedDocument.createElement('style');
          style.textContent = [
            '* { animation: none !important; transition: none !important; caret-color: transparent !important; }',
            '[data-sonner-toaster], [data-radix-portal] { display: none !important; }',
            '#diagnosis-dossier .diagnosis-capsule-controls { display: none !important; }',
            '#diagnosis-dossier .diagnosis-capsule-grid { display: grid !important; grid-auto-flow: row !important; grid-auto-columns: unset !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; overflow: visible !important; }',
            '#diagnosis-dossier .diagnosis-capsule-card { min-width: 0 !important; }',
          ].join('\n');
          clonedDocument.head.appendChild(style);

          // html2canvas 1.x não interpreta color(), color-mix(), oklch() e
          // funções correlatas. Ajusta somente o clone usado pelo PDF.
          sanitizePdfCloneColors(clonedDocument);

          // Framer Motion grava o estado inicial diretamente em style="...".
          // No clone, torna esses elementos visíveis sem remover transforms de
          // classes CSS (como o zoom das fotografias do guarda-roupa cápsula).
          clonedDocument.querySelectorAll<HTMLElement>('#diagnosis-dossier [style]').forEach((element) => {
            if (element.style.opacity) element.style.setProperty('opacity', '1', 'important');
            if (element.style.transform) element.style.setProperty('transform', 'none', 'important');
          });
        },
      });

      if (canvas.width < 10 || canvas.height < 10) {
        canvas.width = 0;
        canvas.height = 0;
        throw new Error(`Falha ao capturar o capítulo ${blockIndex + 1}.`);
      }
      if (!canvasHasVisibleContent(canvas)) {
        canvas.width = 0;
        canvas.height = 0;
        throw new Error(`O capítulo ${blockIndex + 1} foi capturado sem conteúdo. O PDF não foi baixado para evitar um arquivo em branco.`);
      }

      const cssToCanvasScale = canvas.height / Math.max(1, blockRect.height);
      const pageHeightPx = Math.max(1, Math.floor(contentHeightMm * canvas.width / contentWidthMm));
      let cursor = 0;

      while (cursor < canvas.height) {
        const idealEnd = Math.min(canvas.height, cursor + pageHeightPx);
        const end = resolveSafeBreak(
          cursor,
          idealEnd,
          canvas.height,
          pageHeightPx,
          breakData,
          cssToCanvasScale,
        );
        const sliceHeight = Math.max(1, end - cursor);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const context = slice.getContext('2d');
        if (!context) throw new Error('Canvas 2D indisponível para montar o PDF.');

        context.fillStyle = '#0A0A0A';
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(
          canvas,
          0,
          cursor,
          canvas.width,
          sliceHeight,
          0,
          0,
          slice.width,
          slice.height,
        );

        let imageData: string;
        try {
          imageData = slice.toDataURL('image/jpeg', 0.92);
        } catch {
          slice.width = 0;
          slice.height = 0;
          throw new Error('Uma fotografia não permitiu a exportação segura do PDF. Recarregue o diagnóstico e tente novamente.');
        }

        if (addedPages > 0) pdf.addPage();
        pdf.setFillColor(10, 10, 10);
        pdf.rect(0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, 'F');

        const renderedHeightMm = sliceHeight * contentWidthMm / canvas.width;
        pdf.addImage(
          imageData,
          'JPEG',
          horizontalMarginMm,
          verticalMarginMm,
          contentWidthMm,
          Math.min(renderedHeightMm, contentHeightMm),
          undefined,
          'FAST',
        );

        addedPages += 1;
        cursor = end;
        slice.width = 0;
        slice.height = 0;
        onProgress?.(`Montando página ${addedPages}…`);
      }

      canvas.width = 0;
      canvas.height = 0;
    }

    if (addedPages === 0) throw new Error('O PDF ficou sem páginas.');

    onProgress?.('Salvando arquivo…');
    downloadPdfBlob(pdf, filename);
  } finally {
    window.scrollTo({ top: previousY, left: 0, behavior: 'auto' });
  }
}

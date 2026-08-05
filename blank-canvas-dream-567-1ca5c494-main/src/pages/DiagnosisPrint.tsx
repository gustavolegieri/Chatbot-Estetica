/**
 * DiagnosisPrint
 *
 * Renderiza o MESMO dossiê exibido em /diagnosis/:id, mas em "print-mode":
 * — sem navbar, footer, sidebar sticky, botões ou animações;
 * — com quebras de página por capítulo e imagens/cards protegidos;
 * — dispara window.print() após fontes e imagens carregarem.
 *
 * Não duplica conteúdo: reutiliza o componente DiagnosisResult inteiro.
 * O usuário escolhe "Salvar como PDF" no diálogo nativo do navegador.
 */
import { useEffect } from 'react';
import DiagnosisResult from './DiagnosisResult';

const PRINT_CSS = `
  html.print-mode,
  html.print-mode body {
    background: #0A0A0A !important;
    margin: 0 !important;
  }

  /* Esconder toda a chrome fora do dossiê */
  html.print-mode header,
  html.print-mode footer,
  html.print-mode nav,
  html.print-mode aside,
  html.print-mode [data-sonner-toaster],
  html.print-mode button:not([data-pdf-toc-item]) {
    display: none !important;
  }

  html.print-mode [data-pdf-index] button,
  html.print-mode [data-pdf-index] [data-pdf-toc-item] {
    display: flex !important;
    background: transparent !important;
    border: 0 !important;
    color: inherit !important;
    appearance: none !important;
    -webkit-appearance: none !important;
  }

  /* Neutralizar backdrop / animações sem destruir posicionamentos absolutos decorativos */
  html.print-mode * {
    animation: none !important;
    transition: none !important;
    transform: none !important;
    opacity: 1 !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  html.print-mode .sticky,
  html.print-mode [class*="sticky"],
  html.print-mode [class*="fixed"] {
    position: static !important;
  }

  html.print-mode [aria-hidden="true"] {
    display: none !important;
  }

  html.print-mode #diagnosis-dossier,
  html.print-mode .dossier-layout {
    width: 210mm !important;
    max-width: 210mm !important;
    margin: 0 auto !important;
    background: #0A0A0A !important;
    overflow: visible !important;
  }

  html.print-mode #diagnosis-dossier {
    width: 210mm !important;
    max-width: 210mm !important;
    min-height: 297mm !important;
    margin: 0 auto !important;
    padding: 0 !important;
  }

  /* Kill sidebar grid so chapters are direct siblings and break cleanly */
  html.print-mode .dossier-layout { display: block !important; padding: 0 !important; }
  html.print-mode .dossier-layout > div { display: block !important; grid-template-columns: none !important; gap: 0 !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  html.print-mode .dossier-layout > div > div { display: block !important; max-width: none !important; margin: 0 !important; }
  html.print-mode .dossier-layout .space-y-24 > * + *,
  html.print-mode .dossier-layout .space-y-32 > * + * { margin-top: 0 !important; }

  /* Center each printed page as an independent A4 block */
  html.print-mode [data-pdf-cover-page],
  html.print-mode [data-pdf-index],
  html.print-mode [data-pdf-prologue],
  html.print-mode [data-pdf-chapter] {
    display: block !important;
    position: relative !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    bottom: auto !important;
    float: none !important;
    clear: both !important;
    transform: none !important;
    margin: 0 auto !important;
    width: 210mm !important;
    max-width: 210mm !important;
    min-width: 210mm !important;
    min-height: 297mm !important;
    padding: 14mm 14mm !important;
    box-sizing: border-box !important;
    background: #0A0A0A !important;
    overflow: visible !important;
  }


  /* Quebra de página por capítulo, sem quebrar mídia/cards */
  html.print-mode [data-pdf-index],
  html.print-mode [data-pdf-prologue],
  html.print-mode [data-pdf-chapter] {
    break-before: page !important;
    page-break-before: always !important;
    break-inside: auto;
    page-break-inside: auto;
  }
  html.print-mode [data-pdf-cover-page] {
    break-before: auto;
    page-break-before: auto;
    min-height: 297mm !important;
    height: 297mm !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: space-between !important;
    align-items: stretch !important;
    text-align: center !important;
    padding: 14mm 14mm !important;
    box-sizing: border-box !important;
  }
  html.print-mode [data-pdf-section] {
    break-inside: auto;
    page-break-inside: auto;
  }

  html.print-mode img,
  html.print-mode figure {
    break-inside: avoid;
    page-break-inside: avoid;
    max-width: 100% !important;
    opacity: 1 !important;
    visibility: visible !important;
  }

  html.print-mode [class*="columns-"] {
    column-count: 1 !important;
    column-gap: 0 !important;
  }

  html.print-mode p,
  html.print-mode li,
  html.print-mode blockquote {
    orphans: 3;
    widows: 3;
    overflow-wrap: anywhere;
  }

  @media print {
    @page { size: A4; margin: 0; background: #0A0A0A; }
    html, body { background: #0A0A0A !important; zoom: 100%; margin: 0 !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
    header, footer, nav, aside, button:not([data-pdf-toc-item]), [data-sonner-toaster] { display: none !important; }
    [data-pdf-index] button, [data-pdf-index] [data-pdf-toc-item] { display: flex !important; background: transparent !important; border: 0 !important; color: inherit !important; appearance: none !important; -webkit-appearance: none !important; }
    #diagnosis-dossier { background: #0A0A0A !important; width: 210mm !important; min-height: 297mm !important; margin: 0 auto !important; padding: 0 !important; }
    .dossier-layout { display: block !important; padding: 0 !important; margin: 0 auto !important; width: 210mm !important; max-width: 210mm !important; overflow: visible !important; }
    .dossier-layout > div { display: block !important; grid-template-columns: none !important; gap: 0 !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
    .dossier-layout > div > div { display: block !important; max-width: none !important; margin: 0 !important; }
    .dossier-layout .space-y-24 > * + *, .dossier-layout .space-y-32 > * + * { margin-top: 0 !important; }
    [data-pdf-cover-page], [data-pdf-index], [data-pdf-prologue], [data-pdf-chapter] {
      margin: 0 auto !important;
      width: 210mm !important;
      max-width: 210mm !important;
      min-width: 210mm !important;
      min-height: 297mm !important;
      padding: 14mm 14mm !important;
      box-sizing: border-box !important;
      background: #0A0A0A !important;
      overflow: visible !important;
    }
    img { max-width: 100% !important; page-break-inside: avoid; break-inside: avoid; opacity: 1 !important; visibility: visible !important; }
    [data-pdf-index], [data-pdf-prologue], [data-pdf-chapter] { break-before: page; page-break-before: always; break-inside: auto; page-break-inside: auto; }
    [data-pdf-cover-page] { break-before: auto; page-break-before: auto; min-height: 297mm !important; height: 297mm !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; align-items: stretch !important; text-align: center !important; }
    [data-pdf-section] { break-inside: auto; page-break-inside: auto; }
    [class*="columns-"] { column-count: 1 !important; column-gap: 0 !important; }
  }
`;

async function waitForAllImages(root: ParentNode): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
        setTimeout(resolve, 8000);
      });
    }),
  );
}

export default function DiagnosisPrint() {
  useEffect(() => {
    document.documentElement.classList.add('print-mode');
    return () => {
      document.documentElement.classList.remove('print-mode');
    };
  }, []);

  useEffect(() => {
    // Quando Browserless renderiza a rota (?pdf=1), NÃO chamar window.print():
    // o headless Chromium travaria/500. Ele mesmo gera o PDF via page.pdf().
    const params = new URLSearchParams(window.location.search);
    if (params.get('pdf') === '1') return;

    let cancelled = false;
    let pollTimer: number | null = null;

    async function attemptPrint() {
      const start = Date.now();
      let dossier: HTMLElement | null = null;
      while (Date.now() - start < 30000) {
        dossier = document.getElementById('diagnosis-dossier');
        if (dossier) break;
        await new Promise((r) => (pollTimer = window.setTimeout(r, 300) as unknown as number));
        if (cancelled) return;
      }
      if (!dossier || cancelled) return;

      if (document.fonts?.ready) {
        try { await document.fonts.ready; } catch { /* ignore */ }
      }
      await waitForAllImages(dossier);
      if (cancelled) return;

      await new Promise((r) => window.setTimeout(r, 500));
      if (cancelled) return;

      window.print();
    }

    attemptPrint();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 2147483647,
          background: '#111',
          color: '#fff',
          padding: '8px 14px',
          borderRadius: 4,
          fontFamily: 'sans-serif',
          fontSize: 13,
        }}
        className="no-print"
      >
        <button
          type="button"
          onClick={() => window.print()}
          style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
        >
          Imprimir / Salvar como PDF
        </button>
      </div>
      <DiagnosisResult />
    </>
  );
}

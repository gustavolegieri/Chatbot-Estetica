import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';


type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PWAInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = window.navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    const isMobile = window.matchMedia?.('(max-width: 767px)').matches;

    if (isStandalone || !isMobile) return;


    setIsIOS(iOS);

    if (iOS) {
      setVisible(true);
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    // Fallback: mostra banner mesmo sem BIP (Chrome dispara depois do engagement,
    // e no preview do Lovable o evento não vem).
    const fallback = setTimeout(() => setVisible(true), 800);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      clearTimeout(fallback);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
  };


  const install = async () => {
    if (isIOS) {
      setShowIOSHelp((v) => !v);
      return;
    }
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') dismiss();
      setDeferred(null);
    } else {
      setShowIOSHelp((v) => !v);
    }
  };

  if (!visible) return null;

  return (
    <div className="md:hidden">
      <div className="border-b border-primary/20 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">Instale o app EST ELITE</p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Adicione à tela inicial para acesso rápido.
            </p>
          </div>
          <Button size="sm" variant="premium" onClick={install} className="flex-shrink-0">
            Instalar
          </Button>
          <button
            aria-label="Fechar"
            onClick={dismiss}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {showIOSHelp && (
          <div className="container mx-auto px-4 pb-3">
            <div className="text-[12px] text-muted-foreground bg-background/60 border border-border/50 rounded-lg p-3 flex items-start gap-2">
              <Share className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span>
                No iPhone: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.
                No Android: abra o menu do navegador e toque em <b>Instalar app</b> / <b>Adicionar à tela inicial</b>.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

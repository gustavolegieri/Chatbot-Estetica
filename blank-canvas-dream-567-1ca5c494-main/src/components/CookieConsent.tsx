import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Cookie, X } from 'lucide-react';

const KEY = 'estelite_cookie_consent_v1';

interface Prefs {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (!stored) setOpen(true);
    } catch { setOpen(true); }
  }, []);

  const save = (p: Omit<Prefs, 'decidedAt' | 'necessary'>) => {
    const prefs: Prefs = { necessary: true, ...p, decidedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] p-3 sm:p-5 pointer-events-none">
      <div className="pointer-events-auto max-w-3xl mx-auto glass-card rounded-2xl border border-primary/20 shadow-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Cookie className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-serif text-lg text-foreground">Sua privacidade é prioridade</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Usamos cookies para autenticação, segurança e melhorar sua experiência. Leia nossa{' '}
              <Link to="/cookies" className="text-primary hover:underline">Política de Cookies</Link> e{' '}
              <Link to="/privacy" className="text-primary hover:underline">Política de Privacidade</Link>.
            </p>
          </div>
          <button onClick={() => save({ analytics: false, marketing: false })} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {config && (
          <div className="space-y-3 my-4 border-t border-border/40 pt-4">
            <Row label="Necessários" desc="Sessão, autenticação e segurança. Sempre ativos." checked disabled />
            <Row label="Analíticos" desc="Métricas anônimas de uso para melhorar o serviço." checked={analytics} onChange={setAnalytics} />
            <Row label="Marketing" desc="Personalização de ofertas e campanhas." checked={marketing} onChange={setMarketing} />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-1">
          <Button variant="ghost" onClick={() => setConfig(v => !v)} className="sm:mr-auto">
            {config ? 'Ocultar preferências' : 'Configurar preferências'}
          </Button>
          <Button variant="outline" onClick={() => save({ analytics: false, marketing: false })}>
            Recusar
          </Button>
          {config ? (
            <Button variant="premium" onClick={() => save({ analytics, marketing })}>
              Salvar preferências
            </Button>
          ) : (
            <Button variant="premium" onClick={() => save({ analytics: true, marketing: true })}>
              Aceitar todos
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, desc, checked, onChange, disabled }: { label: string; desc: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

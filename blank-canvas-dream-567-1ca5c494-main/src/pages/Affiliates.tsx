import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, MousePointerClick, Users, TrendingUp, DollarSign, Clock, CheckCircle2, Wallet, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardData {
  enrolled: boolean;
  code?: string;
  clicks?: number;
  signups?: number;
  conversions?: number;
  revenue_cents?: number;
  pending_cents?: number;
  approved_cents?: number;
  paid_cents?: number;
  commission_percent?: number;
  history?: Array<{ id: string; created_at: string; commission_cents: number; base_amount_cents: number; status: string; paid_at?: string | null }>;
}

const fmt = (cents = 0) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  approved: { label: 'Aprovada', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  paid: { label: 'Paga', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  rejected: { label: 'Rejeitada', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
};

export default function Affiliates() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  const [simulatorPriceCents, setSimulatorPriceCents] = useState<number>(19700);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('https://estelite.com.br');

  const load = async () => {
    setLoading(true);
    const [{ data: d, error }, { data: settingsRows }] = await Promise.all([
      supabase.rpc('get_my_affiliate_dashboard' as never),
      supabase.from('site_settings').select('key,value').in('key', ['affiliate_simulator_price_cents', 'site_public_url']),
    ]);
    if (error) console.error(error);
    const parse = (v: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v);
    for (const row of settingsRows ?? []) {
      const val = parse((row as any).value);
      if ((row as any).key === 'affiliate_simulator_price_cents') {
        const n = Number(val);
        if (!Number.isNaN(n) && n > 0) setSimulatorPriceCents(n);
      } else if ((row as any).key === 'site_public_url') {
        const url = String(val || '').trim().replace(/\/$/, '');
        if (url) setPublicBaseUrl(url);
      }
    }
    setData(d as DashboardData);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) { navigate('/auth'); return; }
    if (user) load();
  }, [user, authLoading]);

  const enroll = async () => {
    setEnrolling(true);
    const { error } = await supabase.rpc('enroll_as_affiliate' as never);
    if (error) toast.error('Não foi possível ativar seu programa');
    else { toast.success('Programa ativado! Seu link está pronto.'); await load(); }
    setEnrolling(false);
  };

  const link = useMemo(() => {
    if (!data?.code) return '';
    return `${publicBaseUrl}/ref/${data.code}`;
  }, [data?.code, publicBaseUrl]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    toast.success('Link copiado!');
  };

  const percent = data?.commission_percent ?? 20;
  const planPriceRef = simulatorPriceCents;
  const monthlyCommission = Math.floor(planPriceRef * percent / 100);

  if (loading || authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!data?.enrolled) {
    return (
      <Layout>
        <div className="min-h-screen py-12">
          <div className="container max-w-3xl mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-3xl p-8 md:p-12 text-center border border-primary/20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/15 mb-6">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h1 className="font-serif text-4xl md:text-5xl text-gradient-gold mb-4">Programa de Afiliadas</h1>
              <p className="text-muted-foreground mb-2 text-lg">Indique a EST ELITE e receba comissão recorrente</p>
              <p className="text-muted-foreground mb-8">Ganhe <span className="text-primary font-semibold">{percent}%</span> de comissão sobre cada assinatura ativa.</p>
              <Button variant="premium" size="lg" onClick={enroll} disabled={enrolling}>
                {enrolling ? 'Ativando...' : 'Ativar meu link de afiliada'}
              </Button>
            </motion.div>
          </div>
        </div>
      </Layout>
    );
  }

  const cards = [
    { icon: MousePointerClick, label: 'Cliques', value: data.clicks ?? 0 },
    { icon: Users, label: 'Cadastros', value: data.signups ?? 0 },
    { icon: TrendingUp, label: 'Conversões', value: data.conversions ?? 0 },
    { icon: DollarSign, label: 'Receita gerada', value: fmt(data.revenue_cents) },
    { icon: Clock, label: 'Pendente', value: fmt(data.pending_cents) },
    { icon: CheckCircle2, label: 'Aprovada', value: fmt(data.approved_cents) },
    { icon: Wallet, label: 'Paga', value: fmt(data.paid_cents) },
  ];

  return (
    <Layout>
      <div className="min-h-screen py-8 md:py-12">
        <div className="container max-w-6xl mx-auto px-4 space-y-8">
          <div className="text-center">
            <h1 className="font-serif text-4xl md:text-5xl text-gradient-gold mb-2">Painel de Afiliada</h1>
            <p className="text-muted-foreground">Comissão recorrente de <span className="text-primary font-semibold">{percent}%</span> sobre cada assinatura ativa.</p>
          </div>

          {/* Link */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-primary/20">
            <p className="text-sm text-muted-foreground mb-3">Seu link único de afiliada</p>
            <div className="flex flex-col md:flex-row gap-3">
              <Input readOnly value={link} className="font-mono text-sm md:text-base" />
              <Button variant="premium" onClick={copyLink} className="gap-2">
                <Copy className="w-4 h-4" /> Copiar link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Código: <span className="text-primary font-semibold">{data.code}</span></p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {cards.map((c, i) => (
              <motion.div key={c.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="glass-card rounded-2xl p-4 md:p-5 border border-border/40">
                <c.icon className="w-5 h-5 text-primary mb-2" />
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg md:text-xl font-semibold text-foreground mt-1">{c.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Simulator */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-border/40">
            <h2 className="font-serif text-2xl text-foreground mb-1">Simulador de Receita</h2>
            <p className="text-sm text-muted-foreground mb-6">Baseado em uma assinatura referência de {fmt(planPriceRef)} com {percent}% de comissão recorrente.</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[5, 10, 20, 50, 100].map(n => (
                <div key={n} className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                  <p className="text-xs text-muted-foreground">{n} clientes</p>
                  <p className="text-lg md:text-xl text-primary font-semibold mt-1">{fmt(monthlyCommission * n)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">por mês</p>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-border/40">
            <h2 className="font-serif text-2xl text-foreground mb-4">Histórico de Comissões</h2>
            {(!data.history || data.history.length === 0) ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Ainda sem comissões. Compartilhe seu link para começar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border/40">
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2 pr-3">Valor base</th>
                      <th className="py-2 pr-3">Comissão</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Pago em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map(h => (
                      <tr key={h.id} className="border-b border-border/20">
                        <td className="py-2 pr-3">{new Date(h.created_at).toLocaleDateString('pt-BR')}</td>
                        <td className="py-2 pr-3">{fmt(h.base_amount_cents)}</td>
                        <td className="py-2 pr-3 text-primary font-medium">{fmt(h.commission_cents)}</td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge[h.status]?.cls ?? ''}`}>{statusBadge[h.status]?.label ?? h.status}</span>
                        </td>
                        <td className="py-2">{h.paid_at ? new Date(h.paid_at).toLocaleDateString('pt-BR') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

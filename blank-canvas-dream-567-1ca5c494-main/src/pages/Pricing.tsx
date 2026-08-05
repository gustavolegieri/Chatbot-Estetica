import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { Check, Sparkles, Crown, Zap, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  interval: string;
  features: string[];
  is_popular: boolean;
}

interface AppliedCoupon {
  planId: string;
  code: string;
  discount_cents: number;
  final_cents: number;
}

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [couponInputs, setCouponInputs] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, AppliedCoupon>>({});

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from('plans').select('*').eq('is_active', true).order('sort_order');
      if (data) setPlans(data.map(p => ({ ...p, features: (p.features as string[]) || [] })));
      setLoadingPlans(false);
    };
    fetchData();
  }, []);

  const applyCoupon = async (plan: Plan) => {
    const code = (couponInputs[plan.id] || '').trim();
    if (!code) return;
    if (!user) { toast.error('Faça login para aplicar cupom'); return; }
    setValidating(plan.id);
    const { data, error } = await supabase.rpc('validate_coupon', {
      _code: code, _plan_id: plan.id, _user_id: user.id,
    });
    setValidating(null);
    if (error) { toast.error(error.message); return; }
    const v = data as any;
    if (!v?.valid) { toast.error(v?.error || 'Cupom inválido'); return; }
    setApplied(prev => ({ ...prev, [plan.id]: { planId: plan.id, code: v.code, discount_cents: v.discount_cents, final_cents: v.final_cents } }));
    toast.success(`Cupom aplicado: -${formatPrice(v.discount_cents)}`);
  };

  const removeCoupon = (planId: string) => {
    setApplied(prev => { const n = { ...prev }; delete n[planId]; return n; });
    setCouponInputs(prev => ({ ...prev, [planId]: '' }));
  };

  const handleSubscribe = async (plan: Plan) => {
    if (!user) {
      navigate('/auth?mode=signup');
      return;
    }
    setLoadingPlanId(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          plan_id: plan.id,
          coupon_code: applied[plan.id]?.code,
          success_url: `${window.location.origin}/payment-success`,
          failure_url: `${window.location.origin}/payment-failed`,
          pending_url: `${window.location.origin}/payment-success?status=pending`,
        },
      });
      if (error) throw error;
      if (data?.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error('URL de checkout não retornada pelo Mercado Pago');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar sessão de pagamento');
      setLoadingPlanId(null);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <Layout>
      <section className="py-12 sm:py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-dark" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

        <div className="container mx-auto relative z-10">
          <div className="text-center mb-10 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full mb-6">
              <Crown className="h-4 w-4 text-primary" />
              <span className="text-sm text-primary">Investimento em você</span>
            </div>
            <h1 className="font-serif text-gradient-gold mb-4">
              Escolha seu Plano
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              Invista em autoconhecimento e transforme sua imagem pessoal com nossa análise completa.
            </p>
          </div>

          {loadingPlans ? (
            <div className="text-center animate-pulse text-primary">Carregando planos...</div>
          ) : (
            <div className={`max-w-5xl mx-auto grid gap-6 sm:gap-8 ${plans.length === 1 ? 'max-w-lg' : plans.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {plans.map((plan) => {
                const app = applied[plan.id];
                const finalCents = app?.final_cents ?? plan.price_cents;
                return (
                  <div key={plan.id} className={`glass-card rounded-3xl p-6 sm:p-8 md:p-10 relative overflow-hidden ${plan.is_popular ? 'border-primary/30 glow-gold' : ''}`}>
                    {plan.is_popular && (
                      <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 rounded-bl-xl text-sm font-medium">
                        Mais Popular
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-serif text-2xl">{plan.name}</h3>
                        {plan.description && <p className="text-muted-foreground text-sm">{plan.description}</p>}
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        {app && (
                          <span className="text-lg text-muted-foreground line-through">{formatPrice(plan.price_cents)}</span>
                        )}
                        <span className="font-serif text-5xl text-gradient-gold">{formatPrice(finalCents)}</span>
                        <span className="text-muted-foreground">/{plan.interval === 'monthly' ? 'mês' : 'ano'}</span>
                      </div>
                      {app && (
                        <p className="text-xs text-emerald-400 mt-1">Cupom {app.code} aplicado: -{formatPrice(app.discount_cents)}</p>
                      )}
                      <p className="text-sm text-muted-foreground mt-2">Cancele quando quiser. Sem fidelidade.</p>
                    </div>

                    <ul className="space-y-4 mb-6">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Check className="h-3 w-3 text-primary" />
                          </div>
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Coupon field */}
                    <div className="mb-6">
                      {app ? (
                        <div className="flex items-center justify-between gap-2 p-3 border border-emerald-500/30 bg-emerald-500/10 rounded-lg">
                          <div className="flex items-center gap-2 text-sm">
                            <Tag className="h-4 w-4 text-emerald-400" />
                            <span className="font-mono">{app.code}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeCoupon(plan.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            placeholder="Cupom de desconto"
                            value={couponInputs[plan.id] || ''}
                            onChange={e => setCouponInputs({ ...couponInputs, [plan.id]: e.target.value.toUpperCase() })}
                            className="flex-1"
                          />
                          <Button variant="outline" onClick={() => applyCoupon(plan)} disabled={validating === plan.id}>
                            {validating === plan.id ? '...' : 'Aplicar'}
                          </Button>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="premium"
                      size="xl"
                      className="w-full"
                      onClick={() => handleSubscribe(plan)}
                      disabled={loadingPlanId === plan.id}
                    >
                      {loadingPlanId === plan.id ? 'Processando...' : (
                        <>
                          <Zap className="h-5 w-5" />
                          Assinar Agora
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-16 text-center">
            <p className="text-muted-foreground">
              Tem dúvidas? Entre em contato pelo email{' '}
              <a href="mailto:contato@estelite.com.br" className="text-primary hover:underline">
                contato@estelite.com.br
              </a>
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}

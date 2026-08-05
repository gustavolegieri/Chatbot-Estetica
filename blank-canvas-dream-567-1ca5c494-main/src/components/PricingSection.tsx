import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Check, Sparkles, Crown, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  interval: string;
  features: string[];
  is_popular: boolean;
  looks_per_month: number;
}

interface Props {
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
}

export function PricingSection({ title = 'Escolha seu Plano', subtitle = 'Invista em autoconhecimento e transforme sua imagem pessoal.', showHeader = true }: Props) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('plans').select('*').eq('is_active', true).order('sort_order');
      if (data) setPlans(data.map(p => ({ ...p, features: (p.features as string[]) || [] })) as Plan[]);
      setLoading(false);
    })();
  }, []);

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

  return (
    <section aria-label="Planos" className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.06),transparent_70%)]" />
      <div className="container mx-auto px-4 relative z-10">
        {showHeader && (
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full mb-6">
              <Crown className="h-4 w-4 text-primary" />
              <span className="text-sm text-primary">Investimento em você</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-gradient-gold mb-4">
              {title}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              {subtitle}
            </p>
          </div>
        )}

        {loading ? (
          <div className="text-center animate-pulse text-primary">Carregando planos...</div>
        ) : (
          <div className={`max-w-5xl mx-auto grid gap-6 sm:gap-8 ${plans.length === 1 ? 'max-w-lg' : plans.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {plans.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className={`glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden ${plan.is_popular ? 'border-primary/40 glow-gold' : ''}`}
              >
                {plan.is_popular && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 rounded-bl-xl text-xs font-medium">
                    Mais Popular
                  </div>
                )}

                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-serif text-2xl">{plan.name}</h3>
                    {plan.description && <p className="text-muted-foreground text-xs">{plan.description}</p>}
                  </div>
                </div>

                <div className="mb-5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-serif text-4xl sm:text-5xl text-gradient-gold">{formatPrice(plan.price_cents)}</span>
                    <span className="text-muted-foreground text-sm">/{plan.interval === 'monthly' ? 'mês' : 'ano'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {plan.looks_per_month} diagnóstico{plan.looks_per_month > 1 ? 's' : ''} por mês · Cancele quando quiser
                  </p>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant="premium"
                  size="lg"
                  className="w-full"
                  onClick={() => navigate('/pricing')}
                >
                  <Zap className="h-4 w-4" />
                  Assinar Agora
                </Button>
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Button variant="ghost" onClick={() => navigate('/pricing')} className="text-primary">
            Ver detalhes e cupons →
          </Button>
        </div>
      </div>
    </section>
  );
}

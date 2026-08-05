import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { CheckCircle, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/account');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <Layout>
      <section className="min-h-[80vh] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-dark" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative z-10 text-center max-w-lg mx-auto px-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-8"
          >
            <CheckCircle className="w-10 h-10 text-primary" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h1 className="font-serif text-4xl md:text-5xl text-gradient-gold mb-4">
              Assinatura Confirmada!
            </h1>
            <p className="text-muted-foreground text-lg mb-2">
              Parabéns! Sua assinatura foi ativada com sucesso.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full mb-8">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm text-primary">Acesso completo liberado</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Agora você pode iniciar seus diagnósticos de estilo personalizados.
            </p>

            <Button
              variant="premium"
              size="xl"
              className="w-full max-w-xs mx-auto"
              onClick={() => navigate('/account')}
            >
              <ArrowRight className="h-5 w-5" />
              Ir para o Painel
            </Button>

            <p className="text-xs text-muted-foreground">
              Redirecionando automaticamente em {countdown}s...
            </p>
          </motion.div>
        </motion.div>
      </section>
    </Layout>
  );
}

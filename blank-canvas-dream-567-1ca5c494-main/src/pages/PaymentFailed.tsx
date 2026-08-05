import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { motion } from 'framer-motion';
import { XCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentFailed() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = params.get('status') || 'rejected';
  const reason = params.get('reason') || 'O pagamento não foi aprovado pela operadora.';

  return (
    <Layout>
      <section className="min-h-[80vh] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-dark" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-destructive/10 rounded-full blur-[150px]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 text-center max-w-lg mx-auto px-4"
        >
          <div className="w-20 h-20 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-8">
            <XCircle className="w-10 h-10 text-destructive" />
          </div>

          <h1 className="font-serif text-4xl md:text-5xl mb-4">Pagamento não concluído</h1>
          <p className="text-muted-foreground text-lg mb-2">Status: <span className="text-foreground">{status}</span></p>
          <p className="text-sm text-muted-foreground mb-8">{reason}</p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="premium" size="xl" onClick={() => navigate('/pricing')}>
              <RefreshCw className="h-5 w-5" /> Tentar novamente
            </Button>
            <Button variant="outline" size="xl" onClick={() => navigate('/account')}>
              <ArrowLeft className="h-5 w-5" /> Voltar ao painel
            </Button>
          </div>
        </motion.div>
      </section>
    </Layout>
  );
}

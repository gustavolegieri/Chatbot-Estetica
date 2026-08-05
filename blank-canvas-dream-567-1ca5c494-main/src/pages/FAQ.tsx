import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { PageTransition } from '@/components/layout/PageTransition';

const faqCategories = [
  {
    title: 'Sobre o Diagnóstico',
    items: [
      {
        q: 'O que é o diagnóstico de imagem pessoal?',
        a: 'É uma análise completa feita por 7 inteligências artificiais especializadas que avaliam seu corpo, cores, estilo e criam um guia personalizado com recomendações de roupas, modelagens, paleta de cores e guarda-roupa cápsula.',
      },
      {
        q: 'Como funciona o processo?',
        a: 'Você envia 4 fotos (frente, lateral, costas e rosto), preenche um questionário detalhado sobre seu estilo de vida e objetivos, e nossas IAs processam tudo para gerar um diagnóstico completo em minutos.',
      },
      {
        q: 'Quantas fotos preciso enviar?',
        a: 'São 4 fotos obrigatórias: corpo inteiro de frente, corpo inteiro de lado, corpo inteiro de costas e uma foto do rosto. Recomendamos usar roupas justas e iluminação natural.',
      },
      {
        q: 'O diagnóstico é realmente personalizado?',
        a: 'Sim! Cada diagnóstico é único e gerado com base nas suas fotos reais, medidas corporais, preferências de estilo, profissão, clima da sua região e objetivos pessoais.',
      },
      {
        q: 'Quanto tempo leva para receber o resultado?',
        a: 'O processamento leva de 2 a 5 minutos. Ao final, você acessa o resultado completo diretamente na plataforma.',
      },
    ],
  },
  {
    title: 'Planos e Pagamento',
    items: [
      {
        q: 'Quais planos estão disponíveis?',
        a: 'Oferecemos planos mensais e anuais com acesso ilimitado a diagnósticos. Visite nossa página de preços para ver os detalhes atualizados.',
      },
      {
        q: 'Posso cancelar a assinatura?',
        a: 'Sim, você pode cancelar a qualquer momento. Não há fidelidade. Você continuará com acesso até o final do período já pago.',
      },
      {
        q: 'Quais formas de pagamento são aceitas?',
        a: 'Aceitamos cartão de crédito e débito através da plataforma Stripe, que garante segurança total nas transações.',
      },
    ],
  },
  {
    title: 'Privacidade e Segurança',
    items: [
      {
        q: 'Minhas fotos ficam seguras?',
        a: 'Sim. Suas fotos são armazenadas com criptografia e usadas exclusivamente para gerar seu diagnóstico. Nunca compartilhamos suas imagens com terceiros.',
      },
      {
        q: 'Posso excluir meus dados?',
        a: 'Sim. Você pode excluir seus diagnósticos a qualquer momento na sua conta. Para excluir sua conta completamente, entre em contato conosco.',
      },
      {
        q: 'Quem tem acesso ao meu diagnóstico?',
        a: 'Apenas você. Os resultados são privados e só podem ser vistos por outras pessoas se você optar por compartilhar usando o link de compartilhamento.',
      },
    ],
  },
  {
    title: 'Resultado e Compartilhamento',
    items: [
      {
        q: 'Posso baixar o resultado em PDF?',
        a: 'Sim! Temos um botão de exportação PDF Premium que gera um documento completo com todas as suas análises, fotos e recomendações.',
      },
      {
        q: 'Posso compartilhar meu diagnóstico?',
        a: 'Sim. Você pode compartilhar via link direto ou WhatsApp. Quem receber o link poderá visualizar seu diagnóstico.',
      },
      {
        q: 'O resultado inclui quais análises?',
        a: 'Inclui: Análise Corporal (biotipo e proporções), Paleta de Cores (coloração pessoal), Perfil de Estilo, Guia de Modelagens, Peças Essenciais e Guarda-Roupa Cápsula com looks por ocasião.',
      },
    ],
  },
];

export default function FAQ() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <PageTransition>
      <Layout>
        {/* Hero */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-dark" />
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full mb-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <HelpCircle className="h-4 w-4 text-primary" />
                <span className="text-sm text-primary">Central de Ajuda</span>
              </motion.div>
              <motion.h1
                className="font-serif text-5xl md:text-6xl text-gradient-gold mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                Perguntas Frequentes
              </motion.h1>
              <motion.p
                className="text-muted-foreground text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                Tudo o que você precisa saber sobre o diagnóstico de imagem pessoal da EST ELITE.
              </motion.p>
            </div>
          </div>
        </section>

        {/* FAQ Content */}
        <section className="py-16">
          <div className="container max-w-3xl mx-auto px-4">
            {faqCategories.map((category, catIdx) => (
              <motion.div
                key={category.title}
                className="mb-12"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: catIdx * 0.1, duration: 0.5 }}
              >
                <h2 className="font-serif text-2xl text-primary mb-6">{category.title}</h2>
                <Accordion type="multiple" className="space-y-3">
                  {category.items.map((item, i) => (
                    <AccordionItem
                      key={i}
                      value={`${catIdx}-${i}`}
                      className="glass-card rounded-xl border border-border px-6 data-[state=open]:border-primary/30 transition-colors"
                    >
                      <AccordionTrigger className="text-left text-foreground hover:text-primary font-medium py-5 text-sm">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground text-sm pb-5 leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-dark" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="font-serif text-4xl text-gradient-gold mb-6">
                Pronta para descobrir seu estilo?
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Faça seu diagnóstico completo com inteligência artificial.
              </p>
              <Button
                variant="premium"
                size="xl"
                onClick={() => navigate(user ? '/account' : '/auth?mode=signup')}
                className="group"
              >
                {user ? 'Ir para minha conta' : 'Começar Agora'}
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </section>
      </Layout>
    </PageTransition>
  );
}

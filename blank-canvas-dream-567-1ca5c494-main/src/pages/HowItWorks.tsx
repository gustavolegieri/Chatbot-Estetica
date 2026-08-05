import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { 
  Camera, 
  ClipboardList, 
  Sparkles, 
  FileText,
  ArrowRight,
  Brain,
  Palette,
  Shirt,
  Scissors,
  ShoppingBag,
  Briefcase,
  Crown
} from 'lucide-react';

export default function HowItWorks() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const steps = [
    {
      number: '01',
      icon: Camera,
      title: 'Envie suas Fotos',
      description: 'Faça upload de fotos de corpo inteiro (frente, lado e costas) e uma foto do rosto para análise de coloração.',
    },
    {
      number: '02',
      icon: ClipboardList,
      title: 'Responda o Questionário',
      description: 'Conte-nos sobre seu estilo de vida, rotina, preferências e objetivos de imagem pessoal.',
    },
    {
      number: '03',
      icon: Sparkles,
      title: 'Processamento com IA',
      description: 'Nossas 7 inteligências artificiais especializadas analisam suas informações em detalhes.',
    },
    {
      number: '04',
      icon: FileText,
      title: 'Receba seu Diagnóstico',
      description: 'Acesse seu diagnóstico completo com todas as análises e recomendações personalizadas.',
    },
  ];

  const ais = [
    {
      icon: Brain,
      title: 'IA de Análise Corporal',
      description: 'Identifica seu biótipo, proporções corporais e pontos de equilíbrio para valorização da silhueta.',
    },
    {
      icon: Palette,
      title: 'IA de Coloração',
      description: 'Analisa tons de pele, olhos e cabelo para definir sua paleta de cores ideal.',
    },
    {
      icon: Sparkles,
      title: 'IA de Estilo',
      description: 'Mapeia sua personalidade e contexto para identificar seu perfil de estilo predominante.',
    },
    {
      icon: Scissors,
      title: 'IA de Modelagens',
      description: 'Recomenda cortes, tecidos e modelagens que valorizam seu corpo.',
    },
    {
      icon: ShoppingBag,
      title: 'IA de Curadoria',
      description: 'Seleciona peças essenciais que devem estar no seu guarda-roupa.',
    },
    {
      icon: Briefcase,
      title: 'IA de Armário Cápsula',
      description: 'Monta um guarda-roupa funcional com peças versáteis e atemporais.',
    },
    {
      icon: Crown,
      title: 'IA de Síntese Final',
      description: 'Consolida todas as análises em um diagnóstico completo e coerente.',
    },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-dark" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-serif text-5xl md:text-6xl text-gradient-gold mb-6">
              Como Funciona
            </h1>
            <p className="text-muted-foreground text-lg mb-8">
              Um processo simples e poderoso para descobrir sua imagem ideal. Entenda cada etapa da sua transformação.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-24 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div 
                key={step.number}
                className="relative"
              >
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-full w-full h-px bg-gradient-to-r from-primary/50 to-transparent z-0" />
                )}
                <div className="glass-card rounded-2xl p-8 relative z-10 h-full">
                  <span className="text-primary/30 font-serif text-5xl absolute top-4 right-4">
                    {step.number}
                  </span>
                  <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <step.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-serif text-xl mb-3">{step.title}</h3>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AIs Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-serif text-4xl md:text-5xl mb-4">
              <span className="text-gradient-gold">7 Inteligências</span> Artificiais
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Cada IA é especializada em um aspecto da sua imagem, trabalhando em conjunto para entregar o diagnóstico mais completo.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ais.map((ai) => (
              <div 
                key={ai.title}
                className="glass-card rounded-xl p-6 hover:border-primary/30 transition-colors"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <ai.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-serif text-lg mb-2">{ai.title}</h3>
                <p className="text-muted-foreground text-sm">{ai.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-dark" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-serif text-4xl text-gradient-gold mb-6">
              Pronta para começar?
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Sua transformação está a poucos cliques de distância.
            </p>
            <Button 
              variant="premium" 
              size="xl"
              onClick={() => navigate(user ? '/account' : '/auth?mode=signup')}
              className="group"
            >
              {user ? 'Ir para minha conta' : 'Iniciar Diagnóstico'}
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Sparkles, ArrowRight, ArrowLeft, X, Camera, Palette, Shirt,
  Crown, Star, Shield, Eye, CheckCircle2, Wand2, Gem,
} from 'lucide-react';

const STORAGE_KEY = 'estelite_onboarding';
const TOTAL = 6;

const fade: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

const stagger: Variants = { animate: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const item: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
};

export default function Experience() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  useEffect(() => { document.title = 'Experiência EST ELITE'; }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    navigate('/pricing');
  };
  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : finish());
  const back = () => step > 0 && setStep(step - 1);

  const isLast = step === TOTAL - 1;
  const ctaLabel = isLast ? 'Ver Planos' : step === 0 ? 'Quero descobrir meu estilo' : 'Continuar';

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col bg-background text-foreground overflow-x-hidden"
      style={{
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Ambient */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_60%)]" />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom,hsl(var(--primary)/0.06),transparent_70%)]" />

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-5 md:px-10 h-[60px] shrink-0">
        <button
          onClick={back}
          disabled={step === 0}
          aria-label="Voltar"
          className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-30 disabled:pointer-events-none min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Voltar</span>
        </button>
        <div className="text-[10px] sm:text-xs tracking-[0.2em] uppercase text-muted-foreground/70">
          Etapa {step + 1} de {TOTAL}
        </div>
        <button
          onClick={finish}
          aria-label="Pular"
          className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition min-h-[44px]"
        >
          <span className="hidden sm:inline">Pular</span> <X className="h-4 w-4" />
        </button>
      </header>

      {/* Main - natural scroll */}
      <main className="relative z-10 flex-1 flex flex-col items-center w-full px-5 pt-4 pb-10 md:px-16 md:pt-8 md:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={fade}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full max-w-[720px] flex flex-col items-center gap-6"
          >
            <motion.div variants={stagger} initial="initial" animate="animate" className="w-full flex flex-col items-center gap-6">
              {/* Image */}
              <motion.div variants={item} className="w-full flex items-center justify-center">
                <div
                  className="w-full overflow-hidden rounded-[28px]"
                  style={{
                    aspectRatio: '16 / 10',
                    maxHeight: 'min(40vh, 320px)',
                  }}
                >
                  <div className="w-full h-full [&>*]:!max-h-full [&>*]:!w-full [&>*]:!h-full flex items-center justify-center">
                    {STEPS[step].visual}
                  </div>
                </div>
              </motion.div>

              {/* Badge */}
              {STEPS[step].kicker && (
                <motion.div variants={item} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-primary font-medium tracking-wide">{STEPS[step].kicker}</span>
                </motion.div>
              )}

              {/* Title */}
              <motion.h1
                variants={item}
                className="font-serif text-center"
                style={{
                  maxWidth: 700,
                  lineHeight: 1.15,
                  fontSize: 'clamp(2.25rem, 5vw + 0.5rem, 4rem)',
                }}
              >
                {STEPS[step].title}
              </motion.h1>

              {/* Description */}
              <motion.p
                variants={item}
                className="text-muted-foreground text-center"
                style={{
                  maxWidth: 620,
                  fontSize: 'clamp(1rem, 0.9vw + 0.8rem, 1.125rem)',
                  lineHeight: 1.7,
                }}
              >
                {STEPS[step].description}
              </motion.p>

              {STEPS[step].extras && (
                <motion.div variants={item} className="w-full max-w-[620px]">
                  {STEPS[step].extras}
                </motion.div>
              )}

              {/* Progress dots */}
              <motion.div variants={item} className="flex items-center gap-2">
                {Array.from({ length: TOTAL }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === step ? 'w-8 bg-primary' : i < step ? 'w-2 bg-primary/60' : 'w-2 bg-border'
                    }`}
                  />
                ))}
              </motion.div>

              {/* CTA */}
              <motion.div variants={item} className="w-full flex justify-center pt-2">
                <Button
                  variant="premium"
                  size="lg"
                  onClick={next}
                  className="w-full max-w-[360px] md:w-auto md:min-w-[280px] shadow-[0_0_30px_hsl(43,74%,49%,0.25)]"
                >
                  {isLast && <Sparkles className="mr-2 h-5 w-5" />}
                  {ctaLabel}
                  {!isLast && <ArrowRight className="ml-2 h-5 w-5" />}
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* -------------------- Visuals -------------------- */

function VisualImage() {
  return (
    <div className="relative w-full h-full overflow-hidden glass-card border border-primary/20">
      <img
        src="https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1000&q=80&auto=format&fit=crop"
        alt="Mulher elegante"
        loading="lazy"
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
    </div>
  );
}

function VisualCards() {
  const cards = [
    { icon: Sparkles, title: 'Biotipo' },
    { icon: Palette, title: 'Coloração' },
    { icon: Shirt, title: 'Estilo' },
    { icon: Gem, title: 'Cápsula' },
    { icon: Crown, title: 'Modelagens' },
    { icon: Star, title: 'Premium' },
  ];
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-transparent">
      <div className="grid grid-cols-3 gap-2 sm:gap-3 p-4 w-full max-w-[520px]">
        {cards.map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card rounded-xl p-2 sm:p-3 border border-border/50 flex flex-col items-center gap-1.5 aspect-square justify-center"
          >
            <c.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <span className="text-[10px] sm:text-xs text-foreground/90 text-center">{c.title}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function VisualOrbit() {
  const ias = [
    { label: 'Corpo', icon: Eye },
    { label: 'Cores', icon: Palette },
    { label: 'Estilo', icon: Star },
    { label: 'Modelagens', icon: Shirt },
    { label: 'Essenciais', icon: Shield },
    { label: 'Cápsula', icon: Crown },
    { label: 'Final', icon: Sparkles },
  ];
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-transparent">
      <div className="relative aspect-square h-full max-h-full">
        <motion.div
          className="absolute inset-3 rounded-full border border-primary/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-8 rounded-full border border-primary/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[26%] h-[26%] rounded-full glass-card border border-primary/30 flex items-center justify-center shadow-[0_0_30px_hsl(43,74%,49%,0.3)]">
            <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
        </div>
        {ias.map((ia, i) => {
          const angle = (i / ias.length) * Math.PI * 2 - Math.PI / 2;
          const x = 50 + Math.cos(angle) * 42;
          const y = 50 + Math.sin(angle) * 42;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className="glass-card w-9 h-9 md:w-14 md:h-14 rounded-xl md:rounded-2xl border border-primary/20 flex flex-col items-center justify-center gap-0.5">
                <ia.icon className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                <span className="text-[7px] md:text-[10px] text-foreground/80">{ia.label}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function VisualTimeline() {
  const steps = [
    { icon: Camera, title: 'Envie suas fotos' },
    { icon: Wand2, title: 'IA analisa detalhes' },
    { icon: Palette, title: 'Cartela ideal' },
    { icon: Shirt, title: 'Seu estilo' },
    { icon: Gem, title: 'Guarda-roupa cápsula' },
    { icon: Sparkles, title: 'Relatório completo' },
  ];
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-transparent p-3">
      <div className="w-full max-w-[440px] space-y-1.5">
        {steps.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            className="flex items-center gap-3 glass-card rounded-lg px-3 py-1.5 border border-border/50"
          >
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <s.icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs sm:text-sm text-foreground/90 truncate">{s.title}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">0{i + 1}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function VisualReport() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-transparent p-3">
      <div className="w-full max-w-[400px] glass-card rounded-2xl p-4 border border-primary/20 shadow-[0_20px_60px_-20px_hsl(43,74%,49%,0.3)]">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Crown className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Premium</p>
            <p className="text-xs font-medium">Relatório Personalizado</p>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1.5 mb-3">
          {['#C6A74E', '#8B6F5E', '#E8C5D0', '#4A6741', '#0C2340', '#F5F0E8'].map((c, i) => (
            <div key={i} className="aspect-square rounded-md border border-border/50" style={{ background: c }} />
          ))}
        </div>
        <div className="space-y-1.5 mb-3">
          <div className="h-1.5 rounded-full bg-primary/20 w-full" />
          <div className="h-1.5 rounded-full bg-primary/10 w-4/5" />
          <div className="h-1.5 rounded-full bg-primary/10 w-2/3" />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[3/4] rounded-md bg-gradient-to-br from-primary/10 to-primary/5 border border-border/40" />
          ))}
        </div>
      </div>
    </div>
  );
}

function VisualFinal() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-transparent relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle,hsl(var(--primary)/0.25),transparent_65%)]" />
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-[15%] rounded-full border border-primary/30 border-dashed aspect-square m-auto"
        style={{ maxWidth: '60%', maxHeight: '90%' }}
      />
      <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-full glass-card border border-primary/40 flex items-center justify-center shadow-[0_0_60px_hsl(43,74%,49%,0.4)]">
        <Crown className="h-10 w-10 md:h-12 md:w-12 text-primary" />
      </div>
    </div>
  );
}

/* -------------------- Step content -------------------- */

const STEPS: Array<{
  kicker?: string;
  title: ReactNode;
  description: ReactNode;
  visual: ReactNode;
  extras?: ReactNode;
}> = [
  {
    kicker: 'Bem-vinda à EST ELITE',
    title: <>Sua imagem comunica antes da sua <span className="text-gradient-gold">voz.</span></>,
    description: 'Descubra exatamente quais cores, modelagens e estilos valorizam sua beleza única. Nossa IA faz isso em poucos minutos.',
    visual: <VisualImage />,
  },
  {
    kicker: 'Muito além de um teste',
    title: <>Uma consultoria <span className="text-gradient-gold">completa</span></>,
    description: 'Biotipo, coloração, estilo, modelagens, essenciais e guarda-roupa cápsula. Tudo integrado em um único diagnóstico.',
    visual: <VisualCards />,
  },
  {
    kicker: '7 Inteligências',
    title: <>7 IAs trabalhando <span className="text-gradient-gold">por você</span></>,
    description: 'Cada IA é especialista em um aspecto da consultoria. Juntas, criam um diagnóstico extremamente personalizado.',
    visual: <VisualOrbit />,
  },
  {
    kicker: 'Sua jornada',
    title: <>Como acontece sua <span className="text-gradient-gold">transformação</span></>,
    description: 'Um processo pensado para ser simples, rápido e profundamente pessoal — do upload das fotos ao relatório final.',
    visual: <VisualTimeline />,
  },
  {
    kicker: 'O resultado',
    title: <>Saiba exatamente <span className="text-gradient-gold">o que vestir</span></>,
    description: 'Looks prontos, paleta personalizada, peças que valorizam você e combinações inteligentes — feitos só para você.',
    visual: <VisualReport />,
    extras: (
      <ul className="grid grid-cols-2 gap-2">
        {['Looks prontos', 'Paleta pessoal', 'Peças ideais', 'Sem compras erradas'].map((t) => (
          <li key={t} className="flex items-center gap-2 text-sm text-foreground/90">
            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> {t}
          </li>
        ))}
      </ul>
    ),
  },
  {
    kicker: 'Está pronta?',
    title: <>Sua transformação <span className="text-gradient-gold">começa agora.</span></>,
    description: 'Mais de 30 páginas de diagnóstico personalizado, produzidas por Inteligência Artificial especializada em consultoria de imagem.',
    visual: <VisualFinal />,
  },
];

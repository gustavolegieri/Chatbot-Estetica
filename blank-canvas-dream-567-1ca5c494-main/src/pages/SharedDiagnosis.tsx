import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, User, Palette, Shirt, Scissors, ShoppingBag, LayoutGrid, AlertTriangle, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { SummarySection } from '@/components/diagnosis/result/SummarySection';
import { CapsuleSection } from '@/components/diagnosis/result/CapsuleSection';
import { ColorSection } from '@/components/diagnosis/result/ColorSection';
import { BodySection } from '@/components/diagnosis/result/BodySection';
import { EssentialsSection } from '@/components/diagnosis/result/EssentialsSection';
import { StyleSection } from '@/components/diagnosis/result/StyleSection';
import { ModelingSection } from '@/components/diagnosis/result/ModelingSection';
import { AnalysisSection } from '@/components/diagnosis/result/AnalysisSection';
import { useDiagnosisImages } from '@/hooks/useDiagnosisImages';
import { useLookImages } from '@/hooks/useLookImages';

interface DiagnosisData {
  id: string;
  created_at: string;
  body_analysis: Record<string, unknown> | null;
  color_analysis: Record<string, unknown> | null;
  style_analysis: Record<string, unknown> | null;
  modeling_analysis: Record<string, unknown> | null;
  wardrobe_essentials: Record<string, unknown> | null;
  capsule_wardrobe: Record<string, unknown> | null;
  final_diagnosis: Record<string, unknown> | null;
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <motion.div className="mb-8" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground">{title}</h2>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-primary/30 via-primary/10 to-transparent mt-4" />
    </motion.div>
  );
}

export default function SharedDiagnosis() {
  const { token } = useParams<{ token: string }>();
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { imagesMap, isLoading: imagesLoading } = useDiagnosisImages(diagnosis?.id);
  const { lookImagesMap, isLoading: lookImagesLoading } = useLookImages(diagnosis?.id);

  useEffect(() => { if (token) fetchShared(); }, [token]);

  const fetchShared = async () => {
    try {
      const { data, error: err } = await supabase
        .rpc('get_shared_diagnosis', { _token: token });
      if (err) throw err;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('not found');
      setDiagnosis(row as unknown as DiagnosisData);
    } catch { setError(true); } finally { setLoading(false); }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;

  if (error || !diagnosis) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h1 className="font-serif text-2xl text-foreground mb-2">Link inválido ou expirado</h1>
        <p className="text-muted-foreground text-center">Este diagnóstico não está disponível.</p>
      </div>
    );
  }

  const isValid = (data: Record<string, unknown> | null) => data && !(data as Record<string, unknown>).error;

  const sections = [
    { id: 'corpo', icon: User, title: 'Análise Corporal', sub: 'Biotipo e proporções', data: diagnosis.body_analysis, Component: BodySection },
    { id: 'cores', icon: Palette, title: 'Paleta de Cores', sub: 'Coloração pessoal', data: diagnosis.color_analysis, Component: ColorSection },
    { id: 'estilo', icon: Shirt, title: 'Estilo Pessoal', sub: 'Identidade de estilo', data: diagnosis.style_analysis, Component: StyleSection },
    { id: 'modelagens', icon: Scissors, title: 'Modelagens Ideais', sub: 'Cortes e tecidos', data: diagnosis.modeling_analysis, Component: ModelingSection },
    { id: 'essenciais', icon: ShoppingBag, title: 'Peças Essenciais', sub: 'Guarda-roupa base', data: diagnosis.wardrobe_essentials, Component: EssentialsSection },
    { id: 'capsula', icon: LayoutGrid, title: 'Armário Cápsula', sub: 'Looks por ocasião', data: diagnosis.capsule_wardrobe, Component: CapsuleSection },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/50 bg-card/50 sticky top-0 z-30 backdrop-blur-xl">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="font-serif text-xl text-primary font-bold tracking-wider">EST ELITE</h1>
          <span className="text-xs text-muted-foreground">Diagnóstico compartilhado • {new Date(diagnosis.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      <div className="container max-w-5xl mx-auto px-4 py-10 space-y-20">
        {isValid(diagnosis.final_diagnosis) && (
          <SummarySection data={diagnosis.final_diagnosis as Record<string, unknown> & { summary?: string; principais_descobertas?: string[]; mensagem_final?: string }} />
        )}

        {sections.map(({ id, icon, title, sub, data, Component }) => (
          <div key={id}>
            <SectionHeader icon={icon} title={title} subtitle={sub} />
            {isValid(data) ? (
              id === 'essenciais' ? <EssentialsSection data={data!} imagesMap={imagesMap} imagesLoading={imagesLoading} /> :
              id === 'capsula' ? <CapsuleSection data={data!} imagesMap={imagesMap} imagesLoading={imagesLoading} lookImagesMap={lookImagesMap} lookImagesLoading={lookImagesLoading} diagnosisId={diagnosis.id} /> :
              <Component data={data!} />
            ) : <AnalysisSection data={data} label={title} />}
          </div>
        ))}

        <div className="text-center pt-10 pb-20 border-t border-border/50">
          <p className="text-primary font-serif text-2xl font-bold mb-2">EST ELITE</p>
          <p className="text-muted-foreground text-sm">Diagnóstico de estilo personalizado com inteligência artificial</p>
          <p className="mt-4"><a href="/" className="text-primary underline text-sm">Quer o seu? Acesse estelite.lovable.app</a></p>
        </div>
      </div>
    </div>
  );
}

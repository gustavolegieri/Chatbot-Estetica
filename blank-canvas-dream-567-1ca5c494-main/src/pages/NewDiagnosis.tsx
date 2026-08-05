import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { usePlanAccess } from '@/hooks/usePlanAccess';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PhotoUploadStep } from '@/components/diagnosis/PhotoUploadStep';
import { QuestionnaireStep } from '@/components/diagnosis/QuestionnaireStep';
import { ProcessingStep } from '@/components/diagnosis/ProcessingStep';
import { PlanLimitGuard } from '@/components/diagnosis/PlanLimitGuard';
import { useDiagnosisDraft } from '@/hooks/useDiagnosisDraft';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Json } from '@/integrations/supabase/types';

const EMPTY_QUESTIONNAIRE: QuestionnaireData = {
  lifestyle: '', profession: '', occasions: [], preferences: [], budget: '',
  climate: '', goals: '', bodyType: '', height: '', challenges: '',
  heightCm: '', weightKg: '', topSize: '', bottomSize: '', shoeSize: '',
  bodyNotes: '', hairColor: '', eyeColor: '', skinTone: '',
  fitPreference: '', formalityLevel: '',
};

export type DiagnosisPhotos = {
  front: File | null;
  side: File | null;
  back: File | null;
  face: File | null;
};

const EMPTY_PHOTOS: DiagnosisPhotos = { front: null, side: null, back: null, face: null };

export type QuestionnaireData = {
  lifestyle: string;
  profession: string;
  occasions: string[];
  preferences: string[];
  budget: string;
  climate: string;
  goals: string;
  bodyType: string;
  height: string;
  challenges: string;
  heightCm: string;
  weightKg: string;
  topSize: string;
  bottomSize: string;
  shoeSize: string;
  bodyNotes: string;
  hairColor: string;
  eyeColor: string;
  skinTone: string;
  fitPreference: string;
  formalityLevel: string;
  // ── Diagnóstico Estratégico de Imagem (novos blocos) ──
  momentoAtual?: string;
  objetivosImagem?: string[];
  percepcaoAtual?: string[];
  rotina?: string;
  comoSeVeste?: string;
  ondeBemVestida?: string;
  conforto?: number;
  dores?: string[];
  facilidadeCompra?: string;
  percentualUsado?: string;
  dificuldadeCompra?: string;
  psicometrico?: Record<string, string>;
  styleWeights?: Record<string, number>;
  palavrasTransmitir?: string[];
  palavrasEvitar?: string[];
  chamarAtencao?: string;
  preferenciaRoupas?: string;
  prioridadeCompra?: string[];
  orcamentoMensal?: string;
  guardaRoupaDesejado?: string;
  // ── Bloco 7 · Identidade Estendida ──
  idade?: string;
  cidadeEstado?: string;
  personalidadeTraits?: string[];
  admiraQuem?: string;
  famosasReferencia?: string;
  comoQuerSerLembrada?: string;
  guardaRoupaAtual?: Record<string, string>; // { blazers: '3-5', vestidos: '5-10', ... }
  rituais?: string[]; // viaja, treina, é mãe, empreende, etc
  // ── Bloco 8 · Relação com o corpo e o vestir ──
  parteQueMaisGosta?: string[];
  parteQueMenosGosta?: string[];
  desafiosCorpo?: string[];
  pecasFavoritasHoje?: string;
  pecasRejeitadas?: string;
  sensacaoAoVestir?: string;
  comoQuerSeSentir?: string[];
  // ── Bloco 9 · Materiais, cores e texturas ──
  tecidosPreferidos?: string[];
  tecidosEvitar?: string[];
  estampasPreferidas?: string[];
  coresQueAma?: string;
  coresQueEvita?: string;
  metaisPreferidos?: string;
  aversoesSensoriais?: string[];
  // ── Bloco 10 · Vida, referências e cultura ──
  viajaComQueFrequencia?: string;
  ocasioesEspeciaisAno?: string[];
  culturaEmpresa?: string;
  redesSociaisRelevancia?: string;
  marcasAdmira?: string;
  referenciasEsteticas?: string;
  inspiracaoAtual?: string;
  // ── Bloco 11 · Detalhes Finais (Perfil / Coloração / Corpo / Ocasiões / Armário / Compras) ──
  cargo?: string;
  trabalhoPresencial?: string;
  trabalhoRemoto?: string;
  viaja?: string;
  cidade?: string;
  subtom?: string;
  bronzeia?: string;
  queima?: string;
  corSobrancelhas?: string;
  contraste?: string;
  medidaCintura?: string;
  medidaQuadril?: string;
  medidaBusto?: string;
  tempoTrabalho?: string;
  tempoEventos?: string;
  tempoViagens?: string;
  tempoCasual?: string;
  tempoNoite?: string;
  tempoAcademia?: string;
  tempoCasa?: string;
  armarioAtual?: string[];
  lojasFavoritas?: string;
  marcasFavoritas?: string;
  marcasEvita?: string;
  pinterest?: string;
  instagram?: string;
};





const steps = [
  { id: 1, name: 'Fotos', description: 'Upload das suas fotos' },
  { id: 2, name: 'Diagnóstico', description: 'Diagnóstico Estratégico de Imagem' },
  { id: 3, name: 'Processamento', description: 'Análise com IA' },
];

export default function NewDiagnosis() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { access, loading: accessLoading } = usePlanAccess();

  const {
    initialDraft,
    restorePhotos,
    saveDraft,
    clearDraft,
    hasDraftContent,
  } = useDiagnosisDraft<QuestionnaireData, DiagnosisPhotos>({
    emptyAnswers: EMPTY_QUESTIONNAIRE,
    emptyPhotos: EMPTY_PHOTOS,
  });

  const [currentStep, setCurrentStep] = useState<number>(() => Math.min(initialDraft?.step ?? 1, 2));
  const [currentBlock, setCurrentBlock] = useState<number>(() => Math.max(0, (initialDraft?.block ?? 1) - 1));
  const [showResumeDialog, setShowResumeDialog] = useState<boolean>(false);
  const [draftReady, setDraftReady] = useState<boolean>(!initialDraft);
  const [photos, setPhotos] = useState<DiagnosisPhotos>(() => restorePhotos(initialDraft));


  useEffect(() => {
    if (!authLoading && !user) {
      toast.error('Você precisa estar logada para iniciar um diagnóstico.');
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // On first mount, if we found a draft, ask user whether to resume
  useEffect(() => {
    if (hasDraftContent(initialDraft)) {
      setShowResumeDialog(true);
    }
  }, [hasDraftContent, initialDraft]);

  useEffect(() => {
    if (user && draftReady && !initialDraft) loadProfileData();
  }, [user, draftReady, initialDraft]);

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireData>(
    initialDraft?.answers ?? { ...EMPTY_QUESTIONNAIRE }
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);

  // Auto-save draft on every change (only once user has resolved the resume dialog)
  useEffect(() => {
    if (!draftReady || isProcessing) return;
    saveDraft({
      step: currentStep,
      block: currentBlock + 1,
      question: currentBlock + 1,
      answers: questionnaire,
      photos,
      progress: {
        stepPercent: (currentStep / steps.length) * 100,
        blockPercent: ((currentBlock + 1) / 11) * 100,
        totalBlocks: 11,
      },
    });
  }, [questionnaire, photos, currentStep, currentBlock, draftReady, isProcessing, saveDraft]);

  const handleResumeContinue = () => {
    setShowResumeDialog(false);
    setDraftReady(true);
  };

  const handleResumeRestart = () => {
    clearDraft();
    setQuestionnaire({ ...EMPTY_QUESTIONNAIRE });
    setPhotos({ ...EMPTY_PHOTOS });
    setCurrentStep(1);
    setCurrentBlock(0);
    setShowResumeDialog(false);
    setDraftReady(true);
  };


  const loadProfileData = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user!.id).single();
      if (data) {
        const p = data as any;
        setQuestionnaire(prev => ({
          ...prev,
          heightCm: p.height_cm ? String(p.height_cm) : prev.heightCm,
          weightKg: p.weight_kg ? String(p.weight_kg) : prev.weightKg,
          topSize: p.top_size || prev.topSize,
          bottomSize: p.bottom_size || prev.bottomSize,
          shoeSize: p.shoe_size || prev.shoeSize,
          bodyType: p.body_type || prev.bodyType,
          bodyNotes: p.body_notes || prev.bodyNotes,
          hairColor: p.hair_color || prev.hairColor,
          eyeColor: p.eye_color || prev.eyeColor,
          skinTone: p.skin_tone || prev.skinTone,
          fitPreference: p.fit_preference || prev.fitPreference,
          formalityLevel: p.formality_level || prev.formalityLevel,
        }));
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  };

  const progress = (currentStep / steps.length) * 100;
  const canProceedStep1 = !!(photos.front && photos.side && photos.back && photos.face);
  const canProceedStep2 = !!(
    questionnaire.momentoAtual &&
    (questionnaire.objetivosImagem?.length ?? 0) > 0 &&
    (questionnaire.percepcaoAtual?.length ?? 0) > 0 &&
    questionnaire.rotina && questionnaire.comoSeVeste && questionnaire.ondeBemVestida &&
    questionnaire.climate && questionnaire.conforto &&
    (questionnaire.dores?.length ?? 0) > 0 && questionnaire.facilidadeCompra && questionnaire.percentualUsado &&
    questionnaire.psicometrico && Object.keys(questionnaire.psicometrico).length >= 7 &&
    (questionnaire.palavrasTransmitir?.length ?? 0) > 0 && questionnaire.chamarAtencao && questionnaire.preferenciaRoupas &&
    (questionnaire.prioridadeCompra?.length ?? 0) > 0 && questionnaire.orcamentoMensal && questionnaire.guardaRoupaDesejado &&
    // Bloco 7 · Identidade
    questionnaire.idade && (questionnaire.personalidadeTraits?.length ?? 0) > 0 && questionnaire.comoQuerSerLembrada &&
    // Bloco 8 · Corpo/vestir
    (questionnaire.parteQueMaisGosta?.length ?? 0) > 0 && questionnaire.sensacaoAoVestir && (questionnaire.comoQuerSeSentir?.length ?? 0) > 0 &&
    // Bloco 9 · Materiais e cores
    (questionnaire.tecidosPreferidos?.length ?? 0) > 0 && questionnaire.metaisPreferidos &&
    // Bloco 10 · Vida
    questionnaire.viajaComQueFrequencia && questionnaire.culturaEmpresa &&
    // Bloco 11 · Detalhes Finais
    questionnaire.cargo && questionnaire.subtom
  );

  const uploadPhoto = async (file: File, type: string, diagId: string): Promise<string> => {
    console.log(`Etapa 1 - upload ${type} iniciado`);
    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}/${diagId}/${type}.${fileExt}`;
    const { error } = await supabase.storage.from('diagnosis-photos').upload(fileName, file, { upsert: true });
    if (error) throw new Error(`Falha no upload da foto ${type}: ${error.message}`);
    // O bucket é privado. A URL assinada permite que a Edge Function leia a
    // foto durante o processamento sem tornar imagens pessoais públicas.
    const { data, error: signedUrlError } = await supabase.storage
      .from('diagnosis-photos')
      .createSignedUrl(fileName, 6 * 60 * 60);
    if (signedUrlError || !data?.signedUrl) {
      throw new Error(`Falha ao autorizar a foto ${type}: ${signedUrlError?.message || 'URL ausente'}`);
    }
    console.log(`Etapa 1 - upload ${type} concluído`);
    return data.signedUrl;
  };

  const withClientTimeout = async <T,>(label: string, promise: Promise<T>, timeoutMs = 90000): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const calculateStyleScore = () => {
    const styleMap: Record<string, string> = {
      classic: 'Clássico', romantic: 'Romântico', modern: 'Moderno',
      bold: 'Ousado', bohemian: 'Boho', elegant: 'Elegante',
    };
    const scores: Record<string, number> = {};
    Object.keys(styleMap).forEach(key => {
      scores[styleMap[key]] = questionnaire.preferences.includes(key) ? 85 : 20;
    });
    return scores;
  };

  const handleStartProcessing = async () => {
    if (!user) { toast.error('Você precisa estar logado'); navigate('/auth'); return; }
    console.log('Etapa 0 - iniciar processamento');
    setIsProcessing(true);
    setCurrentStep(3);

    let createdDiagnosisId: string | null = null;
    try {
      const styleScore = calculateStyleScore();
      const insertData: Record<string, unknown> = {
        user_id: user.id,
        questionnaire: questionnaire as unknown as Json,
        status: 'processing',
        height_cm: questionnaire.heightCm ? parseInt(questionnaire.heightCm) : null,
        weight_kg: questionnaire.weightKg ? parseInt(questionnaire.weightKg) : null,
        top_size: questionnaire.topSize || null,
        bottom_size: questionnaire.bottomSize || null,
        shoe_size: questionnaire.shoeSize || null,
        body_notes: questionnaire.bodyNotes || null,
        hair_color: questionnaire.hairColor || null,
        eye_color: questionnaire.eyeColor || null,
        skin_tone: questionnaire.skinTone || null,
        fit_preference: questionnaire.fitPreference || null,
        formality_level: questionnaire.formalityLevel || null,
        style_intensity_score: styleScore as unknown as Json,
      };

      console.log('Etapa 0.1 - criar diagnóstico no banco iniciado');
      const { data: diagnosis, error: diagError } = await supabase
        .from('diagnoses').insert([insertData] as any).select().single();
      if (diagError) {
        console.error('Etapa 0.1 - criar diagnóstico no banco falhou:', diagError);
        throw diagError;
      }
      console.log('Etapa 0.1 - criar diagnóstico no banco concluído', diagnosis.id);
      createdDiagnosisId = diagnosis.id;
      setDiagnosisId(diagnosis.id);

      console.log('Etapa 1 - upload iniciado');
      const [frontUrl, sideUrl, backUrl, faceUrl] = await Promise.all([
        photos.front ? withClientTimeout('UPLOAD_FRONT', uploadPhoto(photos.front, 'front', diagnosis.id)) : Promise.resolve(null),
        photos.side ? withClientTimeout('UPLOAD_SIDE', uploadPhoto(photos.side, 'side', diagnosis.id)) : Promise.resolve(null),
        photos.back ? withClientTimeout('UPLOAD_BACK', uploadPhoto(photos.back, 'back', diagnosis.id)) : Promise.resolve(null),
        photos.face ? withClientTimeout('UPLOAD_FACE', uploadPhoto(photos.face, 'face', diagnosis.id)) : Promise.resolve(null),
      ]);
      console.log('Etapa 2 - upload concluído');

      console.log('Etapa 2.1 - salvar URLs das fotos iniciado');
      const { error: photoUpdateError } = await supabase.from('diagnoses').update({
        photo_front_url: frontUrl, photo_side_url: sideUrl,
        photo_back_url: backUrl, photo_face_url: faceUrl,
      }).eq('id', diagnosis.id);
      if (photoUpdateError) {
        console.error('Etapa 2.1 - salvar URLs das fotos falhou:', photoUpdateError);
        throw photoUpdateError;
      }
      console.log('Etapa 2.1 - salvar URLs das fotos concluído');
      clearDraft();

      // Fire-and-forget: let ProcessingStep handle progress & navigation, but persist immediate failures
      const handleInvokeFailure = async (err: { message?: string; context?: { status?: number }; code?: string } | null) => {
        console.error('Background processing error:', err);
        const status = err?.context?.status;
        let code = err?.code || 'generic';
        let message = err?.message || 'Falha ao iniciar processamento';
        if (status === 403) {
          code = 'no_subscription';
          message = 'Conta sem assinatura';
        } else if (status === 401) {
          code = 'unauthorized';
          message = 'Sessão expirada';
        }
        await (supabase.from('diagnoses') as any).update({
          status: 'failed',
          processing_step: 'error',
          final_diagnosis: { error: message, code },
        }).eq('id', diagnosis.id);
        if (code === 'plan_limit_reached') {
          toast.error(message, {
            action: { label: 'Ver planos', onClick: () => navigate('/pricing') },
            duration: 8000,
          });
          setCurrentStep(2);
          setIsProcessing(false);
        }
      };
      console.log('Etapa 3 - processDiagnosis iniciado');
      supabase.functions.invoke('process-diagnosis', {
        body: { diagnosisId: diagnosis.id, photos: { frontUrl, sideUrl, backUrl, faceUrl }, questionnaire },
      }).then(({ data, error }) => {
        console.log('Etapa 3 - processDiagnosis respondeu', { hasError: Boolean(error), code: (data as { code?: string } | null)?.code });
        if (error) return handleInvokeFailure(error as never);
        const code = (data as { code?: string } | null)?.code;
        if (code === 'no_subscription' || code === 'unauthorized') {
          return handleInvokeFailure({
            message: (data as { error?: string }).error || 'Erro',
            context: { status: code === 'no_subscription' ? 403 : 401 },
          });
        }
        if (code === 'plan_limit_reached') {
          return handleInvokeFailure({
            message: (data as { error?: string }).error || 'Limite do plano atingido',
            code,
          });
        }
      }).catch(handleInvokeFailure);


    } catch (error) {
      console.error('Processing error:', error);
      if (createdDiagnosisId) {
        await (supabase.from('diagnoses') as any).update({
          status: 'failed',
          processing_step: 'error',
          final_diagnosis: { error: error instanceof Error ? error.message : 'Falha no envio das fotos', code: 'photo_upload_failed' },
        }).eq('id', createdDiagnosisId);
      }
      toast.error(error instanceof Error ? error.message : 'Erro ao processar diagnóstico. Tente novamente.');
      setCurrentStep(2);
      setIsProcessing(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && canProceedStep1) setCurrentStep(2);
    else if (currentStep === 2 && canProceedStep2) handleStartProcessing();
  };

  const handleBack = () => {
    if (currentStep > 1 && !isProcessing) setCurrentStep(currentStep - 1);
  };

  const blocked = !accessLoading && !!access && !access.is_admin && (!access.has_subscription || (access.looks_remaining ?? 0) <= 0);

  return (
    <Layout>
      {(authLoading || accessLoading) ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : blocked ? (
        <PlanLimitGuard access={access} />
      ) : (
      <div className="min-h-screen py-6 sm:py-8">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="font-serif font-bold text-gradient-gold mb-2">Novo Diagnóstico</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Complete as etapas para receber seu look personalizado</p>
            {access && !access.is_admin && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-xs text-primary font-medium">Diagnósticos restantes: {access.looks_remaining}</span>
              </div>
            )}
          </div>

          <div className="mb-6 sm:mb-8">
            <div className="flex justify-between mb-4 gap-2">
              {steps.map((step) => (
                <div key={step.id} className={`flex flex-col items-center flex-1 min-w-0 ${step.id <= currentStep ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 mb-2 transition-all text-sm sm:text-base ${
                    step.id < currentStep ? 'bg-primary border-primary text-primary-foreground'
                    : step.id === currentStep ? 'border-primary text-primary' : 'border-muted-foreground'
                  }`}>{step.id}</div>
                  <span className="text-xs sm:text-sm font-medium truncate max-w-full">{step.name}</span>
                </div>
              ))}
            </div>
            <Progress value={progress} className="h-2 bg-muted" />
          </div>

          <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 md:p-8 shadow-xl">
            {currentStep === 1 && (
              <div>
                <PhotoUploadStep photos={photos} setPhotos={setPhotos} />
              </div>
            )}
            {currentStep === 2 && (
              <div>
                <QuestionnaireStep
                  questionnaire={questionnaire}
                  setQuestionnaire={setQuestionnaire}
                  currentBlock={currentBlock}
                  setCurrentBlock={setCurrentBlock}
                />
              </div>
            )}
            {currentStep === 3 && (
              <ProcessingStep
                diagnosisId={diagnosisId}
                onComplete={(id) => {
                  toast.success('Diagnóstico concluído!');
                  navigate(`/diagnosis/${id}`);
                }}
              />
            )}
          </div>

          {!isProcessing && (
            <div className="flex justify-between gap-3 mt-6 sm:mt-8">
              <Button variant="outline" onClick={handleBack} disabled={currentStep === 1} className="gap-2 flex-1 sm:flex-none">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
              <Button variant="premium" onClick={handleNext} disabled={(currentStep === 1 && !canProceedStep1) || (currentStep === 2 && !canProceedStep2)} className="gap-2 flex-1 sm:flex-none">
                <span className="truncate">{currentStep === 2 ? 'Iniciar Análise' : 'Próximo'}</span> <ChevronRight className="w-4 h-4 shrink-0" />
              </Button>
            </div>
          )}
        </div>
      </div>
      )}
      <AlertDialog open={showResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Continuar diagnóstico?</AlertDialogTitle>
            <AlertDialogDescription>
              Encontramos um diagnóstico em andamento. Deseja continuar de onde parou ou iniciar novamente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleResumeRestart}>Iniciar novamente</AlertDialogCancel>
            <AlertDialogAction onClick={handleResumeContinue}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

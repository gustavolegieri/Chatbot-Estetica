import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { PageTransition, fadeInUp, staggerContainer } from '@/components/layout/PageTransition';
import { ArrowLeft, Camera, Save, Loader2, User, Ruler, Palette } from 'lucide-react';
import { ProfileSkeleton } from '@/components/shared/PageLoadingSkeleton';

interface ProfileData {
  full_name: string | null;
  avatar_url: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  top_size: string | null;
  bottom_size: string | null;
  shoe_size: string | null;
  body_type: string | null;
  body_notes: string | null;
  hair_color: string | null;
  eye_color: string | null;
  skin_tone: string | null;
  fit_preference: string | null;
  formality_level: string | null;
  preferences: {
    style_goals?: string;
    favorite_colors?: string;
    body_concerns?: string;
    preferred_brands?: string;
  };
}

const hairColors = [
  'Preto', 'Castanho escuro', 'Castanho médio', 'Castanho claro',
  'Loiro escuro', 'Loiro médio', 'Loiro claro', 'Ruivo', 'Grisalho', 'Branco',
];
const eyeColors = ['Castanho escuro', 'Castanho claro', 'Mel', 'Verde', 'Azul', 'Cinza'];
const skinTones = ['Muito clara', 'Clara', 'Clara média', 'Média', 'Média escura', 'Escura', 'Muito escura'];

const preferenceFields = [
  { key: 'style_goals', label: 'Objetivos de Estilo', placeholder: 'Ex: Parecer mais profissional, casual chique...' },
  { key: 'favorite_colors', label: 'Cores Favoritas', placeholder: 'Ex: Azul marinho, bordô, bege...' },
  { key: 'body_concerns', label: 'Preocupações com o Corpo', placeholder: 'Ex: Valorizar cintura, alongar silhueta...' },
  { key: 'preferred_brands', label: 'Marcas Preferidas', placeholder: 'Ex: Zara, Farm, Amaro...' },
] as const;

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '', avatar_url: null,
    height_cm: null, weight_kg: null, top_size: null, bottom_size: null,
    shoe_size: null, body_type: null, body_notes: null,
    hair_color: null, eye_color: null, skin_tone: null,
    fit_preference: null, formality_level: null,
    preferences: {},
  });

  useEffect(() => {
    if (!authLoading && !user) { navigate('/auth'); return; }
    if (user) fetchProfile();
  }, [user, authLoading]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setProfile({
          full_name: data.full_name,
          avatar_url: data.avatar_url,
          height_cm: (data as any).height_cm ?? null,
          weight_kg: (data as any).weight_kg ?? null,
          top_size: (data as any).top_size ?? null,
          bottom_size: (data as any).bottom_size ?? null,
          shoe_size: (data as any).shoe_size ?? null,
          body_type: (data as any).body_type ?? null,
          body_notes: (data as any).body_notes ?? null,
          hair_color: (data as any).hair_color ?? null,
          eye_color: (data as any).eye_color ?? null,
          skin_tone: (data as any).skin_tone ?? null,
          fit_preference: (data as any).fit_preference ?? null,
          formality_level: (data as any).formality_level ?? null,
          preferences: (data.preferences as ProfileData['preferences']) || {},
        });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('A imagem deve ter no máximo 2MB'); return; }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user!.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('diagnosis-photos').upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('diagnosis-photos').getPublicUrl(path);
      const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('user_id', user!.id);
      setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
      toast.success('Avatar atualizado!');
    } catch (err) {
      console.error('Avatar upload error:', err);
      toast.error('Erro ao enviar avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    if (!profile.full_name?.trim()) { toast.error('Nome é obrigatório'); setSaving(false); return; }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          preferences: profile.preferences as unknown as Json,
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          top_size: profile.top_size,
          bottom_size: profile.bottom_size,
          shoe_size: profile.shoe_size,
          body_type: profile.body_type,
          body_notes: profile.body_notes,
          hair_color: profile.hair_color,
          eye_color: profile.eye_color,
          skin_tone: profile.skin_tone,
          fit_preference: profile.fit_preference,
          formality_level: profile.formality_level,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('user_id', user!.id);
      if (error) throw error;
      toast.success('Perfil salvo com sucesso!');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return <Layout><ProfileSkeleton /></Layout>;
  }

  return (
    <PageTransition>
      <Layout>
        <div className="container max-w-2xl mx-auto px-4 py-12">
          <motion.div className="flex items-center gap-4 mb-10" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Button variant="ghost" size="icon" onClick={() => navigate('/account')}><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <h1 className="text-3xl font-serif font-bold text-gradient-gold">Meu Perfil</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </motion.div>

          {/* Avatar */}
          <motion.div className="flex flex-col items-center mb-10" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.4 }}>
            <div className="relative w-24 h-24 rounded-full bg-muted border-2 border-primary/30 overflow-hidden cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><User className="w-10 h-10 text-muted-foreground" /></div>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
            <p className="text-xs text-muted-foreground mt-2">Clique para alterar</p>
          </motion.div>

          <motion.div className="space-y-8" variants={staggerContainer} initial="initial" animate="animate">
            {/* Name */}
            <motion.div variants={fadeInUp}>
              <Label htmlFor="fullName" className="text-foreground font-medium">Nome Completo</Label>
              <Input id="fullName" value={profile.full_name || ''} onChange={e => setProfile(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Seu nome completo" className="mt-2" maxLength={100} />
            </motion.div>

            {/* Biometric Data */}
            <motion.div variants={fadeInUp}>
              <div className="flex items-center gap-2 mb-4">
                <Ruler className="w-4 h-4 text-primary" />
                <h2 className="text-xl font-serif font-bold text-gradient-gold">Dados Corporais</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Essas informações são fixas e serão usadas em todos os seus diagnósticos.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Altura (cm)</Label>
                  <Input type="number" placeholder="165" value={profile.height_cm ?? ''} onChange={e => setProfile(prev => ({ ...prev, height_cm: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Peso (kg)</Label>
                  <Input type="number" placeholder="60" value={profile.weight_kg ?? ''} onChange={e => setProfile(prev => ({ ...prev, weight_kg: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Tipo Corporal</Label>
                  <Select value={profile.body_type || ''} onValueChange={v => setProfile(prev => ({ ...prev, body_type: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ampulheta">Ampulheta</SelectItem>
                      <SelectItem value="pera">Triângulo (Pera)</SelectItem>
                      <SelectItem value="triangulo_invertido">Triângulo Invertido</SelectItem>
                      <SelectItem value="retangulo">Retângulo</SelectItem>
                      <SelectItem value="oval">Oval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Tam. Superior</Label>
                  <Select value={profile.top_size || ''} onValueChange={v => setProfile(prev => ({ ...prev, top_size: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>{['PP','P','M','G','GG'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Tam. Inferior</Label>
                  <Select value={profile.bottom_size || ''} onValueChange={v => setProfile(prev => ({ ...prev, bottom_size: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>{Array.from({length:10},(_,i)=>34+i*2).map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Tam. Calçado</Label>
                  <Select value={profile.shoe_size || ''} onValueChange={v => setProfile(prev => ({ ...prev, shoe_size: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>{Array.from({length:12},(_,i)=>33+i).map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <Label className="text-foreground text-xs">Observações corporais</Label>
                <Textarea placeholder="Ex: Tenho pernas curtas em relação ao tronco..." value={profile.body_notes || ''} onChange={e => setProfile(prev => ({ ...prev, body_notes: e.target.value }))} className="min-h-[60px]" maxLength={500} />
              </div>
            </motion.div>

            {/* Coloring */}
            <motion.div variants={fadeInUp}>
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-primary" />
                <h2 className="text-xl font-serif font-bold text-gradient-gold">Coloração</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Cor do Cabelo</Label>
                  <Select value={profile.hair_color || ''} onValueChange={v => setProfile(prev => ({ ...prev, hair_color: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>{hairColors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Cor dos Olhos</Label>
                  <Select value={profile.eye_color || ''} onValueChange={v => setProfile(prev => ({ ...prev, eye_color: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>{eyeColors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Tom de Pele</Label>
                  <Select value={profile.skin_tone || ''} onValueChange={v => setProfile(prev => ({ ...prev, skin_tone: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>{skinTones.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </motion.div>

            {/* Fit & Formality */}
            <motion.div variants={fadeInUp}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Preferência de Modelagem</Label>
                  <Select value={profile.fit_preference || ''} onValueChange={v => setProfile(prev => ({ ...prev, fit_preference: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ajustado">Ajustado ao corpo</SelectItem>
                      <SelectItem value="solto">Solto e confortável</SelectItem>
                      <SelectItem value="estruturado">Estruturado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Nível de Formalidade</Label>
                  <Select value={profile.formality_level || ''} onValueChange={v => setProfile(prev => ({ ...prev, formality_level: v }))}>
                    <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixo">Casual e despojado</SelectItem>
                      <SelectItem value="medio">Equilibrado</SelectItem>
                      <SelectItem value="alto">Formal e refinado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </motion.div>

            {/* Preferences */}
            <motion.div variants={fadeInUp}>
              <h2 className="text-xl font-serif font-bold text-gradient-gold mb-4">Preferências Pessoais</h2>
              <div className="space-y-4">
                {preferenceFields.map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={key} className="text-foreground text-xs font-medium">{label}</Label>
                    <Input id={key} value={profile.preferences[key] || ''} onChange={e => setProfile(prev => ({ ...prev, preferences: { ...prev.preferences, [key]: e.target.value } }))} placeholder={placeholder} />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Save */}
            <motion.div variants={fadeInUp} className="pt-4">
              <Button variant="premium" size="lg" className="w-full gap-2" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Alterações
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </Layout>
    </PageTransition>
  );
}

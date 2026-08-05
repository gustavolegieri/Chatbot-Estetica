import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { FunctionsHttpError } from '@supabase/supabase-js';

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Você deve aceitar os termos' }) }),
});

const signInSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  const [isForgotPassword, setIsForgotPassword] = useState(searchParams.get('forgot') === 'password');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/account');
    }
  }, [user, navigate]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) {
      setErrors({ email: 'Informe seu email' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        formData.email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (error) throw error;
      toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
      setIsForgotPassword(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao enviar email';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      if (isSignUp) {
        const result = signUpSchema.safeParse({ ...formData, acceptTerms });
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }

        const { error } = await signUp(formData.email, formData.password, formData.fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este email já está cadastrado. Tente fazer login.');
          } else {
            toast.error(error.message);
          }
        } else {
          // Register terms acceptance timestamp on profile (best-effort)
          try {
            const { data: { user: u } } = await supabase.auth.getUser();
            if (u) {
              await supabase.from('profiles').update({ terms_accepted_at: new Date().toISOString() } as never).eq('user_id', u.id);
            }
          } catch { /* non-blocking */ }
          toast.success('Conta criada com sucesso!');
        }
      } else {
        const result = signInSchema.safeParse(formData);
        if (!result.success) {
          const fieldErrors: Record<string, string> = {};
          result.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setLoading(false);
          return;
        }

        const { error } = await signIn(formData.email, formData.password);
        if (error) {
          if (error.message.includes('Invalid login')) {
            toast.error('Email ou senha incorretos.');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Bem-vinda de volta!');
          navigate('/account');
        }
      }
    } catch (err) {
      toast.error('Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-24 py-12">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8 self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <div className="mb-8">
          <Logo />
        </div>

        <h1 className="font-serif text-3xl md:text-4xl text-gradient-gold mb-2">
          {isForgotPassword ? 'Recuperar Senha' : isSignUp ? 'Crie sua Conta' : 'Bem-vinda de Volta'}
        </h1>
        <p className="text-muted-foreground mb-8">
          {isForgotPassword
            ? 'Informe seu email para receber o link de recuperação.'
            : isSignUp 
              ? 'Comece sua jornada de transformação pessoal.' 
              : 'Entre para acessar seu diagnóstico personalizado.'}
        </p>

        {isForgotPassword ? (
          <form onSubmit={handleForgotPassword} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-card border-border focus:border-primary"
              />
              {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
            </div>
            <Button type="submit" variant="premium" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
            </Button>
            <p className="text-center">
              <button
                type="button"
                onClick={() => setIsForgotPassword(false)}
                className="text-primary hover:underline font-medium text-sm"
              >
                Voltar ao login
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="bg-card border-border focus:border-primary"
                />
                {errors.fullName && <p className="text-destructive text-sm">{errors.fullName}</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-card border-border focus:border-primary"
              />
              {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-primary hover:underline text-sm font-medium"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-card border-border focus:border-primary pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-destructive text-sm">{errors.password}</p>}
            </div>

            {isSignUp && (
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="acceptTerms"
                    checked={acceptTerms}
                    onCheckedChange={(v) => setAcceptTerms(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="acceptTerms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                    Li e aceito os{' '}
                    <Link to="/terms" target="_blank" className="text-primary hover:underline">Termos de Uso</Link>,{' '}
                    a <Link to="/privacy" target="_blank" className="text-primary hover:underline">Política de Privacidade</Link>{' '}
                    e a <Link to="/cookies" target="_blank" className="text-primary hover:underline">Política de Cookies</Link>.
                  </Label>
                </div>
                {errors.acceptTerms && <p className="text-destructive text-sm">{errors.acceptTerms}</p>}
              </div>
            )}

            <Button type="submit" variant="premium" size="lg" className="w-full" disabled={loading}>
              {loading ? 'Carregando...' : isSignUp ? 'Criar Conta' : 'Entrar'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-muted-foreground">
          {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary hover:underline font-medium"
          >
            {isSignUp ? 'Faça login' : 'Cadastre-se'}
          </button>
        </p>
      </div>

      {/* Right side - Decorative */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-card via-background to-card items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-center px-12">
          <h2 className="font-serif text-4xl text-gradient-gold mb-4">
            Descubra sua Essência
          </h2>
          <p className="text-muted-foreground text-lg">
            Nossa tecnologia de IA avançada analisa suas características únicas para criar um guia de estilo personalizado.
          </p>
        </div>
      </div>
    </div>
  );
}

async function getPasswordResetErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.message) return body.message;
    } catch { /* ignore malformed error body */ }
  }

  return error instanceof Error ? error.message : 'Erro ao enviar email';
}

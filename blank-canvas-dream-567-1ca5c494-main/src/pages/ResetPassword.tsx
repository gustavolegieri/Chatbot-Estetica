import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const resetSchema = z.object({
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;

    const confirmRecoverySession = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      const isRecoveryHash = hashParams.get('type') === 'recovery' || Boolean(hashParams.get('access_token'));

      if (hashParams.get('error') || searchParams.get('error')) {
        if (mounted) setRecoveryStatus('invalid');
        return;
      }

      if (isRecoveryHash) {
        if (mounted) setRecoveryStatus('valid');
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (mounted) {
          setRecoveryStatus(error ? 'invalid' : 'valid');
          if (!error) window.history.replaceState({}, document.title, '/reset-password');
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) setRecoveryStatus(session ? 'valid' : 'invalid');
    };

    confirmRecoverySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryStatus('valid');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleBackToLogin = async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = resetSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: formData.password });
      if (error) throw error;
      toast.success('Senha atualizada com sucesso!');
      navigate('/account');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro ao atualizar senha';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (recoveryStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Logo />
          <p className="text-muted-foreground">Validando link de recuperação...</p>
        </div>
      </div>
    );
  }

  if (recoveryStatus === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Logo />
          <p className="text-muted-foreground">Link de recuperação inválido ou expirado.</p>
          <Button variant="premium" onClick={() => navigate('/auth?forgot=password', { replace: true })}>
            Solicitar novo link
          </Button>
          <Button variant="ghost" onClick={handleBackToLogin}>
            Voltar ao Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <button
          onClick={handleBackToLogin}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao login
        </button>

        <div>
          <Logo />
          <h1 className="font-serif text-3xl text-gradient-gold mt-6 mb-2">Nova Senha</h1>
          <p className="text-muted-foreground">Digite sua nova senha abaixo.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password">Nova Senha</Label>
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

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Senha</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="bg-card border-border focus:border-primary"
            />
            {errors.confirmPassword && <p className="text-destructive text-sm">{errors.confirmPassword}</p>}
          </div>

          <Button type="submit" variant="premium" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar Senha'}
          </Button>
        </form>
      </div>
    </div>
  );
}

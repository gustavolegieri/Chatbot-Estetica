import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { PageTransition, fadeInUp, staggerContainer } from '@/components/layout/PageTransition';
import { format } from 'date-fns';
import { usePlanAccess } from '@/hooks/usePlanAccess';

import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  Plus, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  Sparkles,
  Crown,
  Calendar,
  LogOut,
  Settings,
  CalendarIcon,
  Filter,
  AlertCircle,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';

interface Diagnosis {
  id: string;
  status: string;
  created_at: string;
}

interface Subscription {
  status: string;
  plan: string;
  current_period_end: string | null;
}

type StatusFilter = 'all' | 'completed' | 'processing' | 'pending';

const ITEMS_PER_PAGE = 6;

const statusLabels: Record<string, string> = {
  completed: 'Concluído',
  processing: 'Em processamento',
  pending: 'Pendente',
};

const statusIcons: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-5 w-5 text-accent" />,
  processing: <Clock className="h-5 w-5 text-primary animate-pulse" />,
  pending: <AlertCircle className="h-5 w-5 text-muted-foreground" />,
};

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { access: planAccess } = usePlanAccess();
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [diagnosesRes, subscriptionRes] = await Promise.all([
        supabase
          .from('diagnoses')
          .select('id, status, created_at')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('subscriptions')
          .select('status, plan, current_period_end')
          .eq('user_id', user?.id)
          .maybeSingle(),
      ]);

      if (diagnosesRes.data) {
        setDiagnoses(diagnosesRes.data);
      }
      if (subscriptionRes.data) {
        setSubscription(subscriptionRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const filteredDiagnoses = useMemo(() => {
    return diagnoses.filter(d => {
      if (d.status === 'deleted') return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      const date = new Date(d.created_at);
      if (dateFrom && date < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (date > end) return false;
      }
      return true;
    });
  }, [diagnoses, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredDiagnoses.length / ITEMS_PER_PAGE));
  const paginatedDiagnoses = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDiagnoses.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDiagnoses, currentPage]);

  const hasActiveFilters = statusFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
    setCurrentPage(1);
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, dateFrom, dateTo]);

  const handleStartDiagnosis = () => {
    navigate('/new-diagnosis');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir este diagnóstico?')) return;
    try {
      const { error } = await supabase.from('diagnoses').update({ status: 'deleted' }).eq('id', id);
      if (error) throw error;
      setDiagnoses(prev => prev.map(d => d.id === id ? { ...d, status: 'deleted' } : d));
      toast.success('Diagnóstico excluído');
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  if (loading || loadingData) {
    return (
      <Layout>
        <DashboardSkeleton />
      </Layout>
    );
  }

  const hasActiveSubscription = subscription?.status === 'active';


  // Stats
  const completedCount = diagnoses.filter(d => d.status === 'completed').length;
  const processingCount = diagnoses.filter(d => d.status === 'processing').length;

  return (
    <PageTransition>
      <Layout>
        <div className="container mx-auto px-4 py-12">
          {/* Header */}
          <motion.div className="mb-12" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="font-serif text-4xl md:text-5xl text-gradient-gold mb-2">
              Olá, {user?.user_metadata?.full_name?.split(' ')[0] || 'Bem-vinda'}!
            </h1>
            <p className="text-muted-foreground text-lg">
              Gerencie seus diagnósticos e acompanhe sua jornada de estilo.
            </p>
            <div className="flex flex-wrap gap-2 sm:gap-3 mt-4">
              <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>
                <Settings className="mr-2 h-4 w-4" /> Meu Perfil
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/pricing')}>
                <Crown className="mr-2 h-4 w-4" /> Planos
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </Button>
            </div>
          </motion.div>

          {/* Subscription Status */}
          <motion.div
            className="glass-card rounded-2xl p-6 md:p-8 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${hasActiveSubscription ? 'bg-primary/20' : 'bg-muted'}`}>
                  <Crown className={`h-6 w-6 ${hasActiveSubscription ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h3 className="font-medium text-lg">
                    {hasActiveSubscription ? (planAccess?.plan_name || 'Assinatura Ativa') : 'Sem Assinatura'}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {hasActiveSubscription
                      ? (planAccess?.is_admin
                          ? 'Acesso total (admin)'
                          : `${planAccess?.looks_used ?? 0} de ${planAccess?.looks_per_month ?? '—'} diagnósticos usados neste período`)
                      : 'Assine para acessar diagnósticos personalizados'}
                  </p>
                </div>

              </div>
              {!hasActiveSubscription && (
                <Button variant="premium" onClick={() => navigate('/pricing')}>
                  Assinar Agora
                </Button>
              )}
              {hasActiveSubscription && subscription?.current_period_end && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Renova em {new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}
                </div>
              )}
            </div>
          </motion.div>

          {/* Stats + New Diagnosis */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            <motion.div variants={fadeInUp} className="glass-card rounded-xl p-5 text-center">
              <div className="text-3xl font-serif text-primary">{diagnoses.length}</div>
              <p className="text-sm text-muted-foreground mt-1">Total</p>
            </motion.div>
            <motion.div variants={fadeInUp} className="glass-card rounded-xl p-5 text-center">
              <div className="text-3xl font-serif text-accent">{completedCount}</div>
              <p className="text-sm text-muted-foreground mt-1">Concluídos</p>
            </motion.div>
            <motion.div variants={fadeInUp} className="glass-card rounded-xl p-5 text-center">
              <div className="text-3xl font-serif text-primary">{processingCount}</div>
              <p className="text-sm text-muted-foreground mt-1">Em andamento</p>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <button
                onClick={handleStartDiagnosis}
                className="glass-card rounded-xl p-5 w-full h-full flex flex-col items-center justify-center hover:border-primary/50 transition-all group"
              >
                <Plus className="h-7 w-7 text-primary mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-primary">Novo</span>
              </button>
            </motion.div>
          </motion.div>

          {/* History with Filters */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h2 className="font-serif text-2xl text-gradient-gold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Histórico de Diagnósticos
              </h2>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                  <X className="h-3 w-3" /> Limpar filtros
                </Button>
              )}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 mb-6">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="processing">Em processamento</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full lg:w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full lg:w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>


            {/* Results count */}
            {hasActiveFilters && (
              <p className="text-sm text-muted-foreground mb-4">
                {filteredDiagnoses.length} de {diagnoses.length} diagnóstico(s)
              </p>
            )}

            {/* List */}
            {filteredDiagnoses.length > 0 ? (
              <>
                <motion.div className="space-y-3" variants={staggerContainer} initial="initial" animate="animate">
                  {paginatedDiagnoses.map((diagnosis) => (
                    <motion.div
                      key={diagnosis.id}
                      variants={fadeInUp}
                      className="glass-card rounded-xl p-5 flex items-center justify-between hover:border-primary/30 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/diagnosis/${diagnosis.id}`)}
                      whileHover={{ x: 4 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          diagnosis.status === 'completed' ? 'bg-accent/20' : 
                          diagnosis.status === 'processing' ? 'bg-primary/20' : 'bg-muted'
                        }`}>
                          {statusIcons[diagnosis.status] || statusIcons.pending}
                        </div>
                        <div>
                          <h4 className="font-medium">
                            Diagnóstico de {new Date(diagnosis.created_at).toLocaleDateString('pt-BR')}
                          </h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              diagnosis.status === 'completed' ? 'bg-accent/10 text-accent' :
                              diagnosis.status === 'processing' ? 'bg-primary/10 text-primary' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {statusLabels[diagnosis.status] || 'Pendente'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(diagnosis.created_at), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDelete(e, diagnosis.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Anterior
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        size="sm"
                        className="w-9 h-9 p-0"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Próximo
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon={hasActiveFilters ? undefined : <Sparkles className="h-10 w-10 text-primary/60" />}
                title={hasActiveFilters ? 'Nenhum resultado' : 'Nenhum diagnóstico ainda'}
                description={
                  hasActiveFilters
                    ? 'Nenhum diagnóstico encontrado com esses filtros. Tente ajustar os critérios.'
                    : 'Comece sua jornada de estilo! Faça seu primeiro diagnóstico com inteligência artificial e descubra seu potencial.'
                }
                actionLabel={hasActiveFilters ? undefined : 'Fazer meu primeiro diagnóstico'}
                onAction={hasActiveFilters ? undefined : handleStartDiagnosis}
              />
            )}
          </motion.div>
        </div>
      </Layout>
    </PageTransition>
  );
}

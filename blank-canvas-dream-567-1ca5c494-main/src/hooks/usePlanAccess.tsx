import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PlanAccess {
  is_admin: boolean;
  has_subscription: boolean;
  plan_id?: string;
  plan_name?: string;
  looks_per_month?: number;
  looks_used?: number;
  looks_remaining?: number;
  can_download_pdf?: boolean;
  can_share?: boolean;
  period_end?: string | null;
}

export function usePlanAccess() {
  const { user } = useAuth();
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setAccess(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_user_plan_access', { _user_id: user.id });
    if (error) {
      console.error('plan access error', error);
      setAccess({ is_admin: false, has_subscription: false });
    } else {
      setAccess((data as unknown as PlanAccess) || { is_admin: false, has_subscription: false });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { access, loading, refetch };
}

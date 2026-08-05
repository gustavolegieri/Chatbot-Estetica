import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'affiliate_ref_code';

export function getStoredAffiliateCode(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function clearStoredAffiliateCode() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function AffiliateTracker() {
  const location = useLocation();
  const { user } = useAuth();

  // Capture ?ref= or path /r/:code and track click
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let code = params.get('ref');
    const rMatch = location.pathname.match(/^\/(?:r|ref)\/([a-z0-9]{4,32})/i);
    if (rMatch) code = rMatch[1];
    if (!code) return;
    code = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!code) return;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* noop */ }
    supabase.rpc('track_affiliate_click' as never, {
      _code: code,
      _path: location.pathname,
      _referrer: document.referrer || null,
      _ua: navigator.userAgent || null,
    } as never).then(() => { /* noop */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // When a user signs in, attach as referral (one-time)
  useEffect(() => {
    if (!user) return;
    const code = getStoredAffiliateCode();
    if (!code) return;
    supabase.rpc('attach_affiliate_referral' as never, { _code: code } as never).then(() => {
      clearStoredAffiliateCode();
    });
  }, [user]);

  return null;
}

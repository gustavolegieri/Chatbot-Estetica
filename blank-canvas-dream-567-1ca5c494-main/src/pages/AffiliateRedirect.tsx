import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';

export default function AffiliateRedirect() {
  const { code } = useParams<{ code: string }>();
  useEffect(() => {
    if (code) {
      try { localStorage.setItem('affiliate_ref_code', code.toLowerCase()); } catch { /* noop */ }
    }
  }, [code]);
  return <Navigate to={`/?ref=${code ?? ''}`} replace />;
}

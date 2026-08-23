import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

export default function AdminPTOGrantInitializer({ user }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !user?.id) return;
    const roles = new Set((user.additional_roles || []).map(role => String(role).toLowerCase()));
    const canApply = user.role === 'admin' || roles.has('hr') || roles.has('full_access');
    if (!canApply) return;
    started.current = true;

    base44.functions.invoke('getPTORequests', { action: 'ensure_admin_grants' })
      .then(response => {
        const payload = response?.data || response || {};
        if (payload.error) console.warn('[PTO] admin grant check:', payload.error);
        if (Number(payload.granted || 0) > 0) {
          window.dispatchEvent(new CustomEvent('bps-directory-user-updated', { detail: { reason: 'pto-admin-grant' } }));
        }
      })
      .catch(error => console.warn('[PTO] admin grant initialization failed:', error?.message));
  }, [user]);

  return null;
}

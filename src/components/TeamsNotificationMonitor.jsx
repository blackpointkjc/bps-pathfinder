import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getTeamsChannelMessages } from '@/lib/teamsGraph';

const rolesFor = user => new Set([user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase()));

export default function TeamsNotificationMonitor({ user }) {
  const seenRef = useRef({});
  const initializedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return undefined;
    const roles = rolesFor(user);
    const canOfficer = user.role === 'admin' || roles.has('officer') || roles.has('full_access');
    const canSupervisor = user.role === 'admin' || roles.has('supervisor') || roles.has('full_access');
    if (!canOfficer && !canSupervisor) return undefined;

    const tokenKey = `bps:outlook-token:${String(user.id).trim()}`;
    let timer = null;
    let cancelled = false;

    const targets = [
      ...(canOfficer ? [{ key: 'officer_chat', page: 'OfficerChat', label: 'Officer Chat' }] : []),
      ...(canSupervisor ? [{ key: 'supervisor_chat', page: 'SupervisorChat', label: 'Supervisor Chat' }] : []),
    ];

    const poll = async () => {
      if (cancelled || runningRef.current) return;
      let token = null;
      try { token = JSON.parse(localStorage.getItem(tokenKey) || 'null'); } catch {}
      if (!token?.access_token) return;
      runningRef.current = true;
      try {
        for (const target of targets) {
          try {
            const rows = await getTeamsChannelMessages(user.id, null, target.key);
            const ids = new Set((rows || []).map(item => String(item.id)));
            const previous = seenRef.current[target.key] || new Set();
            if (initializedRef.current) {
              const newItems = (rows || []).filter(item => !previous.has(String(item.id)));
              if (newItems.length) {
                const currentPage = window.location.pathname.split('/').filter(Boolean).pop() || '';
                window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: target.page, count: newItems.length } }));
                if (currentPage !== target.page) {
                  const newest = newItems[newItems.length - 1];
                  toast.info(`${target.label} · ${newItems.length === 1 ? 'New message' : `${newItems.length} new messages`}`, {
                    description: `${newest?.sender_name || 'Microsoft Teams'}: ${newest?.message || ''}`.slice(0, 220),
                    duration: 7000,
                  });
                  if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(target.label, { body: `${newest?.sender_name || 'New message'}: ${newest?.message || ''}`.slice(0, 180) });
                  }
                }
              }
            }
            seenRef.current[target.key] = ids;
          } catch (error) {
            if (!/rate limit|429|too many requests/i.test(String(error?.message || ''))) console.warn(`[Teams] ${target.label} notification check failed:`, error?.message);
          }
        }
        initializedRef.current = true;
      } finally {
        runningRef.current = false;
      }
    };

    const schedule = () => {
      if (cancelled) return;
      const currentPage = window.location.pathname.split('/').filter(Boolean).pop() || '';
      const activeChat = currentPage === 'OfficerChat' || currentPage === 'SupervisorChat';
      const delay = document.visibilityState === 'hidden' ? 90000 : activeChat ? 20000 : 60000;
      clearTimeout(timer);
      timer = window.setTimeout(async () => { await poll(); schedule(); }, delay);
    };

    poll().finally(schedule);
    const onFocus = () => poll();
    const onVisibility = () => { if (document.visibilityState === 'visible') poll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id, user?.role, JSON.stringify(user?.additional_roles || [])]);

  return null;
}

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getTeamsChannelMessages } from '@/lib/teamsGraph';

const rolesFor = user => new Set([user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase()));

export default function TeamsNotificationMonitor({ user }) {
  const seenRef = useRef({});
  const initializedRef = useRef(false);
  const runningRef = useRef(false);
  const lastPollRef = useRef({});

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
        const currentPage = window.location.pathname.split('/').filter(Boolean).pop() || '';
        const now = Date.now();
        for (const target of targets) {
          const isActiveTarget = currentPage === target.page;
          const minimumGap = document.visibilityState === 'hidden' ? 120000 : isActiveTarget ? 20000 : 60000;
          if (now - Number(lastPollRef.current[target.key] || 0) < minimumGap) continue;
          lastPollRef.current[target.key] = now;
          try {
            const rows = await getTeamsChannelMessages(user.id, null, target.key);
            window.dispatchEvent(new CustomEvent('bps:teams-channel-data', { detail: { configKey: target.key, page: target.page, rows: rows || [] } }));
            const ids = new Set((rows || []).map(item => String(item.id)));
            const previous = seenRef.current[target.key] || new Set();
            if (initializedRef.current) {
              const newItems = (rows || []).filter(item => !previous.has(String(item.id)));
              if (newItems.length) {
                window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: target.page, count: newItems.length } }));
                if (currentPage !== target.page) {
                  const newest = newItems[newItems.length - 1];
                  toast.info(`${target.label} · ${newItems.length === 1 ? 'New message' : `${newItems.length} new messages`}`, {
                    description: `${newest?.sender_name || 'Microsoft Teams'}: ${newest?.message || ''}`.slice(0, 220),
                    duration: 7000,
                  });
                  // The in-app chat toast above is the only user-facing notification.
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
      // The scheduler wakes frequently but each target enforces its own minimum gap.
      // Active chat: ~20s, other authorized channel: ~60s, background tab: ~120s.
      const delay = document.visibilityState === 'hidden' ? 60000 : activeChat ? 10000 : 30000;
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

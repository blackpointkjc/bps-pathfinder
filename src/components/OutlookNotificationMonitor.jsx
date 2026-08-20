import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getLatestUnreadMail, getOutlookConnectionStatus } from '@/lib/outlookGraph';

export default function OutlookNotificationMonitor({ user }) {
  const initializedRef = useRef(false);
  const seenRef = useRef(new Set());

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await getOutlookConnectionStatus(user.id, user?.email || '');
        if (!status.connected || cancelled) return;
        const unread = await getLatestUnreadMail(user.id);
        if (cancelled) return;

        const ids = new Set((unread || []).map(item => item.id));
        if (!initializedRef.current) {
          seenRef.current = ids;
          initializedRef.current = true;
          return;
        }

        const newItems = (unread || []).filter(item => !seenRef.current.has(item.id));
        seenRef.current = new Set([...ids, ...seenRef.current].slice ? [...ids, ...seenRef.current].slice(0, 250) : [...ids, ...seenRef.current]);

        if (newItems.length > 0) {
          const newest = newItems[0];
          const sender = newest?.from?.emailAddress?.name || newest?.from?.emailAddress?.address || 'New sender';
          toast.info(newItems.length === 1 ? `New Outlook email from ${sender}` : `${newItems.length} new Outlook emails`, {
            description: newest?.subject || newest?.bodyPreview || 'Open Outlook Mail to view.',
            duration: 9000,
          });
          try {
            window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: 'OutlookMail', count: newItems.length } }));
          } catch {}
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newItems.length === 1 ? 'New Outlook Email' : `${newItems.length} New Outlook Emails`, {
              body: `${sender}: ${newest?.subject || 'No subject'}`,
            });
          }
        }
      } catch (error) {
        if (error?.code === 'OUTLOOK_CONNECTION_REQUIRED') {
          try { window.dispatchEvent(new CustomEvent('bps:outlook-connection-changed')); } catch {}
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 30000);
    const onFocus = () => poll();
    const onVisibility = () => { if (document.visibilityState === 'visible') poll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);

  return null;
}

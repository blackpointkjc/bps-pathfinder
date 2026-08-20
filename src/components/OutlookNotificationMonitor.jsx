import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getLatestUnreadMail, getOutlookConnectionStatus, listOutlookFolders, listSavedSharedMailboxes } from '@/lib/outlookGraph';

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
        const shared = await listSavedSharedMailboxes(user.id).catch(() => []);
        const mailboxTargets = [
          { email: '', label: 'My Mailbox' },
          ...(shared || [])
            .filter(item => item.connection_status !== 'needs_attention')
            .map(item => ({ email: item.mailbox_email, label: item.display_name || item.mailbox_email })),
        ]; 

        const batches = await Promise.all(mailboxTargets.map(async target => {
          try {
            const [rows, folders] = await Promise.all([
              getLatestUnreadMail(user.id, target.email),
              listOutlookFolders(user.id, target.email),
            ]);
            const inbox = (folders || []).find(folder => String(folder.displayName || '').toLowerCase() === 'inbox');
            return {
              rows: (rows || []).map(item => ({ ...item, _mailboxEmail: target.email, _mailboxLabel: target.label })),
              unreadCount: Number(inbox?.unreadItemCount || 0),
            };
          } catch {
            return { rows: [], unreadCount: 0 };
          }
        }));
        if (cancelled) return;

        const unread = batches.flatMap(batch => batch.rows || []);
        const totalUnreadCount = batches.reduce((sum, batch) => sum + Number(batch.unreadCount || 0), 0);
        try {
          window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: 'OutlookMail', count: totalUnreadCount, absolute: true } }));
        } catch {}
        const keyOf = item => `${item._mailboxEmail || 'me'}:${item.id}`;
        const ids = new Set(unread.map(keyOf));
        if (!initializedRef.current) {
          seenRef.current = ids;
          initializedRef.current = true;
          return;
        }

        const newItems = unread.filter(item => !seenRef.current.has(keyOf(item)));
        seenRef.current = new Set([...ids, ...seenRef.current].slice(0, 250));

        if (newItems.length > 0) {
          const newest = newItems.sort((a, b) => new Date(b.receivedDateTime || 0) - new Date(a.receivedDateTime || 0))[0];
          const sender = newest?.from?.emailAddress?.name || newest?.from?.emailAddress?.address || 'New sender';
          const mailboxLabel = newest?._mailboxLabel || 'Outlook';
          toast.info(newItems.length === 1 ? `New email in ${mailboxLabel}` : `${newItems.length} new Outlook emails`, {
            description: `${sender}: ${newest?.subject || newest?.bodyPreview || 'Open Outlook Mail to view.'}`,
            duration: 9000,
          });
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newItems.length === 1 ? `New Email · ${mailboxLabel}` : `${newItems.length} New Outlook Emails`, {
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
    window.addEventListener('bps-outlook-refresh', poll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('bps-outlook-refresh', poll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);

  return null;
}

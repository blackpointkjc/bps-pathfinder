import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { getLatestUnreadMail, getOutlookConnectionStatus, listOutlookFolders, listSavedSharedMailboxes } from '@/lib/outlookGraph';

export default function OutlookNotificationMonitor({ user }) {
  const initializedRef = useRef(false);
  const seenRef = useRef(new Set());
  const runningRef = useRef(false);
  const companyTargetsRef = useRef([]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    let timer = null;
    let companyRefreshTimer = null;

    const refreshCompanyTargets = async () => {
      try {
        const result = await base44.functions.invoke('companyImapMail', { action: 'status' });
        const payload = result?.data || result || {};
        companyTargetsRef.current = payload.mailboxes || [];
      } catch {
        companyTargetsRef.current = [];
      }
    };

    const poll = async () => {
      if (cancelled || runningRef.current) return;
      runningRef.current = true;
      try {
        const allUnread = [];
        let totalUnreadCount = 0;

        // Microsoft is optional for non-admin users. Only touch Graph when this
        // browser already has a Microsoft token; this avoids background "verification"
        // traffic for people who use only their company IMAP mailbox.
        let storedToken = null;
        try { storedToken = JSON.parse(localStorage.getItem(`bps:outlook-token:${String(user.id).trim()}`) || 'null'); } catch {}
        if (storedToken?.access_token) {
          const status = await getOutlookConnectionStatus(user.id, user?.email || '').catch(() => ({ connected: false }));
          if (status?.connected) {
            const shared = await listSavedSharedMailboxes(user.id).catch(() => []);
            const mailboxTargets = [
              { email: '', label: 'My Microsoft Mailbox' },
              ...(shared || []).filter(item => item.connection_status === 'verified').map(item => ({ email: item.mailbox_email, label: item.display_name || item.mailbox_email })),
            ];
            for (const target of mailboxTargets) {
              try {
                const [rows, folders] = await Promise.all([
                  getLatestUnreadMail(user.id, target.email),
                  listOutlookFolders(user.id, target.email),
                ]);
                const inbox = (folders || []).find(folder => String(folder.displayName || '').toLowerCase() === 'inbox');
                totalUnreadCount += Number(inbox?.unreadItemCount || 0);
                allUnread.push(...(rows || []).map(item => ({ ...item, _mailboxKey: `ms:${target.email || 'me'}`, _mailboxLabel: target.label })));
              } catch {}
            }
          }
        }

        // Assigned company IMAP mailboxes are checked independently of Microsoft.
        for (const mailbox of companyTargetsRef.current || []) {
          try {
            const result = await base44.functions.invoke('companyImapMail', { action: 'messages', mailbox_id: mailbox.id, folder: 'INBOX', limit: 20 });
            const payload = result?.data || result || {};
            totalUnreadCount += Number(payload.unreadCount || 0);
            allUnread.push(...(payload.messages || []).filter(item => !item.isRead).map(item => ({ ...item, _mailboxKey: `imap:${mailbox.id}`, _mailboxLabel: mailbox.display_name || mailbox.mailbox_email })));
          } catch {}
        }

        if (cancelled) return;
        window.dispatchEvent(new CustomEvent('bps-unread-notification', { detail: { page: 'OutlookMail', count: totalUnreadCount, absolute: true } }));

        const keyOf = item => `${item._mailboxKey}:${item.id}`;
        const ids = new Set(allUnread.map(keyOf));
        if (!initializedRef.current) {
          seenRef.current = ids;
          initializedRef.current = true;
          return;
        }

        const newItems = allUnread.filter(item => !seenRef.current.has(keyOf(item)));
        seenRef.current = new Set([...ids, ...seenRef.current].slice(0, 400));
        if (newItems.length) {
          window.dispatchEvent(new CustomEvent('bps:mail-new-items', { detail: { items: newItems } }));
          window.dispatchEvent(new CustomEvent('bps-mail-new-message', { detail: { count: newItems.length } }));
          const newest = [...newItems].sort((a, b) => new Date(b.receivedDateTime || 0) - new Date(a.receivedDateTime || 0))[0];
          const sender = newest?.from?.emailAddress?.name || newest?.from?.emailAddress?.address || 'New sender';
          const label = newest?._mailboxLabel || 'Mail';
          toast.info(newItems.length === 1 ? `New email in ${label}` : `${newItems.length} new emails`, {
            description: `${sender}: ${newest?.subject || newest?.bodyPreview || 'Open Mail Center to view.'}`,
            duration: 8000,
          });
          // The in-app mail toast above is the only user-facing notification.
        }
      } finally {
        runningRef.current = false;
      }
    };

    const schedule = () => {
      if (cancelled) return;
      const currentPage = window.location.pathname.split('/').filter(Boolean).pop() || '';
      const delay = document.visibilityState === 'hidden' ? 120000 : currentPage === 'OutlookMail' ? 30000 : 60000;
      clearTimeout(timer);
      timer = window.setTimeout(async () => { await poll(); schedule(); }, delay);
    };

    refreshCompanyTargets().then(() => poll()).finally(schedule);
    companyRefreshTimer = window.setInterval(refreshCompanyTargets, 10 * 60 * 1000);
    const onFocus = () => poll();
    const onVisibility = () => { if (document.visibilityState === 'visible') poll(); };
    const onRefresh = () => { refreshCompanyTargets(); poll(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('bps-outlook-refresh', onRefresh);
    window.addEventListener('bps:outlook-shared-mailboxes-changed', onRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(companyRefreshTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('bps-outlook-refresh', onRefresh);
      window.removeEventListener('bps:outlook-shared-mailboxes-changed', onRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id, user?.email]);

  return null;
}

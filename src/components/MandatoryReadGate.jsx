import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, MessageCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

const activeAnnouncement = announcement => {
  const created = new Date(announcement.created_date || 0).getTime();
  if (!created) return false;
  const ageDays = (Date.now() - created) / 86400000;
  if (announcement.priority === 'urgent') return ageDays <= 30;
  if (announcement.priority === 'important') return ageDays <= 14;
  return ageDays <= 7;
};

export default function MandatoryReadGate({ user }) {
  const qc = useQueryClient();
  const [working, setWorking] = useState(false);
  const enabled = !!user?.id && user?.role !== 'admin';

  const { data: announcements = [] } = useQuery({
    queryKey: ['mandatoryAnnouncements'],
    queryFn: () => base44.entities.Announcement.list('-created_date', 100),
    enabled,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ['announcementReceipts', user?.email],
    queryFn: () => base44.entities.AnnouncementReceipt.filter({ user_email: user.email }, '-read_at', 500),
    enabled: enabled && !!user?.email,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: directMessages = [] } = useQuery({
    queryKey: ['mandatoryDirectMessages', user?.id],
    queryFn: () => base44.entities.Message.filter({ recipient_id: user.id, read: false }, '-created_date', 200),
    enabled,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  const { data: mentions = [] } = useQuery({
    queryKey: ['mandatoryChatMentions', user?.email],
    queryFn: () => base44.entities.ChatMention.filter({ recipient_email: user.email, read: false }, '-created_date', 200),
    enabled: enabled && !!user?.email,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });

  const queue = useMemo(() => {
    if (!enabled) return [];
    const receiptIds = new Set(receipts.map(r => r.announcement_id));
    const accountCreated = user?.created_date ? new Date(user.created_date).getTime() : 0;
    const announcementItems = announcements
      .filter(activeAnnouncement)
      .filter(a => !accountCreated || new Date(a.created_date || 0).getTime() >= accountCreated)
      .filter(a => !receiptIds.has(a.id))
      .map(a => ({ type: 'announcement', id: a.id, sort: a.created_date, record: a }));
    const messageItems = directMessages.map(m => ({ type: 'message', id: m.id, sort: m.created_date, record: m }));
    const mentionItems = mentions.map(m => ({ type: 'mention', id: m.id, sort: m.created_date, record: m }));
    return [...announcementItems, ...messageItems, ...mentionItems].sort((a,b) => new Date(a.sort || 0) - new Date(b.sort || 0));
  }, [enabled, announcements, receipts, directMessages, mentions, user?.created_date]);

  const current = queue[0];
  if (!current) return null;

  const markRead = async () => {
    if (working) return;
    setWorking(true);
    try {
      if (current.type === 'announcement') {
        await base44.entities.AnnouncementReceipt.create({ announcement_id: current.id, user_email: user.email, read_at: new Date().toISOString() });
      } else if (current.type === 'message') {
        await base44.entities.Message.update(current.id, { read: true });
      } else {
        await base44.entities.ChatMention.update(current.id, { read: true, read_at: new Date().toISOString() });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['announcementReceipts', user?.email] }),
        qc.invalidateQueries({ queryKey: ['mandatoryDirectMessages', user?.id] }),
        qc.invalidateQueries({ queryKey: ['mandatoryChatMentions', user?.email] }),
      ]);
      window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
    } finally {
      setWorking(false);
    }
  };

  const isAnnouncement = current.type === 'announcement';
  const record = current.record;
  const title = isAnnouncement ? record.title : current.type === 'mention' ? 'Chat Mention' : `Message from ${record.sender_name || record.sender_id || 'Company User'}`;
  const message = isAnnouncement ? record.message : record.message;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-5">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-amber-500/50 bg-[#09121f] text-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-800 bg-[#0d1726] p-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isAnnouncement ? 'bg-amber-500/15 text-amber-300' : 'bg-blue-500/15 text-blue-300'}`}>
            {isAnnouncement ? <Bell className="h-5 w-5"/> : <MessageCircle className="h-5 w-5"/>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Required Reading</div>
            <h2 className="break-words text-lg font-black sm:text-xl">{title}</h2>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-black text-slate-300">1 of {queue.length}</div>
        </div>
        <div className="max-h-[62dvh] overflow-y-auto p-4 sm:p-5">
          {isAnnouncement && record.priority && <div className="mb-3 inline-flex rounded border border-amber-700/60 bg-amber-950/30 px-2 py-1 text-[10px] font-black uppercase text-amber-300">{record.priority}</div>}
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200 sm:text-base">{message}</p>
          {record.photo_url && <img src={record.photo_url} alt="Announcement attachment" className="mt-4 max-h-64 w-full rounded-xl border border-slate-700 object-contain"/>}
          {record.attachment_url && <a href={record.attachment_url} target="_blank" rel="noreferrer" className="mt-4 block break-all rounded-lg border border-blue-700/50 bg-blue-950/20 p-3 text-sm font-bold text-blue-300">Open attached file: {record.attachment_name || 'Attachment'}</a>}
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><span>You must acknowledge this item before using the rest of the application.</span></div>
        </div>
        <div className="border-t border-slate-800 p-3 sm:p-4">
          <button onClick={markRead} disabled={working} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-5 w-5"/>{working ? 'MARKING READ…' : queue.length > 1 ? 'MARK READ & CONTINUE' : 'I HAVE READ THIS'}</button>
        </div>
      </div>
    </div>
  );
}

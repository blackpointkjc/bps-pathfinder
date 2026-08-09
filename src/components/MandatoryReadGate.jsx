import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function MandatoryReadGate({ user }) {
  const qc = useQueryClient();
  const [working, setWorking] = useState(false);
  const enabled = !!user?.id && user?.role !== 'admin';
  const scheduleAlertsEnabled = !!user?.email;

  const { data: directMessages = [] } = useQuery({
    queryKey: ['mandatoryDirectMessages', user?.id],
    queryFn: () => base44.entities.Message.filter({ recipient_id: user.id, read: false }, '-created_date', 200),
    enabled,
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });

  const { data: mentions = [] } = useQuery({
    queryKey: ['mandatoryChatMentions', user?.email],
    queryFn: () => base44.entities.ChatMention.filter({ recipient_email: user.email, read: false }, '-created_date', 200),
    enabled: enabled && !!user?.email,
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });

  const { data: scheduleAlerts = [] } = useQuery({
    queryKey: ['mandatoryScheduleAlerts', user?.email],
    queryFn: async () => {
      const records = await base44.entities.Notification.filter({ recipient_email: user.email, is_read: false }, '-created_date', 200);
      return (records || []).filter(item => item.requires_acknowledgment === true && ['shift_posted', 'schedule_changed'].includes(item.type));
    },
    enabled: scheduleAlertsEnabled,
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });

  const queue = useMemo(() => {
    const scheduleItems = scheduleAlerts.map(n => ({ type: 'schedule', id: n.id, sort: n.created_date, record: n }));
    if (!enabled) return scheduleItems;
    const messageItems = directMessages.map(m => ({ type: 'message', id: m.id, sort: m.created_date, record: m }));
    const mentionItems = mentions.map(m => ({ type: 'mention', id: m.id, sort: m.created_date, record: m }));
    return [...scheduleItems, ...messageItems, ...mentionItems].sort((a,b) => new Date(a.sort || 0) - new Date(b.sort || 0));
  }, [enabled, directMessages, mentions, scheduleAlerts]);

  const current = queue[0];
  if (!current) return null;

  const markRead = async () => {
    if (working) return;
    setWorking(true);
    try {
      if (current.type === 'message') {
        await base44.entities.Message.update(current.id, { read: true });
      } else if (current.type === 'mention') {
        await base44.entities.ChatMention.update(current.id, { read: true, read_at: new Date().toISOString() });
      } else {
        await base44.entities.Notification.update(current.id, { is_read: true, acknowledged_at: new Date().toISOString() });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['mandatoryDirectMessages', user?.id] }),
        qc.invalidateQueries({ queryKey: ['mandatoryChatMentions', user?.email] }),
        qc.invalidateQueries({ queryKey: ['mandatoryScheduleAlerts', user?.email] }),
      ]);
      window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
    } finally {
      setWorking(false);
    }
  };

  const record = current.record;
  const title = current.type === 'schedule'
    ? record.title || 'Schedule Update'
    : current.type === 'mention'
      ? 'Chat Mention'
      : `Message from ${record.sender_name || record.sender_id || 'Company User'}`;
  const message = record.message;

  if (current.type === 'schedule') {
    return (
      <div className="pointer-events-none fixed left-1/2 top-5 z-[10000] w-[min(94vw,760px)] -translate-x-1/2">
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-amber-400/60 bg-[#09121f]/98 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-3 border-b border-slate-800 bg-[#0d1726] p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><AlertTriangle className="h-5 w-5"/></div>
            <div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">{record.source_name || 'System Scheduling'} · Acknowledgment Required</div><h2 className="mt-1 break-words text-lg font-black">{title}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{message}</p></div>
          </div>
          <div className="flex items-center justify-between gap-3 p-3 sm:p-4"><span className="text-xs text-slate-400">This notice stays here until you acknowledge it.</span><button onClick={markRead} disabled={working} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>{working ? 'ACKNOWLEDGING…' : 'ACKNOWLEDGE'}</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-5">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-amber-500/50 bg-[#09121f] text-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-800 bg-[#0d1726] p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
            <MessageCircle className="h-5 w-5"/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Required Reading</div>
            <h2 className="break-words text-lg font-black sm:text-xl">{title}</h2>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-black text-slate-300">1 of {queue.length}</div>
        </div>
        <div className="max-h-[62dvh] overflow-y-auto p-4 sm:p-5">
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200 sm:text-base">{message}</p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><span>You must acknowledge this item before using the rest of the application.</span></div>
        </div>
        <div className="border-t border-slate-800 p-3 sm:p-4">
          <button onClick={markRead} disabled={working} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-5 w-5"/>{working ? 'MARKING READ…' : queue.length > 1 ? 'MARK READ & CONTINUE' : 'I HAVE READ THIS'}</button>
        </div>
      </div>
    </div>
  );
}

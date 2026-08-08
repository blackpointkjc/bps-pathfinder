import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function MandatoryReadGate({ user }) {
  const qc = useQueryClient();
  const [working, setWorking] = useState(false);
  const enabled = !!user?.id && user?.role !== 'admin';

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
    const messageItems = directMessages.map(m => ({ type: 'message', id: m.id, sort: m.created_date, record: m }));
    const mentionItems = mentions.map(m => ({ type: 'mention', id: m.id, sort: m.created_date, record: m }));
    return [...messageItems, ...mentionItems].sort((a,b) => new Date(a.sort || 0) - new Date(b.sort || 0));
  }, [enabled, directMessages, mentions]);

  const current = queue[0];
  if (!current) return null;

  const markRead = async () => {
    if (working) return;
    setWorking(true);
    try {
      if (current.type === 'message') {
        await base44.entities.Message.update(current.id, { read: true });
      } else {
        await base44.entities.ChatMention.update(current.id, { read: true, read_at: new Date().toISOString() });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['mandatoryDirectMessages', user?.id] }),
        qc.invalidateQueries({ queryKey: ['mandatoryChatMentions', user?.email] }),
      ]);
      window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
    } finally {
      setWorking(false);
    }
  };

  const record = current.record;
  const title = current.type === 'mention' ? 'Chat Mention' : `Message from ${record.sender_name || record.sender_id || 'Company User'}`;
  const message = record.message;

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

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Megaphone } from 'lucide-react';

export default function CadVoiceBroadcastButton({ user }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const request = useRef(null);
  if (user?.role !== 'admin') return null;
  const send = async () => {
    if (sending || !message.trim()) return;
    if (!request.current || request.current.message !== message.trim())
      request.current = {message:message.trim(),request_key:crypto.randomUUID()};
    setSendError('');
    setSending(true);
    try {
      const response = await base44.functions.invoke('cad-voice-broadcast', {action:'send',...request.current});
      const result = response?.data || response || {};
      if (!result.success) throw new Error(result.error || 'Announcement was not saved');
      toast.success(`Voice announcement saved for ${result.recipients} on-duty officers.`);
      setMessage(''); request.current = null; setOpen(false);
    } catch (error) {
      const reason = error?.response?.data?.error || error?.message || 'Unable to send announcement';
      setSendError(reason);
      toast.error(reason);
    } finally { setSending(false); }
  };
  return <>
    <button type="button" onClick={() => { setSendError(''); setOpen(true); }} className="flex items-center gap-1 rounded border border-amber-500 px-2 py-1 text-[10px] text-amber-200"><Megaphone className="h-3 w-3" /> VOICE ANNOUNCEMENT</button>
    {open && createPortal(<div className="fixed inset-0 z-[2147482400] flex items-center justify-center bg-black/80 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="cad-voice-title">
      <div className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-4 text-white sm:p-5">
        <h2 id="cad-voice-title" className="text-lg font-bold">CAD voice announcement</h2>
        <p className="my-3 text-sm text-slate-300">Your message will be read aloud to active, on-duty officers on every page. Officers who reconnect during the same shift can hear missed announcements.</p>
        <label className="text-sm" htmlFor="cad-voice-message">Message</label>
        <textarea id="cad-voice-message" autoFocus maxLength={1200} value={message} disabled={sending} onChange={e => setMessage(e.target.value)} className="mt-1 min-h-32 w-full rounded border border-slate-500 bg-slate-950 p-3" />
        {sendError && <p role="alert" className="mt-3 rounded border border-red-500 bg-red-950/60 p-3 text-xs text-red-100">{sendError}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" disabled={sending} onClick={() => setOpen(false)} className="min-h-10 rounded border border-slate-600 px-3">Cancel</button>
          <button type="button" disabled={sending || !message.trim()} onClick={send} className="min-h-10 "rounded bg-amber-500 px-4 py-2 font-bold text-black disabled:opacity-50">{sending ? 'Sending…' : 'Send announcement'}</button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}

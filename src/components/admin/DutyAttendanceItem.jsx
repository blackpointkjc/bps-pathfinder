import { useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';

// One outstanding obligation with its exemption control. Exempting an item removes
// it from job duty and call-out scoring everywhere, and lifts again on request.
export default function DutyAttendanceItem({ item, reason, saving, onExempt, onRestore }) {
  const [open, setOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const canSave = Boolean(reasonText.trim()) && !saving;

  const save = () => {
    if (!canSave) return;
    onExempt(reasonText.trim());
    setOpen(false);
    setReasonText('');
  };

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${item.exempt ? 'border-emerald-500/30 bg-emerald-500/5 text-slate-300' : 'border-slate-800 text-slate-300'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className={`h-3.5 w-3.5 ${item.exempt ? 'text-emerald-300' : 'text-amber-300'}`} />
        <span className="font-bold text-white">{item.date || 'Date missing'}</span>
        <MapPin className="h-3.5 w-3.5 text-slate-500" />
        <span className="truncate">{item.property || 'Assigned post'}</span>
        <span className="w-full text-slate-400 sm:w-auto sm:flex-1">{item.label}</span>
        {item.exempt ? (
          <>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">Exempt</span>
            <button type="button" onClick={onRestore} disabled={saving} className="rounded-md border border-slate-600 px-2.5 py-1 text-[10px] font-bold text-slate-200 hover:border-slate-400 disabled:opacity-50">
              {saving ? 'Saving…' : 'Remove exemption'}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(value => !value)} disabled={saving} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
            {saving ? 'Saving…' : 'Mark exempt'}
          </button>
        )}
      </div>
      {item.exempt && reason && <div className="mt-1 text-[11px] text-emerald-200/80">Reason: {reason}</div>}
      {open && !item.exempt && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={reasonText}
            onChange={event => setReasonText(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') save(); }}
            placeholder="Reason for exemption (required)"
            className="h-9 min-w-[180px] flex-1 border-slate-700 bg-[#08121d] text-xs text-white"
          />
          <button type="button" onClick={save} disabled={!canSave} className="rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-100 disabled:opacity-50">Save</button>
          <button type="button" onClick={() => { setOpen(false); setReasonText(''); }} className="rounded-md border border-slate-600 px-3 py-1.5 text-[11px] font-bold text-slate-300">Cancel</button>
        </div>
      )}
    </div>
  );
}
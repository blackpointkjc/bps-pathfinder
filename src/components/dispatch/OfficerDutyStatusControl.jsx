import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function OfficerDutyStatusControl({ user, status, onChange, saving = false }) {
    const [open,setOpen] = useState(false);
    if (!user) return null;
    const dispatchAccess = user.role === 'dispatch' || user.dispatch_role || (user.additional_roles || []).includes('dispatch');
    const options = ['Available','Enroute','On Scene','Busy','Out of Service', ...(dispatchAccess ? ['Dispatch'] : [])];
    const selected = status || 'Out of Service';
    return <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <button type="button" disabled={saving} aria-label={`My duty status: ${selected}. Unit ${user.unit_number || 'unassigned'}`} className="pointer-events-auto flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-left text-xs text-white shadow-sm disabled:opacity-60">
                <span className={`h-2 w-2 shrink-0 rounded-full ${selected === 'Available' ? 'bg-emerald-400' : selected === 'Out of Service' ? 'bg-slate-400' : 'bg-amber-400'}`} />
                <span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">My status · Unit {user.unit_number || '—'}</span><span className="block truncate font-semibold">{saving ? 'Saving…' : selected}</span></span>
                <span aria-hidden="true" className="shrink-0 text-slate-400">⌄</span>
            </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={12} className="z-[2500] w-[min(300px,calc(100vw-24px))] rounded-xl border border-slate-600 bg-slate-950 p-3 text-white shadow-2xl">
            <h2 className="text-sm font-bold">Change my duty status</h2>
            <p className="mb-3 mt-1 text-xs text-slate-400">Updates your status throughout Pathfinder.</p>
            <div className="grid grid-cols-2 gap-2">
                {options.map(option => <button type="button" key={option} disabled={saving} aria-pressed={selected === option} onClick={() => { setOpen(false); onChange(option); }} className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold disabled:opacity-50 ${selected === option ? 'border-cyan-400 bg-cyan-950 text-cyan-100' : 'border-slate-700 bg-slate-900 hover:border-slate-400'}`}>{option === 'Available' ? 'In Service / Available' : option}</button>)}
            </div>
        </PopoverContent>
    </Popover>;
}

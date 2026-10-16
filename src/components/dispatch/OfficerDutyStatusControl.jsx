export default function OfficerDutyStatusControl({ user, status, onChange, saving = false }) {
    if (!user) return null;
    const dispatchAccess = user.role === 'dispatch' || user.dispatch_role || (user.additional_roles || []).includes('dispatch');
    const options = ['Available','Enroute','On Scene','Busy','Out of Service', ...(dispatchAccess ? ['Dispatch'] : [])];
    const selected = status || 'Out of Service';
    return <div aria-label="My duty controls" className="pointer-events-auto flex flex-wrap items-center gap-2 border-t border-slate-700 bg-[#0a0e1a] px-3 py-2 text-xs text-white">
        <span className="font-bold">Unit {user.unit_number || '—'} · {selected}</span>
        <button type="button" disabled={saving} aria-pressed={selected === 'Available'} onClick={() => onChange('Available')} className={`rounded border px-3 py-1.5 font-bold disabled:opacity-50 ${selected === 'Available' ? 'border-emerald-400 bg-emerald-900 text-emerald-100' : 'border-slate-600 bg-slate-900'}`}>In Service / Available</button>
        <button type="button" disabled={saving} aria-pressed={selected === 'Out of Service'} onClick={() => onChange('Out of Service')} className={`rounded border px-3 py-1.5 font-bold disabled:opacity-50 ${selected === 'Out of Service' ? 'border-slate-400 bg-slate-700' : 'border-slate-600 bg-slate-900'}`}>Out of Service</button>
        <select aria-label="My duty status" disabled={saving} value={selected} onChange={e => onChange(e.target.value)} className="min-w-0 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 disabled:opacity-50">
            {!options.includes(selected) && <option>{selected}</option>}
            {options.map(s => <option key={s}>{s}</option>)}
        </select>
        {saving && <span role="status" className="text-slate-300">Saving…</span>}
    </div>;
}

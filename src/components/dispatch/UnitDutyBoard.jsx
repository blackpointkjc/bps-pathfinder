import { useState } from 'react';
import { comparePersonnel, normalizeRank } from '@/utils/rankPolicy';
import { isOperationalOfficer } from '@/lib/directoryUtils';

export function dutyRows(units = [], calls = [], query = '', status = 'ALL') {
    const terminal = /^(cleared|cancelled|canceled|closed|resolved|completed)$/i;
    return units.filter(isOperationalOfficer).filter(u => u.status && u.status !== 'Dispatch')
        .map(unit => {
            const ids = [unit.id, unit.user_id, unit.officer_id, unit.active_officer_id, unit.email, unit.officer_email].filter(Boolean).map(String);
            const assigned = calls.filter(c => !terminal.test(c.status || '') && !c.manual_dismissed &&
                (String(c.id) === String(unit.current_call_id || '') || (c.assigned_units || []).some(id => ids.includes(String(id)))));
            const assignment = assigned.length ? assigned.map(c => [c.incident || 'Call for service', c.location].filter(Boolean).join(' · ')).join('; ')
                : unit.current_call_info || unit.current_location || 'No active call';
            return { ...unit, assignment };
        }).filter(u => (status === 'ALL' || (status === 'ON_DUTY' ? u.status !== 'Out of Service' : u.status === status)) &&
            [u.rank, u.last_name, u.full_name, u.unit_number, u.assignment].join(' ').toLowerCase().includes(query.toLowerCase()))
        .sort(comparePersonnel);
}

export default function UnitDutyBoard({ units = [], calls = [] }) {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('ON_DUTY');
    const [expanded, setExpanded] = useState(false);
    const rows = dutyRows(units, calls, query, status);
    return <section aria-label="Unit duty status" className="min-w-0 flex-none border-b border-slate-700 bg-[#07111d] p-2 text-slate-200">
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)} className="rounded border border-slate-600 px-3 py-1.5 text-xs font-bold">
                {expanded ? 'Hide units' : 'All units'} · {rows.length}
            </button>
            <span className="text-xs text-slate-400">Duty status & assignments</span>
            {expanded && <>
                <input aria-label="Find unit" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find officer, unit or call" className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs" />
                <select aria-label="Filter duty status" value={status} onChange={e => setStatus(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs">
                    <option value="ON_DUTY">In service</option><option value="ALL">All officers</option>
                    {['Available','Dispatched','Enroute','On Scene','Busy','Out of Service','Distress'].map(s => <option key={s}>{s}</option>)}
                </select>
            </>}
        </div>
        {expanded && <div className="mt-2 grid max-h-[min(36vh,320px)] grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(u => <article key={u.id || u.email || u.officer_email} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-2">
                <div className="flex flex-wrap items-start justify-between gap-1 text-xs">
                    <strong className="min-w-0 break-words">{u.last_name ? [normalizeRank(u.rank),u.last_name].filter(Boolean).join(' ') : u.full_name || u.officer_name || 'Officer'}</strong>
                    <span className="shrink-0 text-slate-400">Unit {u.unit_number || '—'}</span>
                </div>
                <div className={`mt-1 text-xs font-bold ${u.status === 'Available' ? 'text-emerald-300' : u.status === 'Out of Service' ? 'text-slate-400' : 'text-amber-300'}`}>{u.status}</div>
                <p className="mt-1 break-words text-xs text-slate-300">{u.assignment}</p>
            </article>)}
            {!rows.length && <p className="p-2 text-xs text-slate-400">No officers match this view.</p>}
        </div>}
    </section>;
}

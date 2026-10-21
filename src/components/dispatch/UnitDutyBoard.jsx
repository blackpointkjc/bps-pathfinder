import { useState } from 'react';
import { comparePersonnel, normalizeRank } from '@/utils/rankPolicy';
import { isOperationalOfficer } from '@/lib/directoryUtils';

export function dutyRows(units = [], calls = [], query = '', status = 'ALL') {
    const terminal = /^(cleared|cancelled|canceled|closed|resolved|completed)$/i;
    return units.filter(isOperationalOfficer).filter(u => u.status !== 'Dispatch')
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

export default function UnitDutyBoard({ units = [], calls = [], fullPage = false }) {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState(fullPage ? 'ALL' : 'ON_DUTY');
    const [platoon,setPlatoon]=useState('ALL');
    const [expanded, setExpanded] = useState(fullPage);
    const rows = dutyRows(units, calls, query, status).filter(u=>platoon==='ALL'||u.platoon===platoon);
    return <section aria-label="Unit duty status" className="min-w-0 flex-none border-b border-slate-700 bg-[#07111d] p-2 text-slate-200">
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" hidden={fullPage} aria-expanded={expanded} onClick={() => setExpanded(v => !v)} className="rounded border border-slate-600 px-3 py-1.5 text-xs font-bold">
                {expanded ? 'Hide units' : 'All units'} · {rows.length}
            </button>
            <span className="text-xs text-slate-400">{fullPage ? `${rows.length} officers` : 'Duty status & assignments'}</span>
            {expanded && <>
                {fullPage&&<select aria-label="Filter status by platoon" value={platoon} onChange={e=>setPlatoon(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm"><option value="ALL">All platoons</option>{[...new Set(units.map(u=>u.platoon).filter(Boolean))].sort().map(p=><option key={p}>{p}</option>)}</select>}
                <input aria-label="Find unit" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find officer, unit or call" className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs" />
                <select aria-label="Filter duty status" value={status} onChange={e => setStatus(e.target.value)} className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs">
                    <option value="ON_DUTY">In service</option><option value="ALL">All officers</option>
                    {['Available','Dispatched','Enroute','On Scene','Busy','Out of Service','Distress'].map(s => <option key={s}>{s}</option>)}
                </select>
            </>}
        </div>
        {expanded && fullPage ? <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr><th className="p-4">Officer / Unit</th><th className="p-4">Platoon</th><th className="p-4">Duty status</th><th className="p-4">Current assignment</th></tr></thead><tbody className="divide-y divide-slate-800 bg-slate-950">
          {rows.map(u=><tr key={u.id||u.email||u.officer_email} className="hover:bg-slate-900"><td className="p-4"><div className="flex items-center gap-3">{u.profile_photo_url?<img src={u.profile_photo_url} alt="" className="h-11 w-11 rounded-full object-cover"/>:<span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-xs text-cyan-300">{u.unit_number||'—'}</span>}<div><strong className="block text-white">{u.last_name?[normalizeRank(u.rank),u.last_name].filter(Boolean).join(' '):u.officer_name||'Officer'}</strong><span className="text-xs text-slate-400">Unit {u.unit_number||'—'}</span></div></div></td><td className="p-4">{u.platoon||'—'}</td><td className="p-4"><span className={'inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs '+(u.status==='Available'?'border-emerald-700 bg-emerald-950 text-emerald-200':u.status==='Out of Service'?'border-slate-600 text-slate-400':u.status==='Distress'?'border-red-500 bg-red-950 text-red-200':'border-amber-800 bg-amber-950 text-amber-200')}>{u.status}</span></td><td className="max-w-xl p-4 text-slate-300">{u.assignment}</td></tr>)}
        </tbody></table>{!rows.length&&<p className="p-8 text-center text-sm text-slate-400">No officers match these filters.</p>}</div> : expanded && <div className={`mt-2 grid grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 xl:grid-cols-3 ${fullPage ? 'max-h-[calc(100vh-260px)]' : 'max-h-[min(36vh,320px)]'}`}>
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

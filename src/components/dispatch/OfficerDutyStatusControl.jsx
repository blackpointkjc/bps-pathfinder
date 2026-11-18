import { normalizeRank } from '@/utils/rankPolicy';

export function officerDutyStatuses(user) {
    const roles = new Set((user?.additional_roles || []).map(r => String(r).trim().toLowerCase()));
    const fieldRank = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'].includes(normalizeRank(user?.rank));
    const fieldAccess = user?.role === 'admin' || user?.role === 'officer' || user?.is_supervisor || fieldRank || ['full_access','supervisor','officer','cad_access'].some(r => roles.has(r));
    const dispatchAccess = user?.role === 'dispatch' || user?.dispatch_role || roles.has('dispatch');
    return fieldAccess ? ['Available','Enroute','On Scene','Busy','Out of Service', ...(dispatchAccess ? ['Dispatch'] : [])] : ['Dispatch','Available','Out of Service'];
}

const badges = {
    Available:'bg-green-900/40 text-green-300 border-green-600/50',
    Enroute:'bg-yellow-900/40 text-yellow-300 border-yellow-600/50',
    'On Scene':'bg-blue-900/40 text-blue-300 border-blue-600/50',
    Busy:'bg-orange-900/40 text-orange-300 border-orange-600/50',
    'Out of Service':'bg-gray-900/40 text-gray-300 border-gray-600/50',
    Dispatch:'bg-cyan-900/40 text-cyan-300 border-cyan-600/50',
};

export default function OfficerDutyStatusControl({ user, status, onChange, saving = false, statuses, inline = false, compact = false }) {
    if (!user) return null;
    const options = statuses || officerDutyStatuses(user);
    const selected = status || 'Out of Service';
    const name = inline && user.unit_number ? 'Unit ' + user.unit_number : user.rank && user.last_name ? [normalizeRank(user.rank),user.last_name].join(' ') : user.unit_number ? 'Unit ' + user.unit_number : user.full_name || 'My';
    if (compact) return <label className="pf-duty-select"><span>{user.unit_number?'Unit '+user.unit_number:'My status'}</span><select aria-label="My duty status" value={selected} disabled={saving} onChange={event=>onChange(event.target.value)}>{options.map(option=><option key={option} value={option}>{option==='Enroute'?'En route':option}</option>)}</select></label>;
    return <div role="group" aria-label={`My duty status: ${selected}`} className={`command-status-bar flex min-w-0 flex-none flex-wrap items-center gap-x-2 gap-y-1 ${inline ? 'live-map-duty-buttons sm:ml-auto' : 'border-t border-slate-800 bg-slate-900/80 px-3 py-1.5'}`}>
        <span className="min-w-0 break-words font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-400">{name} · Status</span>
        <div className="command-status-options flex min-w-0 flex-wrap items-center gap-1.5">
            {options.map(option => <button type="button" key={option} disabled={saving} aria-label={`Set duty status to ${option}`} aria-pressed={selected === option} onClick={() => onChange(option)} className={`min-h-7 rounded-md border px-2 py-1 font-mono text-[9px] font-bold uppercase transition-colors disabled:opacity-50 ${selected === option ? (badges[option] || badges['Out of Service']) + ' ring-1 ring-current ring-offset-1 ring-offset-slate-900' : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-white'}`}>{option === 'Enroute' ? 'En Route' : option}</button>)}
        </div>
        {saving && <span role="status" className="text-xs text-slate-400">Saving…</span>}
    </div>;
}

import OfficerDutyStatusControl from '@/components/dispatch/OfficerDutyStatusControl';
export default function LiveMapToolbar({ user, status, saving, onStatusChange, onBack, onRecenter, gpsLabel, gpsActive, online, speed, unitCount, callCount, unassignedCount }) {
    return <header aria-label="Live Map controls" className="pointer-events-auto border-b border-slate-700 bg-[#0a1220]/95 text-white shadow-lg backdrop-blur">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
            <button type="button" onClick={onBack} className="flex min-h-9 shrink-0 items-center gap-2 text-sm font-bold"><span aria-hidden="true">←</span> Live Map</button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                <button type="button" onClick={onRecenter} className={`min-w-0 break-words text-left font-semibold ${gpsActive ? 'text-emerald-300' : 'text-amber-300'}`} title="Request a GPS fix and center the map">{gpsLabel}</button>
                <span className={online ? 'text-blue-300' : 'text-red-300'}>{online ? 'Connected' : 'Offline'}</span>
                <span className="whitespace-nowrap text-slate-300">{Math.max(0,Math.round(Number(speed) || 0))} mph</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-300">
                <span className="rounded-md bg-slate-800 px-2 py-1">{unitCount} units</span>
                <span className="rounded-md bg-slate-800 px-2 py-1">{callCount} calls</span>
                {unassignedCount > 0 && <span className="rounded-md bg-red-950 px-2 py-1 text-red-200">{unassignedCount} unassigned</span>}
            </div>
        </div>
        <OfficerDutyStatusControl user={user} status={status} saving={saving} onChange={onStatusChange} />
    </header>;
}

import OfficerDutyStatusControl from '@/components/dispatch/OfficerDutyStatusControl';
export default function LiveMapToolbar({ user, status, saving, onStatusChange, onBack, onRecenter, gpsLabel, gpsActive, online, speed, unitCount, callCount, unassignedCount, fullscreen, onToggleFullscreen }) {
    return <header aria-label="Live Map controls" className="live-map-toolbar pointer-events-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-700 bg-[#0a1220]/95 px-2 py-1 text-white backdrop-blur">
        <button type="button" onClick={onBack} className="flex h-7 shrink-0 items-center gap-1.5 text-xs font-bold"><span aria-hidden="true">←</span> Live Map</button>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[9px]">
            <button type="button" onClick={onRecenter} className={`min-w-0 text-left font-semibold ${gpsActive ? 'text-emerald-300' : 'text-amber-300'}`} title="Request a GPS fix and center the map">{gpsLabel}</button>
            <span className={online ? 'text-blue-300' : 'text-red-300'}>{online ? 'Connected' : 'Offline'}</span>
            <span className="whitespace-nowrap text-slate-300">{Math.max(0,Math.round(Number(speed) || 0))} mph</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[9px] font-semibold text-slate-400">
            <span>{unitCount} units</span><span>{callCount} calls</span>
            {unassignedCount > 0 && <span className="text-red-300">{unassignedCount} unassigned</span>}
        </div>
        <button type="button" aria-pressed={fullscreen} onClick={onToggleFullscreen} className="ml-auto min-h-11 rounded-lg border border-cyan-600 px-3 text-xs font-bold text-cyan-100">{fullscreen ? 'Exit full screen' : 'Full screen map'}</button>
        <OfficerDutyStatusControl user={user} status={status} saving={saving} onChange={onStatusChange} inline />
    </header>;
}

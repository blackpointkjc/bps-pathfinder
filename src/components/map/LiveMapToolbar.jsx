import { ArrowLeft, Maximize2, Minimize2, RefreshCw, LocateFixed } from 'lucide-react';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDutyStatusControl from '@/components/dispatch/OfficerDutyStatusControl';

export default function LiveMapToolbar({ user, status, saving, onStatusChange, onBack, onRecenter, gpsLabel, gpsActive, online, speed, unitCount, callCount, unassignedCount, fullscreen, onToggleFullscreen, onRefreshCalls, callsRefreshing, callsStatus, criticalCount }) {
  return <header aria-label="Live Map controls" className="pf-map-header">
    <div className="pf-map-heading">
      <button type="button" className="pf-icon-button" onClick={onBack} aria-label="Return to command board" title="Command board"><ArrowLeft size={17}/></button>
      <div><h1>Live map</h1><span className="pf-map-subtitle">{callCount} calls <span>·</span> {unitCount} {unitCount===1?'unit':'units'}</span>{!gpsActive && <span className="pf-map-gps-alert" role="status"> · {gpsLabel?.includes('Acquiring') ? 'Acquiring GPS' : gpsLabel?.includes('accuracy') ? 'GPS accuracy low' : gpsLabel?.includes('Allow') ? 'GPS permission needed' : 'GPS signal lost'}</span>}</div>
      {criticalCount>0 && <span className="pf-map-critical">{criticalCount} critical</span>}
    </div>
    <div className="pf-map-telemetry">
      <span className={'pf-connection-dot '+(online?'is-online':'is-offline')}/><span>{online?'Connected':'Offline'}</span>
      <span className="pf-telemetry-divider"/>
      <button type="button" onClick={onRecenter} title={gpsLabel} className={gpsActive?'pf-gps-ready':'pf-gps-warning'}><LocateFixed size={13}/>{gpsActive?'GPS active':'GPS unavailable'}</button>
      <span className="pf-map-speed">{Math.max(0,Math.round(Number(speed)||0))} mph</span>
      {unassignedCount>0 && <span className="pf-map-unassigned">{unassignedCount} unassigned</span>}
    </div>
    <div className="pf-map-header-actions">
      <span className="pf-map-sync" role="status" title={callsStatus}>{callsRefreshing?'Updating…':callsStatus?.startsWith('Calls checked')?'Up to date':callsStatus}</span>
      <OfficerDutyStatusControl user={user} status={status} saving={saving} onChange={onStatusChange} compact/>
      <button type="button" className="pf-icon-button" disabled={callsRefreshing} onClick={onRefreshCalls} title="Refresh calls" aria-label="Refresh calls"><RefreshCw size={16} className={callsRefreshing?'animate-spin':''}/></button>
      <button type="button" className="pf-icon-button" aria-pressed={fullscreen} onClick={onToggleFullscreen} title={fullscreen?'Exit full screen':'Full screen'} aria-label={fullscreen?'Exit full screen':'Full screen map'}>{fullscreen?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
      <OfficerDistressButton currentUser={user} compact/>
    </div>
  </header>;
}

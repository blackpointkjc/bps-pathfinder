import React, { useMemo, useRef, useState } from 'react';
import { buildAuditModel, buildRouteMap, auditTime, durationLabel, signalQuality, validAuditPoint } from '@/lib/locationAudit';
import { addRequiredPrintFooter } from '@/utils/requiredPrintFooter';
import auditStyles from './GPSAuditReport.css?inline';
import './GPSAuditReport.css';

function AuditTable({ headings, children, label }) {
  return <div className="gps-table-wrap" tabIndex={0} role="region" aria-label={label}><table className="gps-table"><thead><tr>{headings.map(title=><th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export default function GPSAuditReport({ data, officerName }) {
  const reportRef=useRef(null);
  const [printError,setPrintError]=useState('');
  const [tileError,setTileError]=useState(false);
  const model=useMemo(()=>buildAuditModel(data.history),[data.history]);
  const route=useMemo(()=>buildRouteMap(model.points,model.segments),[model]);
  const entries=data.entries||[],alerts=data.geofenceAlerts||[];
  const firstEntry=entries[0],lastEntry=entries[entries.length-1];
  const hasOpenEntry=entries.some(entry=>!entry.clock_out);
  const dateLabel=data.date ? new Date(data.date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'}) : '';
  const printReport=()=>{
    setPrintError('');
    const popup=window.open('', '_blank');
    if (!popup) { setPrintError('Your browser blocked the print window. Allow pop-ups for Pathfinder, then select Print / Save PDF again.'); return; }
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Black Point GPS Audit Report</title><style>'+auditStyles+'</style></head><body><div class="gps-print-controls" style="padding:12px;font:14px Arial"><button id="gps-print-button" style="padding:12px">Print / Save PDF</button><span id="gps-print-status" style="margin-left:12px">Preparing route map…</span></div>'+reportRef.current.outerHTML+'</body></html>');
    popup.document.close();
    addRequiredPrintFooter(popup);
    popup.document.getElementById('gps-print-button').onclick=()=>popup.print();
    const images=[...popup.document.images];
    const ready=image=>image.complete ? Promise.resolve(image.naturalWidth>0) : new Promise(resolve=>{
      const timeout=setTimeout(()=>resolve(false),10000);
      image.onload=()=>{clearTimeout(timeout);resolve(true);};
      image.onerror=()=>{clearTimeout(timeout);resolve(false);};
    });
    Promise.all(images.map(ready)).then(results=>{
      if(popup.closed)return;
      const failed=results.some(result=>!result);
      popup.document.getElementById('gps-print-status').textContent=failed ? 'Some map tiles could not load. The GPS route and complete log are available; retry for a complete street background.' : 'Ready. Choose Print / Save PDF.';
      if(failed){
        const notice=popup.document.createElement('p');
        notice.className='gps-note gps-warning';
        notice.textContent='Street map background is incomplete. The GPS route and log remain available.';
        popup.document.querySelector('.gps-map')?.after(notice);
      } else { popup.focus(); popup.print(); }
    });
  };
  return <section aria-label="GPS audit report">
    <div className="gps-audit-toolbar"><div><strong>GPS audit trail</strong><div style={{fontSize:12}}>Full report for {dateLabel} · Eastern Time</div></div><button className="gps-audit-print" onClick={printReport}>Print / Save PDF</button></div>
    {printError && <p role="alert" className="gps-audit-error">{printError}</p>}
    <article className="gps-audit" ref={reportRef}>
      <header className="gps-banner"><div className="gps-brand">Black Point Protection</div><div className="gps-banner-meta"><strong>GPS AUDIT TRAIL</strong>{dateLabel} · Generated {auditTime(data.generatedAt)} ET</div></header>
      <div className="gps-body">
        <div className="gps-identity"><div><div className="gps-name">{officerName}</div><div className="gps-subtitle">{dateLabel} · All recorded sessions</div></div><div><strong>{hasOpenEntry?'Open time entry':'Historical record'}</strong><div className="gps-subtitle">All times shown in Eastern Time</div></div></div>
        <div className="gps-summary">
          <div className="gps-stat"><strong>{firstEntry?auditTime(firstEntry.clock_in):'Not recorded'}</strong><span>CLOCK IN{entries.length>1?' · FIRST SHIFT':''}</span></div>
          <div className="gps-stat"><strong>{hasOpenEntry?'Open entry':lastEntry?auditTime(lastEntry.clock_out):'Not recorded'}</strong><span>CLOCK OUT{entries.length>1?' · LAST SHIFT':''}</span></div>
          <div className="gps-stat"><strong>{model.pings.length}</strong><span>GPS PINGS</span></div>
          <div className="gps-stat"><strong>{model.distanceMiles.toFixed(2)} mi</strong><span>ESTIMATED DISTANCE</span></div>
        </div>
        <p className="gps-note">First ping: {auditTime(model.pings[0]?.timestamp)} · Last ping: {auditTime(model.pings[model.pings.length-1]?.timestamp)}. Clock times come from time entries, not GPS pings.</p>
        <h2>ROUTE MAP</h2>
        <div className="gps-legend"><span>🟢 Start</span><span>● Recorded pings</span><span>🔴 End</span><span>{model.points.length} mapped points</span></div>
        {route?<div className="gps-map" aria-label="Recorded GPS route map">
          {route.tiles.map(tile=><img key={tile.key} src={tile.url} alt="" onError={()=>setTileError(true)} style={{left:tile.left+'%',top:tile.top+'%',width:tile.width+'%',height:tile.height+'%'}}/>)}
          <svg viewBox={'0 0 '+route.width+' '+route.height} role="img" aria-label="GPS route from first recorded ping to last recorded ping">
            {route.lines.map((line,i)=><polyline key={i} points={line} fill="none" stroke="#d97706" strokeWidth="3"/>)}
            {route.points.map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3.5" fill="#92400e" stroke="#fbbf24" strokeWidth="1"><title>{'Ping '+(i+1)}</title></circle>)}
            <circle cx={route.points[0][0]} cy={route.points[0][1]} r="7" fill="#16a34a" stroke="white" strokeWidth="2"/>
            {route.points.length>1&&<circle cx={route.points.at(-1)[0]} cy={route.points.at(-1)[1]} r="7" fill="#dc2626" stroke="white" strokeWidth="2"/>}
          </svg><span className="gps-attribution">© OpenStreetMap contributors</span>
        </div>:<p className="gps-note">No usable GPS coordinates were recorded for this date.</p>}
        {tileError&&<p className="gps-note gps-warning">The street background could not fully load. The recorded route and GPS log are still available.</p>}
        <p className="gps-note">Distance is a GPS estimate, not road mileage. Session changes and gaps over five minutes are not joined. {model.excluded} invalid or low-quality points excluded from the map remain in the full log.</p>
        <h2>GEOFENCE ZONE ALERTS ({alerts.length})</h2>
        {alerts.length?<AuditTable label="Geofence zone alerts" headings={['Type','Zone','Time (ET)','Status']}>{alerts.map((alert,i)=><tr key={alert.id||i}><td>{{entered:'Entered',exited:'Exited',outside_zone:'Outside zone'}[alert.alert_type]||alert.alert_type}</td><td>{alert.location||'Not recorded'}</td><td className="gps-time">{auditTime(alert.created_date)}</td><td>{alert.acknowledged?'Acknowledged':'Not acknowledged'}</td></tr>)}</AuditTable>:<p className="gps-note">No geofence alerts recorded for this user on this date.</p>}
        <h2>STOP EVENTS ({model.stops.length})</h2>
        {model.stops.length?<AuditTable label="Estimated stop events" headings={['#','Location','Arrived (ET)','Last observed (ET)','Duration']}>{model.stops.map((stop,i)=><tr key={i}><td>{i+1}</td><td>{stop.location}</td><td className="gps-time">{auditTime(stop.first.timestamp)}</td><td className="gps-time">{auditTime(stop.last.timestamp)}</td><td className="gps-time">{durationLabel(stop.duration)}</td></tr>)}</AuditTable>:<p className="gps-note">No qualifying stops detected.</p>}
        <p className="gps-note">Stops are estimates: at least five minutes within 50m, with accuracy of 50m or better and no gap over five minutes. Last observed is not a verified departure time.</p>
        {entries.length>0&&<><h2>TIME ENTRIES ({entries.length})</h2><AuditTable label="Recorded time entries" headings={['Entry','Clock in (ET)','Clock out (ET)','Location']}>{entries.map(entry=><tr key={entry.id}><td>{entry.id}</td><td>{entry.clock_in?.slice(0,10)} {auditTime(entry.clock_in)}</td><td>{entry.clock_out?auditTime(entry.clock_out):'Open entry'}</td><td>{entry.location||'Not recorded'}</td></tr>)}</AuditTable></>}
        <h2>FULL GPS PING LOG ({model.pings.length})</h2>
        {model.pings.length?<AuditTable label="Full GPS ping log, scroll horizontally on small screens" headings={['#','Time (ET)','Address / recorded location','Coordinates','Accuracy','Signal']}>{model.pings.map((ping,i)=>{
          const signal=signalQuality(ping.accuracy);
          return <tr key={ping.id||i}><td>{i+1}</td><td className="gps-time">{auditTime(ping.timestamp)}</td><td>{ping.location||'Address not recorded'}</td><td className="gps-coordinates">{validAuditPoint(ping)?<>{Number(ping.latitude).toFixed(5)},<br/>{Number(ping.longitude).toFixed(5)}</>:'Invalid / missing'}</td><td>{signal.accuracy}</td><td><span className={'gps-signal gps-'+signal.tone}><i className="gps-dot"/>{signal.label}</span></td></tr>;
        })}</AuditTable>:<p className="gps-note">No GPS pings recorded for this date.</p>}
        <p className="gps-note">Signal: Good ≤25m · Medium ≤50m · Poor &gt;50m · Unknown when accuracy was not recorded. Locations are shown as saved; a street address is not inferred.</p>
      </div>
      <footer className="gps-footer"><span>Black Point Protection · GPS Audit Record</span><span>{dateLabel} · {model.pings.length} pings</span><span>Confidential · Official use only</span></footer>
    </article>
  </section>;
}

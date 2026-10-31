import { patrolSpeedLevel } from '@/lib/patrolSpeeding';

// Road-sign typography and the dynamic speed are deliberately separate.
// Warning animations apply ONLY to the current-speed display. A speed-limit
// sign remains a white regulatory-style sign with black readable lettering.
export default function PatrolSpeedSigns({
  speed, limit, live=false, qualified=false, estimated=false,
  road='', status='', source=''
}) {
  const limitValid=Number.isFinite(Number(limit)) && limit != null && Number(limit)>=10 && Number(limit)<=90;
  const level=patrolSpeedLevel(Number(speed),Number(limit),Boolean(live && qualified && limitValid && !estimated));
  const tone=level==='critical'?'pf-current-speed-critical':level==='warning'?'pf-current-speed-warning':'';
  const displayedSpeed=live&&Number.isFinite(Number(speed))?Math.max(0,Math.round(Number(speed))):'—';
  return (
    <div className="pf-speed-signs" aria-label="Patrol current speed and posted speed limit">
      <div className={`pf-current-speed ${tone}`} role="status" aria-label={`Current speed ${displayedSpeed} miles per hour`}>
        <div className="pf-current-speed-label">CURRENT SPEED</div>
        <div className="pf-current-speed-value">{displayedSpeed}</div>
        <div className="pf-current-speed-unit">MPH</div>
        {level==='warning' && <div className="pf-current-speed-alert">OVER LIMIT</div>}
        {level==='critical' && <div className="pf-current-speed-alert">SLOW DOWN</div>}
      </div>
      <div className="pf-regulatory-sign" title={source||status} aria-label={limitValid?`Posted speed limit ${limit} miles per hour`:'Posted speed limit unavailable'}>
        <div className="pf-regulatory-sign-label">SPEED</div>
        <div className="pf-regulatory-sign-label">LIMIT</div>
        <div className="pf-regulatory-sign-number">{limitValid?Math.round(Number(limit)):'—'}</div>
        {estimated && limitValid && <div className="pf-regulatory-sign-estimated">ESTIMATED</div>}
      </div>
      <div className="pf-regulatory-road" title={source||status}>{road||status||'Road data unavailable'}</div>
    </div>
  );
}

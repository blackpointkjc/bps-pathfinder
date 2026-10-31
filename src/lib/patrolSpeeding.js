// GPS-observed speeding thresholds. No event is created without a recent,
// reasonably accurate fix and a mapped (non-estimated) legal speed limit.
export const MPH_TO_MILES_PER_MS = 1 / 3600000;
const rad = n => n * Math.PI / 180;
export function distanceMiles(a, b) {
  if (!a || !b) return 0;
  const la = rad(Number(b.lat) - Number(a.lat));
  const lo = rad(Number(b.lng) - Number(a.lng));
  const h = Math.sin(la/2)**2 + Math.cos(rad(Number(a.lat))) * Math.cos(rad(Number(b.lat))) * Math.sin(lo/2)**2;
  return 3958.7613 * 2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0,h))));
}
export function patrolSpeedLevel(speed, limit, qualified=true) {
  if (!qualified || !Number.isFinite(speed) || !Number.isFinite(limit) || limit < 10 || limit > 90) return 'unknown';
  const excess = speed - limit;
  if (excess > 10) return 'critical';
  if (excess > 5) return 'warning';
  return 'normal';
}
export function patrolSample(fix, limit, options={}) {
  const timestamp=Number(fix?.timestamp);
  const accuracy=Number(fix?.accuracy);
  const lat=Number(fix?.latitude),lng=Number(fix?.longitude);
  const speed=Number(fix?.speed);
  const age=Date.now()-timestamp;
  const valid=Number.isFinite(timestamp)&&age>=-3000&&age<30000
    &&Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=50
    &&Number.isFinite(lat)&&Number.isFinite(lng)
    &&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0)
    &&Number.isFinite(speed)&&speed>=0&&speed<=135
    &&Number.isFinite(limit)&&limit>=10&&limit<=90
    &&options.estimated!==true && options.limitAgeMs>=0 && options.limitAgeMs<=60000;
  return valid ? {timestamp,accuracy,lat,lng,speed,limit,road:String(options.road||''),source:String(options.source||'')} : null;
}
export function advanceSpeedingEpisode(episode, sample) {
  // Null/invalid observation freezes calculations; callers close after GPS loss.
  if(!sample)return {episode,completed:null};
  const level=patrolSpeedLevel(sample.speed,sample.limit);
  if(level==='normal')return {episode:null,completed:episode};
  if(level==='unknown')return {episode,completed:null};
  if(!episode) return {episode:{
    eventId:globalThis.crypto?.randomUUID?.() || String(sample.timestamp)+'-'+Math.random(),
    startedAt:sample.timestamp,last:sample,first:sample,samples:1,
    maxSpeed:sample.speed,maxExcess:sample.speed-sample.limit,
    totalMiles:0,durationMs:0,criticalSamples:level==='critical'?1:0,
    criticalDurationMs:0,road:sample.road,source:sample.source,
    lastReportAt:0
  },completed:null};
  const elapsed=sample.timestamp-episode.last.timestamp;
  if(elapsed<=0)return {episode,completed:null};
  if(elapsed>35000 || episode.last.road&&sample.road&&episode.last.road!==sample.road || episode.last.limit!==sample.limit)
    return {episode:{
      eventId:globalThis.crypto?.randomUUID?.() || String(sample.timestamp)+'-'+Math.random(),
      startedAt:sample.timestamp,last:sample,first:sample,samples:1,
      maxSpeed:sample.speed,maxExcess:sample.speed-sample.limit,
      totalMiles:0,durationMs:0,criticalSamples:level==='critical'?1:0,
      criticalDurationMs:0,road:sample.road,source:sample.source,lastReportAt:0
    },completed:episode};
  const actualMiles=distanceMiles(episode.last,sample);
  const derivedMph=actualMiles/(elapsed/3600000);
  const distance=derivedMph>145 || actualMiles>1 ? 0 : actualMiles;
  const high=level==='critical'&&patrolSpeedLevel(episode.last.speed,episode.last.limit)==='critical';
  return {episode:{
    ...episode,last:sample,samples:episode.samples+1,
    maxSpeed:Math.max(episode.maxSpeed,sample.speed),
    maxExcess:Math.max(episode.maxExcess,sample.speed-sample.limit),
    totalMiles:episode.totalMiles+distance,
    durationMs:episode.durationMs+elapsed,
    criticalSamples:episode.criticalSamples+(level==='critical'?1:0),
    criticalDurationMs:episode.criticalDurationMs+(high?elapsed:0),
  },completed:null};
}
export function shouldReportSpeeding(episode) {
  return !!episode && episode.criticalSamples>=2 && episode.criticalDurationMs>=10000 && episode.durationMs>=10000;
}

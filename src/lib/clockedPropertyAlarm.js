// A monitored-property alarm belongs only to the officer's ACTIVE post: an
// open time punch OR a scheduled shift currently in progress at that property.
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const clockMinutes = value => { const match=String(value||'').match(/^(\d{1,2}):(\d{2})/); return match ? Number(match[1])*60+Number(match[2]) : NaN; };
const easternParts = now => {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
  const get = type => parts.find(part=>part.type===type)?.value;
  return {date:`${get('year')}-${get('month')}-${get('day')}`,minute:Number(get('hour'))*60+Number(get('minute'))};
};
const previousEasternDay = day => { const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10); };
export function matchesPropertyPost(location, property) {
  if (!location || !property) return false;
  const locationId=String(property.id || '').trim();
  const site=normalize(property.site_name || property.name);
  const address=normalize(property.address);
  const selected=normalize(location);
  return Boolean((locationId && selected===normalize(locationId)) || (site && (selected===site || (address && selected===`${site} - ${address}`))));
}
export function getActiveTimeEntry(entries, now=Date.now()) {
  return (entries||[]).filter(row => !row.clock_out && row.archived!==true
    && Number.isFinite(Date.parse(row.clock_in)) && Date.parse(row.clock_in)<=now)
    .sort((a,b)=>Date.parse(b.clock_in)-Date.parse(a.clock_in))[0]||null;
}
export function isClockedInAtProperty(entries, property, now=Date.now()) {
  if (!property) return false;
  const entry=getActiveTimeEntry(entries,now);
  if (!entry) return false;
  // A currently open punch at another property overrides the scheduled post.
  if (entry.location_id) return String(entry.location_id)===String(property.id);
  return matchesPropertyPost(entry.location,property);
}
export function isScheduledAtProperty(shifts, property, now=Date.now()) {
  if(!property) return false;
  const {date,minute}=easternParts(now),yesterday=previousEasternDay(date);
  return (shifts||[]).some(shift=>{
    if(shift.is_open===true || !matchesPropertyPost(shift.location_id || shift.location,property))return false;
    const start=clockMinutes(shift.start_time),end=clockMinutes(shift.end_time);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start===end)return false;
    const shiftDate=String(shift.shift_date||'').slice(0,10);
    return end>start ? shiftDate===date && minute>=start && minute<end
      : (shiftDate===date && minute>=start) || (shiftDate===yesterday && minute<end);
  });
}
// Short-lived dedupe prevents concurrent realtime/recovery feeds from producing
// repeated TimeEntry/Schedule reads. Never use a stale eligibility decision long-term.
const eligibilityCache=new Map();
export async function mayReceivePropertyAlarm(base44,user,property,{fresh=false}={}) {
  const email=normalize(user?.email);
  if(!email || !property?.id || property.active===false || property.property_monitoring_enabled!==true)return false;
  const key=`${email}|${property.id}`;
  const cached=eligibilityCache.get(key);
  if(!fresh && cached && Date.now()-cached.at<10000)return cached.allowed;
  try {
    const [response,shifts] = await Promise.all([
      base44.functions.invoke('getMyTimeEntries',{active_only:true}),
      base44.entities.Schedule.filter({officer_email:email},'-shift_date',150),
    ]);
    const payload=response?.data?.data || response?.data || {};
    if(!Array.isArray(payload.entries) || !Array.isArray(shifts))return false;
    const active=getActiveTimeEntry(payload.entries);
    const allowed=active ? isClockedInAtProperty(payload.entries,property) : isScheduledAtProperty(shifts,property);
    eligibilityCache.set(key,{at:Date.now(),allowed});
    return allowed;
  }catch(error){console.warn('Property-alert eligibility unavailable; suppressing unrelated audio:',error?.message);return false;}
}

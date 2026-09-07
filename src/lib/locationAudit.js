export const AUDIT_TIME_ZONE = 'America/New_York';
export function auditTimestamp(value) {
  if (!value) return NaN;
  const raw = String(value).trim();
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + 'Z').getTime();
}
export function auditTime(value) {
  const time = auditTimestamp(value);
  return Number.isFinite(time) ? new Intl.DateTimeFormat('en-US', {timeZone:AUDIT_TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(time) : 'Not recorded';
}
export function auditDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:AUDIT_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');
}
const numberValue = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
export function validAuditPoint(p) {
  return numberValue(p.latitude) && numberValue(p.longitude) && Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180 && !(Number(p.latitude)===0 && Number(p.longitude)===0);
}
export function signalQuality(value) {
  if (!numberValue(value) || Number(value) < 0) return {label:'Unknown',tone:'unknown',accuracy:'Not recorded'};
  const accuracy=Number(value);
  return { label: accuracy <= 25 ? 'Good' : accuracy <= 50 ? 'Medium' : 'Poor', tone:accuracy <=25 ? 'good' : accuracy <=50 ? 'medium' : 'poor', accuracy:'±'+Math.round(accuracy)+'m' };
}
export function distanceMeters(a,b) {
  const radians = value => value*Math.PI/180;
  const dLat=radians(Number(b.latitude)-Number(a.latitude)), dLon=radians(Number(b.longitude)-Number(a.longitude));
  const h=Math.sin(dLat/2)**2+Math.cos(radians(Number(a.latitude)))*Math.cos(radians(Number(b.latitude)))*Math.sin(dLon/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function durationLabel(ms) {
  const seconds=Math.max(0,Math.floor(ms/1000));
  return seconds>=3600 ? Math.floor(seconds/3600)+'h '+Math.floor(seconds%3600/60)+'m' : Math.floor(seconds/60)+'m '+seconds%60+'s';
}
export function buildAuditModel(history = []) {
  const pings=[...history].sort((a,b)=>auditTimestamp(a.timestamp)-auditTimestamp(b.timestamp));
  const usable=p=>validAuditPoint(p) && (!numberValue(p.accuracy) || (Number(p.accuracy)>=0 && Number(p.accuracy)<=2000));
  const segments=[]; let segment=[], previous=null, distance=0, gaps=0;
  for (const p of pings) {
    const dt=previous ? auditTimestamp(p.timestamp)-auditTimestamp(previous.timestamp) : 0;
    const connected=previous && usable(previous) && usable(p) && dt>=0 && dt<=300000 && (previous.time_entry_id||'')===(p.time_entry_id||'');
    if (!connected) {
      if (segment.length) segments.push(segment);
      segment=[];
      if (previous) gaps++;
    } else { distance+=distanceMeters(previous,p); }
    if (usable(p)) segment.push(p);
    previous=p;
  }
  if (segment.length) segments.push(segment);
  const stops=[]; let cluster=[];
  const flush=()=>{
    if (cluster.length>1) {
      const first=cluster[0],last=cluster[cluster.length-1], duration=auditTimestamp(last.timestamp)-auditTimestamp(first.timestamp);
      if (duration>=300000) stops.push({ first,last,duration,location:first.location||'Address not recorded' });
    }
    cluster=[];
  };
  for (const p of pings) {
    const last=cluster[cluster.length-1];
    const good=usable(p) && numberValue(p.accuracy) && Number(p.accuracy)<=50;
    if (!good) { flush(); continue; }
    if (last && (auditTimestamp(p.timestamp)-auditTimestamp(last.timestamp)>300000 || (p.time_entry_id||'')!==(last.time_entry_id||'') || distanceMeters(cluster[0],p)>50)) flush();
    cluster.push(p);
  }
  flush();
  return {pings,points:pings.filter(usable),segments,stops,distanceMiles:distance/1609.344,gaps,excluded:pings.filter(p=>!usable(p)).length};
}
export function buildRouteMap(points, segments, width=760, height=360) {
  if (!points.length) return null;
  const project=(p,z)=>{
    const lat=Math.max(-85.0511,Math.min(85.0511,Number(p.latitude)))*Math.PI/180;
    const scale=256*2**z;
    return [(Number(p.longitude)+180)/360*scale,(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*scale];
  };
  let zoom=18, coordinates;
  while (zoom>=1) {
    coordinates=points.map(p=>project(p,zoom));
    const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
    if (Math.max(...xs)-Math.min(...xs)<width-64 && Math.max(...ys)-Math.min(...ys)<height-64) break;
    zoom--;
  }
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
  const left=(Math.min(...xs)+Math.max(...xs)-width)/2,top=(Math.min(...ys)+Math.max(...ys)-height)/2;
  const toXY=p=>{const [x,y]=project(p,zoom);return [x-left,y-top];};
  const tiles=[];
  for(let x=Math.floor(left/256);x<=Math.floor((left+width)/256);x++) for(let y=Math.floor(top/256);y<=Math.floor((top+height)/256);y++) {
    if(y<0||y>=2**zoom)continue;
    tiles.push({key:x+':'+y,url:'https://a.tile.openstreetmap.org/'+zoom+'/'+((x%2**zoom+2**zoom)%2**zoom)+'/'+y+'.png',left:(x*256-left)/width*100,top:(y*256-top)/height*100,width:256/width*100,height:256/height*100});
  }
  return {width,height,tiles,points:points.map(toXY),lines:segments.map(segment=>segment.map(p=>toXY(p).join(',')).join(' '))};
}

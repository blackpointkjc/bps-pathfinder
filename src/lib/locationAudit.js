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
export function buildRouteMap(points, segments, width=760, height=480, view={}) {
  if (!points.length) return null;
  const project=(p,z)=>{
    const lat=Math.max(-85.0511,Math.min(85.0511,Number(p.latitude)))*Math.PI/180;
    const scale=256*2**z;
    return [(Number(p.longitude)+180)/360*scale,(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*scale];
  };
  const normalized=points.map(p=>project(p,0));
  const bounds=normalized.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  const fit=Math.min(18,Math.log2(Math.min((width-48)/Math.max(bounds[2]-bounds[0],.000001),(height-48)/Math.max(bounds[3]-bounds[1],.000001))));
  const zoom=Math.max(1,Math.min(19,(view.centerPoint ? 17 : fit)+(view.zoomOffset||0)));
  const tileZoom=Math.min(19,Math.ceil(zoom)), tileScale=2**(zoom-tileZoom),tileSize=256*tileScale;
  const center=view.centerPoint ? project(view.centerPoint,zoom) : [(bounds[0]+bounds[2])/2*2**zoom,(bounds[1]+bounds[3])/2*2**zoom];
  const left=center[0]-width/2,top=center[1]-height/2;
  const toXY=p=>{const [x,y]=project(p,zoom);return [x-left,y-top];};
  const tiles=[];
  for(let x=Math.floor(left/tileSize);x<=Math.floor((left+width)/tileSize);x++) for(let y=Math.floor(top/tileSize);y<=Math.floor((top+height)/tileSize);y++) {
    if(y<0||y>=2**tileZoom)continue;
    tiles.push({key:tileZoom+':'+x+':'+y,url:'https://a.tile.openstreetmap.org/'+tileZoom+'/'+((x%2**tileZoom+2**tileZoom)%2**tileZoom)+'/'+y+'.png',left:(x*tileSize-left)/width*100,top:(y*tileSize-top)/height*100,width:tileSize/width*100,height:tileSize/height*100});
  }
  return {width,height,zoom,tiles,points:points.map(toXY),lines:segments.map(segment=>segment.map(p=>toXY(p).join(',')).join(' '))};
}

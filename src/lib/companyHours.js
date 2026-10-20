// Actual completed hours, in the company's Eastern/Friday workweek.
// Clip to the requested period; include earlier hours in each workweek when
// deciding whether a period's hours are regular or overtime.
const zone = 'America/New_York';
export const companyDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(value));
function midnight(day) {
  const offsetProbe = new Date(day+'T00:00:00Z');
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(offsetProbe);
  const offset = parts.find(p=>p.type==='timeZoneName').value.replace('GMT','');
  return Date.parse(day+'T00:00:00'+(offset ? (offset.startsWith('-')?'-':'+')+offset.slice(1).padStart(2,'0')+':00' : 'Z'));
}
const shiftDay = (day, n) => {const date=new Date(day+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+n); return date.toISOString().slice(0,10);};
function weekOf(day) {const n=(new Date(day+'T12:00:00Z').getUTCDay()+2)%7; return shiftDay(day,-n);}
const identity = value=>String(value||'').trim().toLowerCase();
const merge = ranges => {
 const result=[];
 for(const [start,end] of ranges.filter(([a,b])=>Number.isFinite(a)&&b>a).sort((a,b)=>a[0]-b[0])){
  const previous=result.at(-1);
  if(previous&&start<=previous[1])previous[1]=Math.max(end,previous[1]);else result.push([start,end]);
 }
 return result;
};
function paidRanges(entry){
 const start=Date.parse(entry.clock_in),end=Date.parse(entry.clock_out);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||entry.archived===true)return [];
 let ranges=[[start,end]];
 for(const [a,b] of merge((Array.isArray(entry.break_periods)?entry.break_periods:[]).map(p=>[Math.max(start,Date.parse(p.start)),Math.min(end,Date.parse(p.end))]))){
  ranges=ranges.flatMap(([s,e])=>b<=s||a>=e?[[s,e]]:[[s,Math.min(a,e)],[Math.max(b,s),e]].filter(([x,y])=>y>x));
 }
 return ranges;
}
export function calculateCompanyHours(entries,officers,startDay,endDay){
 const start=midnight(startDay),end=midnight(shiftDay(endDay,1));
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 const seen=new Set();
 const rows=(entries||[]).filter(entry=>{if(entry.id&&seen.has(entry.id))return false;if(entry.id)seen.add(entry.id);return true;});
 return (officers||[]).map(officer=>{
  const aliases=new Set([officer.email,officer.work_email,officer.pathfinder_email,officer.microsoft_email,officer.outlook_email,...(officer.email_aliases||[])].map(identity).filter(Boolean));
  const ranges=merge(rows.filter(row=>String(row.officer_id||row.user_id||'')===String(officer.id)||aliases.has(identity(row.officer_email))).flatMap(paidRanges));
  const weeks=new Map();let regular=0,overtime=0;
  for(const [a,b] of ranges){
   let point=a;
   while(point<b){
    const day=companyDay(point),week=weekOf(day),edge=midnight(shiftDay(week,7));
    const stop=Math.min(b,edge),used=weeks.get(week)||0,regularEnd=point+Math.max(0,40*3600000-used);
    regular+=Math.max(0,Math.min(stop,end,regularEnd)-Math.max(point,start));
    overtime+=Math.max(0,Math.min(stop,end)-Math.max(point,start,regularEnd));
    weeks.set(week,used+stop-point);point=stop;
   }
  }
  const round=ms=>Math.round(ms/360000)/10;
  return {name:[officer.rank,officer.last_name].filter(Boolean).join(' ')||officer.email,email:officer.email,regular:round(regular),overtime:round(overtime),total:round(regular+overtime)};
 }).filter(row=>row.total>0).sort((a,b)=>b.total-a.total);
}

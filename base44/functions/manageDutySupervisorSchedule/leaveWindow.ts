export function easternInstant(day,time='00:00'){
 const target=day+'T'+time+':00';let utc=Date.parse(target+'Z');
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(utc)).replace(' ','T');
  const delta=Date.parse(target+'Z')-Date.parse(parts+'Z');utc+=delta;if(!delta)break;
 }
 return new Date(utc).toISOString();
}
const nextDay=day=>new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export function leaveWindow(request){
 if(Number.isFinite(Date.parse(request.start_at))&&Number.isFinite(Date.parse(request.end_at)))return {start:request.start_at,end:request.end_at,request_id:request.id};
 return {start:easternInstant(request.start_date),end:easternInstant(nextDay(request.end_date)),request_id:request.id};
}
export function shiftOverlapsLeave(shift,request){
 const day=String(shift.shift_date||'').slice(0,10);
 if(!day)return false;
 const start=shift.start_time||'00:00',end=shift.end_time||'00:00';
 const from=Date.parse(easternInstant(day,start.slice(0,5)));
 const until=Date.parse(easternInstant(end<=start?nextDay(day):day,end.slice(0,5)));
 const window=leaveWindow(request);
 return from<Date.parse(window.end)&&until>Date.parse(window.start);
}

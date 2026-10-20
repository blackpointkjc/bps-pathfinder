import { parseServerTimestamp } from '@/lib/easternTime';
const siteKey=value=>String(value||'').split(/\s*(?::|\s-\s)\s*/)[0].trim().toLowerCase();
export function invoiceTimeZone(invoice,locations=[]){
 const site=locations.find(row=>siteKey(row.site_name)===siteKey(invoice.site_name||invoice.location));
 const zone=invoice.time_zone||site?.time_zone||'America/New_York';
 try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return zone;}catch{return 'America/New_York';}
}
export function invoiceCalendarDate(value){
 // Contract/billing dates are calendar days, not UTC-midnight instants.
 const raw=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return value?String(value):'—';
 const date=new Date(raw+'T12:00:00Z');
 return Number.isFinite(date.getTime())?date.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}):'—';
}
export function invoiceLocalStamp(value,zone,options={}){
 const date=parseServerTimestamp(value);
 return date?date.toLocaleString('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit',timeZoneName:'short',...options}):'—';
}
export function invoiceShiftRows(invoice,locations=[]){
 let rows=[];try{rows=Array.isArray(invoice.shifts)?invoice.shifts:JSON.parse(invoice.shifts||'[]');}catch{}
 if(!Array.isArray(rows))return [];
 const zone=invoiceTimeZone(invoice,locations);
 const isTimestamp=value=>/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(String(value||''));
 return rows.map(row=>{
  const start=row.clock_in||row.clockIn,end=row.clock_out||row.clockOut;
  return {...row,date:isTimestamp(start)?invoiceLocalStamp(start,zone,{month:'short',day:'numeric',year:'numeric',hour:undefined,minute:undefined,timeZoneName:undefined}):invoiceCalendarDate(row.date),
   clockIn:isTimestamp(start)?invoiceLocalStamp(start,zone):start||'—',clockOut:isTimestamp(end)?invoiceLocalStamp(end,zone):end||'—'};
 });
}

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { previewDisplayName } from '@/utils/previewIdentity';
import { addDays, addWeeks, startOfWeek, format } from 'date-fns';

export default function ApprovedLeavePanel({ weekOffset = 0, users = [], schedules = [] }) {
 const qc = useQueryClient();
 const {data:requests=[],isPending,isError,refetch} = useQuery({
  queryKey:['approvedScheduleLeave'],
  queryFn:async()=>{const response=await base44.functions.invoke('getPTORequests',{});const data=response?.data||response;if(data.error)throw new Error(data.error);return data.requests||[];},
  staleTime:30000,
 });
 useEffect(()=>{
  let unsubscribe;
  try { unsubscribe=base44.entities.TimeOffRequest.subscribe(()=>{clearBase44ReadCacheMatching('function:getPTORequests:');qc.invalidateQueries({queryKey:['approvedScheduleLeave']});qc.invalidateQueries({queryKey:['allSchedules']});}); } catch {}
  return ()=>{if(typeof unsubscribe==='function')unsubscribe();};
 },[qc]);
 const start=addWeeks(startOfWeek(new Date(),{weekStartsOn:0}),weekOffset);
 const first=format(start,'yyyy-MM-dd'),last=format(addDays(start,6),'yyyy-MM-dd');
 const leave=requests.filter(row=>row.status==='approved' && row.start_date<=last && row.end_date>=first);
 return <section id="approved-time-off" className="rounded-2xl border border-amber-700/50 bg-slate-900 p-4 text-white print:hidden">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-amber-200">Approved time off · {leave.length} this week</h2><p className="mt-1 text-xs text-slate-400">Approved paid leave and unpaid days off stay visible here. Affected shifts become open shifts needing coverage.</p></div><a href="/AdminPTOApproval" className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-200">Review time-off requests</a></div>
  {isPending?<p role="status" className="mt-3 text-sm">Loading approved leave…</p>:isError?<button type="button" onClick={()=>refetch()} className="mt-3 text-sm text-red-300">Approved leave could not load. Retry</button>:<div className="mt-3 space-y-2">{leave.map(row=>{
   const email=String(row.requested_by_email||row.created_by||'').toLowerCase();
   const person=users.find(user=>[user.email,...(user.email_aliases||[])].some(value=>String(value||'').toLowerCase()===email));
   const conflicts=schedules.filter(shift=>!shift.archived&&!shift.is_open&&String(shift.officer_email||'').toLowerCase()===email&&shift.shift_date>=row.start_date&&shift.shift_date<=row.end_date);
   return <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 p-3 text-sm"><div><strong>{person?previewDisplayName(person):'Officer '+String(row.requested_by_name||'unavailable').split(/\s+/).pop()}</strong><span className="ml-3 text-slate-300">{row.start_date} – {row.end_date}</span></div><span className={conflicts.length?'font-bold text-red-300':'text-amber-200'}>{conflicts.length?conflicts.length+' assigned shift(s) conflict with approved leave':row.request_type==='paid'?'Paid leave':'Approved day off'}</span></div>;
  })}{!leave.length&&<p className="text-xs text-slate-400">No approved leave overlaps the displayed week.</p>}</div>}
 </section>;
}

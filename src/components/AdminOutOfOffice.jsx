import { leaveTimeLabel } from '@/utils/leaveTimeLabel';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { invalidateAppDirectory } from '@/lib/appDirectory';

const localDate = value => {
 const date = new Date(value || Date.now());
 if (!Number.isFinite(date.getTime())) return '';
 return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
};
export default function AdminOutOfOffice({ user }) {
 const queryClient = useQueryClient();
 const [enabled,setEnabled] = useState(user?.out_of_office === true);
 const [start,setStart] = useState(localDate(user?.out_of_office_start));
 const [end,setEnd] = useState(user?.out_of_office_return ? localDate(user.out_of_office_return) : '');
 const [busy,setBusy] = useState(false);
 const [message,setMessage] = useState('');
 const save = async (clear = false) => {
  if (!clear && enabled && (!start || !end || new Date(end) <= new Date(start))) { setMessage('Choose a return date and time after the start.'); return; }
  setBusy(true); setMessage('');
  try {
   const response = await base44.functions.invoke('updateUser',{userId:user.id,updates:{out_of_office:clear ? false : enabled,out_of_office_start:start ? new Date(start).toISOString() : '',out_of_office_return:end ? new Date(end).toISOString() : ''}});
   if (response?.data?.error) throw new Error(response.data.error);
   if (clear) setEnabled(false);
   invalidateAppDirectory();
   await queryClient.invalidateQueries();
   setMessage(clear ? 'Returned to office. Unfinished duties and permanent command assignments resume. Active approved leave remains in effect.' : 'Availability saved. Temporary coverage is synchronized automatically and ends at the return time.');
  } catch(error) { setMessage(error?.message || 'Could not save availability.'); }
  finally { setBusy(false); }
 };
 return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-white">
  <h3 className="font-bold">Out of Office & Acting Coverage</h3>
  {(user?.approved_leave_windows||[]).map(window=><p key={window.request_id} className="rounded border border-amber-700 bg-amber-950/20 p-2 text-xs text-amber-200">Approved leave: {leaveTimeLabel({start_at:window.start,end_at:window.end})}. Change approved leave in Admin PTO Approval.</p>)}
  <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/>Out of office</label>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="text-sm">Starts<input type="datetime-local" value={start} onChange={event=>setStart(event.target.value)} className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 p-2 text-white" /></label>
   <label className="text-sm">Returns<input type="datetime-local" value={end} onChange={event=>setEnd(event.target.value)} className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 p-2 text-white" /></label>
  </div>
  <p className="text-xs">Times use your device’s timezone. Eligible unfinished duties are temporarily reassigned; unfinished work returns when the absence ends. Acting coverage is selected automatically from their platoon by rank. The highest available eligible rank in the platoon covers first, with earliest hire date then unit number breaking ties. Duties are shared among that rank; supervising command covers when no platoon member is eligible. No replacement needs to be selected.</p>
  <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>save()} className="rounded bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Save availability</button><button type="button" disabled={busy} onClick={()=>save(true)} className="rounded border border-slate-500 px-3 py-2 text-sm">Return now</button></div>
  {message && <p role="status" className="text-sm">{message}</p>}
 </section>;
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

const categories = [
  ['pending_hr','HR outstanding','AdminCenter?admin_ops_section=people'],
  ['pending_trainer_reviews','Certification reviews','TrainerCenter?section=compliance'],
  ['pending_students','Student registrations','TrainerCenter?section=students'],
  ['pending_employees','Pending employee accounts','AdminCenter?admin_ops_section=people'],
  ['pending_access_requests','Access requests','AdminCenter?admin_ops_section=people'],
];
export default function AdminOperationsBriefing({ compact = false }) {
 const queryClient = useQueryClient();
 const {data, error, isLoading, isFetching} = useQuery({
  queryKey:['adminOperationsBriefing'],
  queryFn:async()=>{const response=await base44.functions.invoke('getAdminOperationsBriefing',{});const result=response?.data||response||{};if(!result.success)throw new Error(result.error||'Briefing unavailable');return result;},
  staleTime:120000,refetchInterval:300000,refetchOnWindowFocus:false,retry:1
 });
 return <section className="rounded-2xl border border-cyan-700/40 bg-[#0b1624] p-4 text-white md:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-cyan-300">Organization-wide operational briefing</div><h2 className="mt-1 text-xl font-black">Outstanding work by department</h2><p className="mt-1 text-xs text-slate-400">Live pending items, assigned owners and unresolved follow-ups. Unknown sources are not reported as zero.</p></div>
   <button type="button" disabled={isFetching} onClick={()=>queryClient.invalidateQueries({queryKey:['adminOperationsBriefing']})} className="rounded-lg border border-cyan-600/40 px-3 py-2 text-xs font-bold text-cyan-200">{isFetching?'UPDATING':'REFRESH BRIEFING'}</button>
  </div>
  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{categories.map(([key,label,url])=><Link key={key} to={'/'+url} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 hover:border-cyan-600"><div className="text-xs text-slate-300">{label}</div><div className="mt-2 text-2xl font-black">{data?.status?.[key] == null ? '—' : data.status[key]}</div><div className="mt-1 text-[11px] text-cyan-300">{data?.status?.[key] == null ? 'Not verified' : data.status[key] ? 'Action required' : 'No outstanding items found'}</div></Link>)}</div>
  {isLoading && <p className="mt-4 text-sm text-slate-300">Checking department status…</p>}
  {error && <p role="alert" className="mt-4 text-sm text-red-300">Briefing unavailable: {error.message}. Counts are not verified.</p>}
  {!!data?.source_errors?.length && <p className="mt-4 rounded-lg border border-amber-700/40 p-3 text-xs text-amber-200">Data still unavailable from: {data.source_errors.join(', ')}. Affected counts are shown as unknown.</p>}
  {!compact && <div className="mt-4 space-y-2">{(data?.items||[]).slice(0,35).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-3"><div><div className="text-xs font-black text-cyan-300">{item.area} · {item.status}</div><div className="text-sm font-bold">{item.person}</div><div className="text-xs text-slate-300">{item.label}</div>{item.owner && <div className="mt-1 text-xs text-slate-300">Assigned trainer: {item.owner}</div>}</div><Link to={'/'+item.page} className="rounded-lg border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-200">{item.action || 'Open workspace'}</Link></div>)}{data?.items?.length===0&&data?.source_errors?.length===0&&<p className="text-sm text-emerald-300">No pending HR, student, or trainer items returned.</p>}</div>}
  {data?.generated_at&&<div className="mt-3 text-[11px] text-slate-500">Last checked: {new Date(data.generated_at).toLocaleString()}</div>}
 </section>;
}
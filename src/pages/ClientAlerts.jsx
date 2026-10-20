import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import { useState,useEffect } from 'react';
import { getClientPortalUser,getClientPreviewId } from '@/utils/clientPreview';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertTriangle,CheckCircle,Shield } from 'lucide-react';

export default function ClientAlerts(){
 const [property,setProperty]=useState('all'),[view,setView]=useState('active');
 const preview=getClientPreviewId();
 const {data:user}=useQuery({queryKey:['clientPortalUser',preview],queryFn:getClientPortalUser,staleTime:60000});
 const {data,isPending,isFetching,error,refetch}=useQuery({
  queryKey:['clientSecurityAlerts',user?.id,preview],enabled:!!user,
  queryFn:async()=>{const response=await base44.functions.invoke('getClientSecurityAlerts',preview?{client_id:preview}:{});const payload=response?.data||response||{};if(!payload.success)throw new Error(payload.error||'Security alerts unavailable');return payload;},
  staleTime:30000,refetchInterval:60000,refetchIntervalInBackground:false,refetchOnWindowFocus:false
 });
 useEffect(()=>{
  if(!user)return;let timer;const subscriptions=[];
  for(const name of ['SecurityAlert','PropertyAlert'])try{subscriptions.push(base44.entities[name].subscribe(()=>{clearTimeout(timer);timer=setTimeout(()=>refetch(),1000);}));}catch{}
  return()=>{clearTimeout(timer);subscriptions.forEach(unsubscribe=>unsubscribe?.());};
 },[user?.id,preview,refetch]);
 const alerts=data?.alerts||[],sites=data?.locations||[],incomplete=!!error||!!data?.source_errors?.length;
 const rows=alerts.filter(a=>(property==='all'||a.location===property)&&(view==='all'||a.status===view));
 const stamp=(value,site)=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{timeZone:sites.find(s=>s.site_name===site)?.time_zone||'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Time unavailable';};
 return <div className="min-h-full bg-[#080f1b] p-4 text-white md:p-6"><div className="mx-auto max-w-6xl space-y-4">
  <WorkspaceHeader eyebrow="Client services / Security" title="Security Alerts" description="Security notices and CAD property alerts for your assigned portfolio." metrics={[
   {label:'Active alerts',value:incomplete||isPending?'—':alerts.filter(a=>a.status==='active').length},
   {label:'Properties',value:sites.length},
   {label:'Resolved in last 30 days',value:incomplete||isPending?'—':alerts.filter(a=>a.status==='resolved').length}
  ]}><Button variant="outline" disabled={isFetching} onClick={()=>refetch()}>{isFetching?'Refreshing…':'Refresh alerts'}</Button></WorkspaceHeader>
  {incomplete&&<div role="alert" className="rounded-xl border border-amber-600 bg-amber-950/40 p-4 text-sm text-amber-100">Alerts could not fully refresh. {error?.message||'Unavailable: '+data.source_errors.join(', ')}. Displayed records may be incomplete.<Button size="sm" variant="outline" className="ml-3" onClick={()=>refetch()}>Retry</Button></div>}
  <div className="flex flex-wrap gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><select aria-label="Alert property" value={property} onChange={e=>setProperty(e.target.value)} className="rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm"><option value="all">All assigned properties</option>{sites.map(s=><option key={s.id} value={s.site_name}>{s.site_name}</option>)}</select><div className="flex gap-1">{[['active','Active'],['resolved','Resolved'],['all','All records']].map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)} className="rounded-lg px-4 py-2 text-sm aria-pressed:bg-cyan-800 hover:bg-slate-800">{label}</button>)}</div></div>
  {isPending?<p role="status" className="p-10 text-center text-slate-300">Loading your property alerts…</p>:!rows.length?<div className="rounded-xl border border-slate-700 bg-slate-900 p-10 text-center">{incomplete?<AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-300"/>:<CheckCircle className="mx-auto mb-3 h-8 w-8 text-emerald-400"/>}<h2 className="font-semibold">{incomplete?'Alert status unavailable':!sites.length?'No properties assigned':view==='active'?'No active alerts':'No alerts match this view'}</h2>{!sites.length&&<p className="mt-2 text-sm text-slate-400">Your administrator can assign portfolio access in Manage Clients.</p>}</div>:<div className="grid gap-4 lg:grid-cols-2">{rows.map(alert=><article key={alert.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900"><div className="flex items-center justify-between gap-3 border-b border-slate-700 p-4"><div className="flex items-center gap-2"><Shield className="h-5 w-5 text-cyan-300"/><h2 className="font-bold">{alert.location}</h2></div><span className={'rounded px-2 py-1 text-xs font-bold '+(['high','critical'].includes(alert.severity)?'bg-red-950 text-red-200':'bg-slate-800 text-slate-200')}>{alert.severity.toUpperCase()}</span></div><div className="space-y-3 p-5"><p className="text-sm leading-relaxed">{alert.description}</p><p className="text-xs text-slate-400">{alert.source}{alert.reference?' · '+alert.reference:''} · {stamp(alert.created_date,alert.location)}</p><p className={alert.status==='active'?'text-xs font-bold text-amber-300':'text-xs font-bold text-emerald-300'}>{alert.status.toUpperCase()}</p>{alert.resolution_notes&&<p className="border-t border-slate-700 pt-3 text-sm text-slate-300">{alert.resolution_notes}</p>}</div></article>)}</div>}
 </div></div>;
}

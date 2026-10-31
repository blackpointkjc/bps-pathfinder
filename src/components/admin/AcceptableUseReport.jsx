import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileCheck2, Search, Download, RefreshCw, ShieldCheck } from 'lucide-react';

export default function AcceptableUseReport(){
  const [filter,setFilter]=useState('');
  const {data:me}=useQuery({queryKey:['aupAdminSelf'],queryFn:()=>base44.auth.me(),staleTime:60000});
  const {data,refetch,isLoading,isError} = useQuery({
    queryKey:['acceptableUseAdminReports'],enabled:me?.role==='admin',
    queryFn:async()=> (await base44.functions.invoke('acceptableUsePolicy',{action:'report'})).data,
    staleTime:30000
  });
  const rows=useMemo(()=>{
    const needle=filter.trim().toLowerCase();
    return (data?.records||[]).filter(row=>!needle || [row.user_email,row.user_name,row.signed_name,row.policy_version].some(x=>String(x||'').toLowerCase().includes(needle)));
  },[data?.records,filter]);
  const exportCSV=()=>{
    const escape=x=>'"'+String(x??'').replaceAll('"','""')+'"';
    const cols=['Employee','Email','Signed Name','Accepted At','Policy Version','Status'];
    const text=[cols.join(','),...rows.map(row=>[row.user_name,row.user_email,row.signed_name,row.accepted_at,row.policy_version,row.status].map(escape).join(','))].join('\r\n');
    const blob=new Blob([text],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pathfinder-acceptable-use-approvals.csv';a.click();URL.revokeObjectURL(url);
  };
  if(me?.role!=='admin')return null;
  return <section className="rounded-xl border border-cyan-800/65 bg-[#0c1928] p-4 text-white" aria-label="Acceptable use approval report">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><div className="rounded-lg border border-cyan-700 bg-cyan-900/20 p-2 text-cyan-300"><FileCheck2 className="h-6 w-6"/></div><div><h2 className="text-sm font-black">Pathfinder Application User Agreement — Approved Acknowledgments</h2><p className="mt-1 text-xs text-slate-400">Signed first-login approvals · policy version {data?.policy_version||'2026-10-31-pathfinder-v2'}</p></div></div>
      <div className="flex gap-2"><div className="rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-sm font-black text-emerald-300">{data?.accepted_count||0} Approved</div><button type="button" onClick={()=>refetch()} className="rounded-lg border border-slate-600 px-3 py-2" title="Refresh approvals"><RefreshCw className="h-4 w-4"/></button><button type="button" onClick={exportCSV} disabled={!rows.length} className="flex items-center gap-1 rounded-lg border border-cyan-700 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40"><Download className="h-4 w-4"/>Export CSV</button></div>
    </div>
    <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3"><Search className="h-4 w-4 text-slate-400"/><input className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search employee, email, signer or version"/></label>
    {isLoading&&<p className="mt-3 text-xs text-slate-400">Loading signed approvals…</p>}
    {isError&&<p className="mt-3 text-xs text-red-300">Approval records could not be loaded. Use Refresh to try again.</p>}
    {!isLoading&&!isError&&<div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-700"><table className="w-full min-w-[690px] text-left text-xs"><thead className="sticky top-0 bg-slate-900 text-slate-300"><tr><th className="p-3">Employee</th><th className="p-3">Signed Name</th><th className="p-3">Accepted</th><th className="p-3">Policy</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.user_id+'-'+row.accepted_at+'-'+index} className="border-t border-slate-800 text-slate-200"><td className="p-3"><b>{row.user_name||'Unknown'}</b><p className="text-slate-500">{row.user_email}</p></td><td className="p-3">{row.signed_name}</td><td className="p-3">{row.accepted_at?new Date(row.accepted_at).toLocaleString():''}</td><td className="p-3">{row.policy_version}</td><td className="p-3"><span className="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck className="h-4 w-4"/>Approved</span></td></tr>)}{!rows.length&&<tr><td colSpan={5} className="p-5 text-center text-slate-400">No approved acknowledgments match these filters.</td></tr>}</tbody></table></div>}
  </section>;
}
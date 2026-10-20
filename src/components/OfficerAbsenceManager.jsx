import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { listDirectoryUsers } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { previewDisplayName } from '@/utils/previewIdentity';
import { actingCoverage } from '@/utils/commandReporting';
import { isOutOfOffice } from '@/utils/outOfOffice';
import { useAvailabilityClock } from '@/hooks/useAvailabilityClock';
import AdminOutOfOffice from '@/components/AdminOutOfOffice';

export default function OfficerAbsenceManager() {
 const {user,isLoadingAuth} = useAuth();
 const allowed=user?.role==='admin' || [].concat(user?.additional_roles||[]).includes('full_access');
 const [search,setSearch]=useState('');
 const [selectedId,setSelectedId]=useState('');
 useAvailabilityClock();
 const {data:people=[],isPending,isError,refetch}=useQuery({queryKey:['officerCoverageDirectory'],queryFn:()=>listDirectoryUsers('last_name',1500,true),enabled:allowed,staleTime:30000});
 const officers=people.filter(isOperationalOfficer);
 const selected=officers.find(person=>person.id===selectedId);
 const preview=selected?actingCoverage({...selected,out_of_office:true,out_of_office_start:new Date(Date.now()-1000).toISOString(),out_of_office_return:new Date(Date.now()+60000).toISOString()},people):null;
 const matches=officers.filter(person=>[previewDisplayName(person),person.email,person.unit_number,person.platoon].join(' ').toLowerCase().includes(search.toLowerCase()));
 if(isLoadingAuth) return <p className="p-5 text-slate-300">Loading access…</p>;
 if(!allowed) return <p className="p-5 text-slate-300">Administrator access required.</p>;
 return <section id="out-of-office" className="space-y-4 bg-[#07101b] p-4 text-white md:p-5">
  <header><h1 className="text-2xl font-black">Out of Office & Coverage</h1><p className="mt-2 text-sm text-slate-400">Set an officer’s absence and return time. Acting platoon and site coverage is selected automatically; permanent assignments stay intact.</p></header>
  <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
   <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
    <label className="block text-xs text-slate-400">Find an officer<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Rank, last name, unit or platoon" className="mt-2 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white"/></label>
    {isPending?<p className="p-4 text-sm">Loading officers…</p>:isError?<button type="button" onClick={()=>refetch()} className="p-4 text-cyan-300">Could not load officers. Retry</button>:<div className="mt-3 max-h-[65vh] space-y-2 overflow-auto">{matches.map(person=><button type="button" aria-pressed={selectedId===person.id} key={person.id} onClick={()=>setSelectedId(person.id)} className="flex min-h-16 w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 p-3 text-left hover:border-cyan-500 aria-pressed:border-cyan-400 aria-pressed:bg-cyan-950"><div><strong className="block text-sm">{previewDisplayName(person)}</strong><span className="mt-1 block text-xs text-slate-400">{person.platoon? 'Platoon '+person.platoon:'Command'}{isOutOfOffice(person)?' · Out until '+new Date(person.out_of_office_return).toLocaleString():person.out_of_office&&Date.parse(person.out_of_office_start)>Date.now()?' · Absence scheduled':' · Available'}</span></div><span className="text-xs font-bold text-cyan-200">{isOutOfOffice(person)?'Manage absence':'Set out of office'}</span></button>)}{!matches.length&&<p className="p-4 text-sm text-slate-400">No matching officers.</p>}</div>}
   </div>
   <div className="space-y-3 xl:sticky xl:top-3">
    {selected?<><div className="rounded-xl border border-cyan-700 bg-cyan-950/30 p-4"><h2 className="font-bold">{previewDisplayName(selected)}</h2><p className="mt-2 text-sm text-cyan-200">Automatic acting coverage: <strong>{preview?previewDisplayName(preview):'No available replacement'}</strong></p><p className="mt-1 text-xs text-slate-400">Next available rank within the platoon, then supervising command.</p></div><AdminOutOfOffice key={[selected.id,selected.out_of_office,selected.out_of_office_start,selected.out_of_office_return,selected.out_of_office_task_mode].join(':')} user={selected}/></>:<div className="rounded-xl border border-dashed border-cyan-800 p-6"><h2 className="font-bold text-cyan-200">Select “Set out of office” beside an officer</h2><p className="mt-2 text-sm text-slate-400">Start date, return date, held-task policy and automatic acting coverage appear here.</p></div>}
   </div>
  </div>
 </section>;
}

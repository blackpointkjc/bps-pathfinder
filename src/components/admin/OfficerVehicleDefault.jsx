import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { toast } from 'sonner';
export default function OfficerVehicleDefault({officer}){
 const qc=useQueryClient(),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false);
 const {data:vehicles=[],isError}=useQuery({queryKey:['companyVehicles'],queryFn:()=>base44.entities.Vehicle.list('vehicle_id',1000),staleTime:60000});
 const [feedback,setFeedback]=useState(''),[failed,setFailed]=useState(false);
 const current=vehicles.find(v=>v.assigned_to===officer.id);
 const vehicleId=draft??(current?.id||'');
 const save=async()=>{
  setBusy(true);setFailed(false);setFeedback('Saving vehicle default…');try{
   const response=await base44.functions.invoke('getFleetScheduleData',{action:'set_default',officer_id:officer.id,vehicle_id:vehicleId});
   if(response.data?.error)throw new Error(response.data.error);
   clearBase44ReadCacheMatching('function:getFleetScheduleData:');
   await Promise.all(['companyVehicles','fleetScheduleData','myVehicleAssignments'].map(key=>qc.invalidateQueries({queryKey:[key]})));
   qc.setQueryData(['fleetDefaultSync'],response.data.sync);setDraft(null);
   setFeedback('Default vehicle saved and scheduled shifts synchronized.');toast.success('Default vehicle saved and scheduled shifts synchronized.');
   if(response.data.sync?.conflicts?.length)toast.warning('Some reservations need review in Scheduling → Vehicles.');
  }catch(error){setFailed(true);setFeedback(error.response?.data?.error||error.message);toast.error(error.response?.data?.error||error.message);}finally{setBusy(false);}
 };
 return <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 xl:col-span-2"><h3 className="font-bold">Assigned vehicle</h3><p className="mt-1 text-xs text-slate-400">Reserve this vehicle automatically whenever this officer is scheduled. Shift-specific manual choices take priority.</p><div className="mt-3 flex flex-wrap gap-2"><select aria-label="Officer default vehicle" value={vehicleId} disabled={busy||isError} onChange={event=>setDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 p-2 text-sm"><option value="">No default vehicle</option>{vehicles.filter(v=>!v.assigned_to||v.assigned_to===officer.id).map(v=><option key={v.id} value={v.id}>{v.vehicle_id} · {v.make} {v.model} · {v.status}</option>)}</select><button type="button" disabled={busy||isError} onClick={save} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold">{busy?'Saving…':'Save vehicle default'}</button></div>{feedback&&<p role={failed?'alert':'status'} className={'mt-2 text-sm '+(failed?'text-red-300':'text-cyan-200')}>{feedback}</p>}{isError&&<p className="mt-2 text-xs text-red-300">Vehicle inventory could not load. Reopen this officer to retry.</p>}</section>;
}

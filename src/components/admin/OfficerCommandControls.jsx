import { useAuth } from '@/lib/AuthContext';
import { confirmInApp } from '@/lib/inAppDialog';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { invalidateAppDirectory } from '@/lib/appDirectory';
import { rankLevel } from '@/utils/rankPolicy';
import { toast } from 'sonner';
const field='mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-sm text-white';
const label=p=>[p?.rank,p?.last_name].filter(Boolean).join(' ')+(p?.unit_number?' · Unit '+p.unit_number:'');
export default function OfficerCommandControls({officer={},users=[]}){
 const qc=useQueryClient();
 const {user:actor}=useAuth();
 const {data:locks=[]}=useQuery({queryKey:['personnelAccountLock',officer.id],queryFn:()=>base44.entities.AccountLock.filter({user_id:officer.id},'-locked_at',1),enabled:!!officer.id&&actor?.role==='admin'});
 const lock=locks[0];
 const [lockMessage,setLockMessage]=useState('Please contact your supervisor for assistance.');
 const [platoon,setPlatoon]=useState(officer.platoon||'');
 const [oversight,setOversight]=useState(officer.oversight_platoon||'');
 const [parent,setParent]=useState(officer.supervisor_id||'');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const command=rankLevel(officer.rank)<=2;
 const eligible=users.filter(p=>p.id!==officer.id&&!p.termination_date&&rankLevel(p.rank)<rankLevel(officer.rank)&&(rankLevel(p.rank)<=2||p.platoon===platoon));
 const run=async(name,data)=>{
  setBusy(true);
  try{const response=await base44.functions.invoke(name,data);if(response.data?.error)throw new Error(response.data.error);invalidateAppDirectory();await qc.invalidateQueries();toast.success('Personnel record updated.');}
  catch(error){toast.error(error.response?.data?.error||error.message);}finally{setBusy(false);}
 };
 const save=()=>{
  const supervisor=eligible.find(p=>p.id===parent);
  if(parent&&!supervisor)return toast.error('Select an eligible higher-ranking supervisor for this platoon.');
  const next=users.find(p=>p.id===supervisor?.supervisor_id);
  run('updateUser',{userId:officer.id,updates:{next_level_supervisor_id:next?.id||'',next_level_supervisor_email:next?.email||'',next_level_supervisor_name:next?label(next):'',platoon:command?'Command':platoon,supervisor_id:supervisor?.id||'',supervisor_email:supervisor?.email||'',supervisor_name:supervisor?label(supervisor):'',...(officer.rank==='Major'?{oversight_platoon:oversight}:{})}});
 };
 const toggleLock=async()=>{
  if(busy||actor?.role!=='admin')return;
  if(!lock?.locked&&(!reason.trim()||!lockMessage.trim()))return toast.error('Enter a restriction reason and login message.');
  if(!await confirmInApp((lock?.locked?'Unlock ':'Lock ')+label(officer)+'?'))return;
  setBusy(true);try{
   const stamp=new Date().toISOString();
   const payload=lock?.locked?{locked:false,unlocked_by_email:actor.email,unlocked_at:stamp}:{user_id:officer.id,user_email:officer.email,locked:true,reason:reason.trim(),message:lockMessage.trim(),locked_at:stamp,locked_by_email:actor.email,locked_by_name:label(actor)};
   if(lock?.id)await base44.entities.AccountLock.update(lock.id,payload);else await base44.entities.AccountLock.create(payload);
   await qc.invalidateQueries({queryKey:['personnelAccountLock',officer.id]});toast.success('Account access updated.');
  }catch(error){toast.error(error.message);}finally{setBusy(false);}
 };
 if(!officer.id)return null;
 return <div className="grid items-start gap-4 xl:grid-cols-2">
  <section className="rounded-xl border border-slate-700 bg-slate-900 p-4"><h3 className="font-bold">Platoon & chain of command</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
   <label className="text-xs text-slate-400">Platoon<select className={field} value={command?'Command':platoon} disabled={command} onChange={event=>{setPlatoon(event.target.value);setParent('');}}><option value="">Unassigned</option><option>A</option><option>B</option><option>Command</option></select></label>
   {officer.rank==='Major'&&<label className="text-xs text-slate-400">Platoon oversight<select className={field} value={oversight} onChange={event=>setOversight(event.target.value)}><option value="">Unassigned</option><option>A</option><option>B</option></select></label>}
   <label className="text-xs text-slate-400">Permanent supervisor<select className={field} value={parent} onChange={event=>setParent(event.target.value)}><option value="">Unassigned / top of command</option>{eligible.map(p=><option key={p.id} value={p.id}>{label(p)}</option>)}</select></label>
  </div><button type="button" disabled={busy} onClick={save} className="mt-3 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold">Save command assignment</button></section>
  <section className="rounded-xl border border-slate-700 bg-slate-900 p-4"><h3 className="font-bold">CAD duty controls</h3><p className="mt-2 text-sm text-slate-300">Current status: {officer.status||'Out of Service'}</p><label className="mt-3 block text-xs text-slate-400">Reason for status restriction<input className={field} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Reason for supervisor override"/></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy||!reason.trim()} onClick={()=>run('forceOfficerStatus',{officer_id:officer.id,action:'force_oos',reason:reason.trim()})} className="rounded-lg border border-red-700 px-3 py-2 text-sm text-red-200 disabled:opacity-40">Restrict to Out of Service</button><button type="button" disabled={busy} onClick={()=>run('forceOfficerStatus',{officer_id:officer.id,action:'release'})} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Release CAD restriction</button></div><p className="mt-2 text-xs text-slate-400">Absence dates and acting coverage are managed directly below. Releasing a CAD restriction does not cancel approved leave.</p><details className="mt-3 border-t border-slate-700 pt-3"><summary className="cursor-pointer text-xs font-bold text-slate-300">Account & session controls</summary><p className="mt-2 text-xs text-slate-400">Use the reason above for a forced sign-out or account lock.</p>{actor?.role==='admin'&&<label className="mt-2 block text-xs text-slate-400">Message shown at login<input className={field} value={lockMessage} onChange={event=>setLockMessage(event.target.value)}/></label>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy||!reason.trim()} onClick={async()=>{if(await confirmInApp('End the active Pathfinder session for '+label(officer)+'?'))run('forceUserSignOut',{user_id:officer.id,reason:reason.trim()});}} className="rounded border border-amber-700 px-3 py-2 text-xs text-amber-200">Force sign out</button>{actor?.role==='admin'&&<button type="button" disabled={busy} onClick={toggleLock} className="rounded border border-red-700 px-3 py-2 text-xs text-red-200">{lock?.locked?'Unlock account':'Lock account'}</button>}</div></details></section>
 </div>;
}

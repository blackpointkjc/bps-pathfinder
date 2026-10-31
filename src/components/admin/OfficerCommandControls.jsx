import OfficerVehicleDefault from '@/components/admin/OfficerVehicleDefault';
import { useAuth } from '@/lib/AuthContext';
import { useState,useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { invalidateAppDirectory } from '@/lib/appDirectory';
import { rankLevel } from '@/utils/rankPolicy';
import { previewAutomaticSupervisor } from '@/utils/automaticReporting';
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
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState(''),[actionError,setActionError]=useState(false),[currentStatus,setCurrentStatus]=useState(officer.status||'Out of Service');
 useEffect(()=>{setPlatoon(officer.platoon||'');setCurrentStatus(officer.status||'Out of Service');},[officer.id,officer.platoon,officer.oversight_platoon,officer.supervisor_id,officer.status]);
 const fail=message=>{setActionError(true);setFeedback(message);toast.error(message);};
 const [pendingAction,setPendingAction]=useState(null);
 const command=rankLevel(officer.rank)<=2;
 const {data:regionalPlatoons=[],error:platoonError}=useQuery({
  queryKey:['companyPlatoons'],
  queryFn:async()=>{
   const result=await base44.functions.invoke('manageCompanyPlatoons',{action:'list'});
   const payload=result?.data||result||{};
   if(payload.error||payload.success!==true)throw new Error(payload.error||'Regional platoons unavailable');
   return payload.platoons||[];
  },enabled:!!officer.id,staleTime:60000,
 });
 const region=String(officer.division||'').trim().toLowerCase();
 const platoonOptions=[...new Set([
  ...regionalPlatoons.filter(p=>p.active!==false&&String(p.region||'').trim().toLowerCase()===region).map(p=>p.name),
  ...users.filter(p=>String(p.division||'').trim().toLowerCase()===region&&p.platoon&&p.platoon!=='Command').map(p=>p.platoon),
  ...(platoon&&!command?[platoon]:[]),
 ])].sort();
 const supervisorPreview=previewAutomaticSupervisor({...officer,platoon},users);
 const run=async(name,data)=>{
  if(busy)return false;
  setBusy(true);setActionError(false);setFeedback('Saving '+(name==='updateUser'?'command assignment':name==='forceUserSignOut'?'session action':'CAD restriction')+'…');
  try{
   const response=await base44.functions.invoke(name,data);
   if(response.data?.error||response.data?.success!==true)throw new Error(response.data?.error||'The server did not confirm this action.');
   if(response.data.status)setCurrentStatus(response.data.status);
   const success=name==='updateUser'?'Command assignment saved and verified.':name==='forceUserSignOut'?'Sign-out command sent successfully.':response.data.message||(data.action==='release'?'CAD restriction released.':'Officer restricted to Out of Service.');
   setFeedback(success);toast.success(success);
   invalidateAppDirectory();
   await qc.invalidateQueries();
   return true;
  }catch(error){fail(error.response?.data?.error||error.message);return false;}finally{setBusy(false);}
 };
 const save=()=>{
  if(!command&&platoon&&!platoonOptions.includes(platoon))return fail('The selected Platoon must exist in this Region.');
  run('updateUser',{userId:officer.id,updates:{platoon:command?'Command':platoon,...(command?{oversight_platoon:''}:{})}});
 };
 const toggleLock=async()=>{
  if(busy||actor?.role!=='admin')return;
  if(!lock?.locked&&(!reason.trim()||!lockMessage.trim()))return fail('Enter a restriction reason and login message.');
  setPendingAction(lock?.locked?'unlock':'lock');
 };
 const executeLock=async()=>{
  setBusy(true);try{
   const stamp=new Date().toISOString();
   const payload=lock?.locked?{locked:false,unlocked_by_email:actor.email,unlocked_at:stamp}:{user_id:officer.id,user_email:officer.email,locked:true,reason:reason.trim(),message:lockMessage.trim(),locked_at:stamp,locked_by_email:actor.email,locked_by_name:label(actor)};
   if(lock?.id)await base44.entities.AccountLock.update(lock.id,payload);else await base44.entities.AccountLock.create(payload);
   setActionError(false);setFeedback(lock?.locked?'Account unlocked successfully.':'Account locked successfully.');
   await qc.invalidateQueries({queryKey:['personnelAccountLock',officer.id]});toast.success('Account access updated.');setPendingAction(null);
  }catch(error){fail(error.message);}finally{setBusy(false);}
 };
 if(!officer.id)return null;
 return <div className="grid items-start gap-4 xl:grid-cols-2" aria-busy={busy}>
 {feedback&&<div role={actionError?'alert':'status'} className={'rounded-lg border p-3 text-sm xl:col-span-2 '+(actionError?'border-red-600 bg-red-950 text-red-100':'border-cyan-600 bg-cyan-950 text-cyan-100')}>{feedback}</div>}
  <section className="rounded-xl border border-slate-700 bg-slate-900 p-4"><h3 className="font-bold">Platoon & chain of command</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
   <label className="text-xs text-slate-400">Regional Platoon <span className="text-cyan-300">· {officer.division||'Assign Region first'}</span><select aria-label="Regional platoon assignment" className={field} value={command?'Command':platoon} disabled={command||!region} onChange={event=>setPlatoon(event.target.value)}><option value="">Unassigned</option>{command?<option value="Command">Company Command</option>:platoonOptions.map(name=><option key={name} value={name}>{name.startsWith('Platoon ')?name:`Platoon ${name}`}</option>)}</select>{!command&&!platoonOptions.length&&<span className="mt-1 block text-amber-300">This Region has no Platoons yet. Create one in Company Structure.</span>}{platoonError&&<span className="mt-1 block text-red-300">{platoonError.message}</span>}</label>
   <div className="rounded-lg border border-cyan-800 bg-cyan-950/30 p-3 text-xs text-cyan-200 sm:col-span-2"><div className="font-bold">Automatic reporting supervisor</div><div className="mt-1">{command?'Company Command reporting tier':supervisorPreview?label(supervisorPreview):'No higher-ranking supervisor in this regional Platoon'}</div><p className="mt-1 text-slate-400">Uses closest higher rank, local Division/Substation coverage, balanced report counts, then badge number. Updated when you save.</p></div>
  </div><button type="button" disabled={busy} onClick={save} className="mt-3 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold">{busy?'Saving…':'Save command assignment'}</button></section>
  <section className="rounded-xl border border-slate-700 bg-slate-900 p-4"><h3 className="font-bold">CAD duty controls</h3><p className="mt-2 text-sm text-slate-300">Current status: {currentStatus}</p><label className="mt-3 block text-xs text-slate-400">Reason for status restriction<input className={field} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Reason for supervisor override"/></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>{if(!reason.trim())return fail('Enter a reason before restricting this officer.');run('forceOfficerStatus',{officer_id:officer.id,action:'force_oos',reason:reason.trim()});}} className="rounded-lg border border-red-700 px-3 py-2 text-sm text-red-200 disabled:opacity-40">{busy?'Processing…':'Restrict to Out of Service'}</button><button type="button" disabled={busy} onClick={()=>run('forceOfficerStatus',{officer_id:officer.id,action:'release'})} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">{busy?'Processing…':'Release CAD restriction'}</button></div><p className="mt-2 text-xs text-slate-400">Absence dates and acting coverage are managed directly below. Releasing a CAD restriction does not cancel approved leave.</p><details className="mt-3 border-t border-slate-700 pt-3"><summary className="cursor-pointer text-xs font-bold text-slate-300">Account & session controls</summary><p className="mt-2 text-xs text-slate-400">Enter a reason before forcing sign-out or locking an account.</p><label className="mt-2 block text-xs text-slate-400">Reason for account or session action<input className={field} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Required reason for account action" /></label>{actor?.role==='admin'&&<label className="mt-2 block text-xs text-slate-400">Message shown at login<input className={field} value={lockMessage} onChange={event=>setLockMessage(event.target.value)}/></label>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>{if(!reason.trim())return fail('Enter a reason for forced sign-out.');setPendingAction('signout');}} className="rounded border border-amber-700 px-3 py-2 text-xs text-amber-200">Force sign out</button>{actor?.role==='admin'&&<button type="button" disabled={busy} onClick={toggleLock} className="rounded border border-red-700 px-3 py-2 text-xs text-red-200">{lock?.locked?'Unlock account':'Lock account'}</button>}{actor?.role!=='admin'&&<p className="w-full text-xs text-amber-300">Only a Pathfinder administrator can lock or unlock accounts.</p>}</div>{!reason.trim()&&<p className="mt-2 text-xs text-amber-300">A reason is required before you can complete either action.</p>}{pendingAction&&<div role="dialog" aria-label="Confirm account action" className="mt-3 rounded-lg border border-amber-600 bg-slate-950 p-3"><p className="text-sm text-white">{pendingAction==='signout'?'Force sign out':pendingAction==='lock'?'Lock account':'Unlock account'} for {label(officer)}?</p><p className="mt-1 text-xs text-slate-300">{pendingAction==='signout'?'This ends the Pathfinder session.':pendingAction==='lock'?'This blocks access to Pathfinder.':'This restores access to Pathfinder.'}</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={()=>setPendingAction(null)} className="rounded border border-slate-500 px-3 py-2 text-sm text-white">Cancel</button><button type="button" disabled={busy} onClick={async()=>{if(pendingAction==='signout'){const ok=await run('forceUserSignOut',{user_id:officer.id,reason:reason.trim()});if(ok)setPendingAction(null);}else await executeLock();}} className="rounded bg-amber-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'Processing…':'Confirm action'}</button></div></div>}</details></section>
  <OfficerVehicleDefault key={officer.id} officer={officer}/>
 </div>;
}

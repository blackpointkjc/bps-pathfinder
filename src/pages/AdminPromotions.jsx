import {useEffect,useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {invalidateAppDirectory} from '@/lib/appDirectory';
import {RANKS,rankLevel} from '@/utils/rankPolicy';
import {useQueryClient} from '@tanstack/react-query';
import {Award,ShieldCheck,Users,Megaphone,RefreshCw,AlertTriangle} from 'lucide-react';
import {toast} from 'sonner';

const field='h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white';
const block='rounded-xl border border-slate-700 bg-[#0c1b2c] p-4';
const stamp=()=>new Date().toISOString().slice(0,10);
const starting=()=>({officer_id:'',new_rank:'',platoon:'A',oversight_platoon:'A',supervisor_id:'',transfer_platoon:false,effective_date:stamp(),reason:''});
const nameOf=u=>[u.rank,u.name].filter(Boolean).join(' ');
export default function AdminPromotions(){
 const cache=useQueryClient();
 const [roster,setRoster]=useState([]),[form,setForm]=useState(starting),[preview,setPreview]=useState(null),[history,setHistory]=useState([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[complete,setComplete]=useState(null);
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const request=async payload=>{
   try{
     const response=await base44.functions.invoke('managePromotions',payload),result=response?.data||response||{};
     if(result.error)throw Object.assign(new Error(result.error),{result});return result;
   }catch(error){
     const details=error?.response?.data||error?.data||error?.result||{};
     const message=details.error||details.message||error?.message||'Command request failed';
     throw Object.assign(new Error(String(message).includes('status code 400')?
       'Invalid promotion details: choose an actual change to the officer rank or command assignment, and a valid higher-ranking supervisor.':message),{result:details});
   }
 };
 const reload=async()=>{
  setLoading(true);setError('');
  try{
   const [users,events]=await Promise.all([request({action:'roster'}),request({action:'history'})]);
   setRoster(users.officers||[]);setHistory(events.events||[]);
  }catch(err){setError(err.message||'Personnel roster unavailable');}finally{setLoading(false)}
 };
 useEffect(()=>{void reload();},[]);
 const selected=roster.find(officer=>officer.id===form.officer_id);
 const prospectiveRank=form.new_rank||selected?.rank||'Officer';
 const isCommand=['Colonel','Lt Colonel','Major'].includes(prospectiveRank);
 const eligibleSupervisors=useMemo(()=>roster.filter(officer=>officer.id!==selected?.id&&rankLevel(officer.rank)<rankLevel(prospectiveRank)),[roster,selected?.id,prospectiveRank]);
 const availableRanks=selected?RANKS.filter(rank=>rankLevel(rank)<=rankLevel(selected.rank)):RANKS;
 const adjust=(key,value)=>{setForm(current=>({...current,[key]:value}));setPreview(null);setComplete(null);setConfirm(false);setError('');};
 const chooseOfficer=id=>{const found=roster.find(item=>item.id===id);setForm({
  ...starting(),officer_id:id,new_rank:found?.rank||'Officer',platoon:['A','B'].includes(found?.platoon)?found.platoon:'A',
  oversight_platoon:found?.oversight_platoon||'A',supervisor_id:found?.supervisor_id||'',
 });setPreview(null);setConfirm(false);setComplete(null);setRequestId(crypto.randomUUID());};
 const showPreview=async event=>{event.preventDefault();setBusy(true);setError('');setConfirm(false);
  try{setPreview(await request({action:'preview',...form}));setRequestId(crypto.randomUUID());}
  catch(err){setError(err.message||'Promotion preview failed');setPreview(null);}finally{setBusy(false)}
 };
 const apply=async()=>{
  if(!preview||!confirm)return;
  setBusy(true);setError('');
  try{
   const result=await request({action:'apply',...form,version:preview.version,confirm:true,request_id:requestId});
   if(result.already_processed){toast.info('This promotion request has already been processed.');}
   else toast.success('Promotion / change of command completed; urgent company announcement published.');
   setComplete(result);setPreview(null);setConfirm(false);
   invalidateAppDirectory?.();
   for(const key of ['portalUsers','currentUser','adminPreviewPeople','directoryUsers','announcements','personnel','platoon'])cache.invalidateQueries({queryKey:[key]});
   window.dispatchEvent(new CustomEvent('bps-unread-refresh'));
   await reload();
  }catch(err){setError(err.message||'Command update failed');setComplete(err.result||null);setPreview(null);}
  finally{setBusy(false)}
 };
 return <div className="min-h-full bg-[#07111f] p-3 text-slate-100 sm:p-5"><div className="mx-auto max-w-6xl space-y-4">
  <header className={`${block} flex flex-wrap items-start justify-between gap-3`}><div><h1 className="flex items-center gap-2 text-xl font-black"><Award className="h-6 w-6 text-amber-300"/>Promotions & Change of Command</h1><p className="mt-1 text-sm text-slate-300">Administrator approval updates Manage Users, rank unit number, platoon command, and notifications.</p></div><button type="button" onClick={reload} disabled={loading||busy} className="flex items-center gap-2 rounded border border-cyan-600 px-3 py-2 text-xs font-bold"><RefreshCw size={15}/>{loading?'Loading…':'Refresh roster'}</button></header>
  <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
  <form onSubmit={showPreview} className={`${block} space-y-3`}>
   <h2 className="text-sm font-black uppercase tracking-wide text-cyan-200">1 · Select officer & new assignment</h2>
   <label className="block text-xs font-semibold">Officer to promote / reassign<select value={form.officer_id} onChange={e=>chooseOfficer(e.target.value)} className={`${field} mt-1`} required><option value="">Select employee…</option>{roster.map(u=><option key={u.id} value={u.id}>{nameOf(u)} · Unit {u.unit_number||'unassigned'} · {u.platoon||'unassigned'}</option>)}</select></label>
   {selected&&<p role="status" className="rounded border border-blue-900 bg-slate-950/70 p-3 text-xs">Current: <b>{nameOf(selected)}</b> · Unit {selected.unit_number||'—'} · {selected.platoon||'Unassigned'} platoon · Reports to {selected.supervisor_name||'Command staff'}</p>}
   <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold">New rank<select value={form.new_rank} onChange={e=>{adjust('new_rank',e.target.value)}} className={`${field} mt-1`} required>{availableRanks.map(rank=><option key={rank} value={rank}>{rank}</option>)}</select></label>
   <label className="block text-xs font-semibold">Effective date<input type="date" value={form.effective_date} onChange={e=>adjust('effective_date',e.target.value)} className={`${field} mt-1`} required/></label>
   <label className="block text-xs font-semibold">{isCommand?'Command assignment':'Platoon assignment'}<select value={isCommand?'Command':form.platoon} disabled={isCommand} onChange={e=>adjust('platoon',e.target.value)} className={`${field} mt-1`}>{(isCommand?['Command']:['A','B','Unassigned']).map(x=><option key={x} value={x}>{x==='A'||x==='B'?`Platoon ${x}`:x}</option>)}</select></label>
   {prospectiveRank==='Major'&&<label className="block text-xs font-semibold">Major oversees<select value={form.oversight_platoon} onChange={e=>adjust('oversight_platoon',e.target.value)} className={`${field} mt-1`}><option value="A">Platoon A</option><option value="B">Platoon B</option></select></label>}
   <label className="block text-xs font-semibold">Reports to (higher-ranking command)<select value={form.supervisor_id} onChange={e=>adjust('supervisor_id',e.target.value)} className={`${field} mt-1`}><option value="">{isCommand?'Company command (no superior selected)':'Select supervisor…'}</option>{eligibleSupervisors.map(u=><option key={u.id} value={u.id}>{nameOf(u)} · {u.platoon||'Command'}</option>)}</select></label></div>
   <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-600/30 bg-amber-950/20 p-3 text-xs"><input type="checkbox" checked={form.transfer_platoon} onChange={e=>adjust('transfer_platoon',e.target.checked)} className="mt-0.5 h-4 w-4"/><span><b>Change platoon command</b><span className="mt-1 block text-slate-300">Reassign eligible junior officers in the chosen platoon to report directly to the promoted command officer. A preview will list each affected officer before approval.</span></span></label>
   <label className="block text-xs font-semibold">Command reason / formal announcement note<textarea value={form.reason} onChange={e=>adjust('reason',e.target.value)} maxLength={800} rows={3} className={`${field} mt-1 h-auto py-2`} placeholder="Official promotion, effective command reassignment, remarks…"/></label>
   <button type="submit" disabled={!selected||busy||loading} className="w-full rounded-lg bg-cyan-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy?'Checking command roster…':'Preview rank, assignments & announcement'}</button>
  </form>
  <section className={`${block} space-y-3`}><h2 className="text-sm font-black uppercase tracking-wide text-cyan-200">2 · Review & approve</h2>
  {!preview&&<p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-400">Choose an officer and preview the changes before an administrator may approve them. Nothing changes during preview.</p>}
  {preview&&<div className="space-y-3">{preview.preview.no_changes&&<p role="status" className="rounded-lg border border-amber-600 bg-amber-950/40 p-3 text-xs text-amber-200">No changes selected. Choose a higher rank, a different reporting supervisor/platoon, or enable a valid change-of-command transfer. No update or announcement will be submitted until something actually changes.</p>}<div className="rounded-lg border border-amber-600 bg-amber-950/20 p-3"><h3 className="font-black text-amber-200">Formal command preview</h3><p className="mt-2 text-xs">{preview.preview.officer.name}: <b>{preview.preview.before.rank} → {preview.preview.after.rank}</b></p><p className="text-xs">Unit {preview.preview.before.unit_number||'—'} → {preview.preview.after.unit_number}</p><p className="text-xs">Platoon {preview.preview.before.platoon||'—'} → {preview.preview.after.platoon}</p><p className="text-xs">Reporting supervisor: {preview.preview.after.supervisor||'Company command'}</p><p className="text-xs">Rank pay baseline: ${Number(preview.preview.after.pay_rate||0).toFixed(2)}/hr</p></div>
  <div className="rounded border border-slate-700 p-3 text-xs"><b>Affected platoon members: {preview.preview.transfers.length}</b>{preview.preview.transfers.length>0&&<div className="mt-2 max-h-40 space-y-1 overflow-auto">{preview.preview.transfers.map(u=><div key={u.id}>{nameOf(u)} · {u.platoon} · formerly reporting to {u.supervisor_name||'Unassigned'}</div>)}</div>}</div>
  <p className="flex items-start gap-2 text-xs text-amber-200"><Megaphone className="h-4 w-4 shrink-0"/>Approval publishes an URGENT company-wide announcement visible in Pathfinder and sends the affected officer(s) command notifications.</p>
  <label className="flex items-start gap-2 rounded border border-amber-600 p-3 text-xs"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} className="mt-0.5"/><span>I am authorized to approve this formal promotion/command change, and I reviewed the affected officers, rank, and pay adjustment.</span></label>
  <button type="button" onClick={apply} disabled={!confirm||busy||preview.preview.no_changes} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><ShieldCheck className="h-4 w-4"/>Approve, update ranks & announce company-wide</button></div>}
  {complete&&<div role="status" className="rounded border border-emerald-700 p-3 text-sm text-emerald-100"><b>Command update:</b> {complete.success?'Completed':'Review required'} · {complete.transferred||0} platoon members reassigned. {complete.announcement_id?'Urgent announcement published.':'Announcement pending.'}{complete.warnings?.length>0&&<p className="mt-2 text-xs text-amber-300">{complete.warnings.join(' · ')}</p>}</div>}
  {error&&<div role="alert" className="flex gap-2 rounded-lg border border-red-600 bg-red-950/30 p-3 text-xs text-red-100"><AlertTriangle className="h-5 w-5 shrink-0"/>{error}</div>}
  </section></div>
  <section className={block}><h2 className="mb-3 flex items-center gap-2 text-sm font-black"><Users size={17}/>Promotion & command history</h2><div className="space-y-2">{history.map(item=><div key={item.id} className="rounded-lg border border-slate-700 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><b>{item.officer_name} · {item.previous_rank} → {item.new_rank}</b><span className={item.status==='complete'?'text-emerald-300':'text-amber-300'}>{item.status}</span></div><p className="mt-1 text-slate-300">{item.effective_date} · {item.new_platoon||'Command'} platoon · {item.transfer_count||0} command transfers · Announcement: {item.announcement_published?'Published':'Pending review'}</p>{item.warnings?.length>0&&<p className="text-amber-300">{item.warnings.join(' · ')}</p>}</div>)}{!history.length&&<p className="text-xs text-slate-400">No promotion events recorded.</p>}</div></section>
 </div></div>;
}

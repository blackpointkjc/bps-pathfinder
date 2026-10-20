import { confirmInApp } from '@/lib/inAppDialog';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listDirectoryLocations } from '@/lib/appDirectory';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Shield, Search, MapPin, CheckCircle2, Circle, Save, Plus } from 'lucide-react';
import AdminQRPrintManager from '@/pages/AdminQRPrintManager';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-50';
const textFields = [
 ['site_overview','Site overview'], ['patrol_schedule','Patrol schedule'], ['patrol_areas','Patrol areas'],
 ['special_duties','Special duties'], ['special_instructions','Special instructions'], ['shelter_locations','Shelter locations'],
];
const contactFields = [
 ['property_manager_name','Property manager'], ['property_manager_phone','Manager phone'],
 ['maintenance_contact','Maintenance contact'], ['access_codes','Access / key instructions'],
 ['emergency_police','Emergency police'], ['non_emergency_police','Non-emergency police'],
 ['police_precinct_address','Police precinct'], ['additional_contacts','Other contacts'],
];
function Field({ label, children }) { return <label className="block text-xs font-semibold text-slate-300">{label}{children}</label>; }
function Editor({ entity, record, seed, queryKey, children, onSaved }) {
 const [draft,setDraft] = useState(() => ({...seed,...record}));
 const [busy,setBusy] = useState(false);
 const savedId = useRef(record?.id);
 const draftKey = entity + ':' + (record?.id || seed.site_name || seed.property_site || 'new');
 const [dirty,setDirty] = useState(false);
 const qc = useQueryClient();
 const change = (field,value) => { window.dispatchEvent(new CustomEvent('operations-draft',{detail:{key:draftKey,dirty:true}})); setDirty(true); setDraft(previous=>({...previous,[field]:value})); };
 const save = async event => {
  event.preventDefault(); setBusy(true);
  try {
   const data = Object.fromEntries(Object.entries(draft).filter(([key])=>!['id','created_date','updated_date','created_by','created_by_id'].includes(key)));
   if (entity === 'QRCheckpoint' && (!data.checkpoint_name?.trim() || !data.location_label?.trim())) throw new Error('Checkpoint name and location are required.');
   if (entity === 'GeneralPostOrder' && (!data.section_title?.trim() || !data.content?.trim())) throw new Error('Section title and instructions are required.');
   if (entity === 'JobDutyRule' && (Number(data.qr_frequency_minutes)<1 || Number(data.qr_window_minutes)<1 || Number(data.qr_scans_per_shift)<0)) throw new Error('Use positive scan intervals and a non-negative scan count.');
   if (savedId.current) await base44.entities[entity].update(savedId.current,data);
   else { const created = await base44.entities[entity].create(data); savedId.current = created.id; }
   setDirty(false);
   window.dispatchEvent(new CustomEvent('operations-draft',{detail:{key:draftKey,dirty:false}}));
   await qc.invalidateQueries({queryKey});
   toast.success('Saved');
   onSaved?.();
  } catch(error) { toast.error(error?.message || 'Unable to save'); }
  finally { setBusy(false); }
 };
 return <form onSubmit={save} className="space-y-4" onKeyDown={event=>{if(event.key==='Enter' && event.target.tagName==='INPUT')event.preventDefault();}}>
  {children(draft,change)}
  <div className="flex items-center justify-between gap-3 border-t border-slate-700 pt-3"><span className="text-xs text-slate-400">{dirty ? 'Unsaved changes' : record ? 'Saved configuration' : 'Not configured yet'}</span><button disabled={busy} className={buttonClass}><Save className="h-4 w-4"/>{busy?'Saving…':'Save'}</button></div>
 </form>;
}
function Section({id,title,description,children}) {
 return <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 md:p-5"><div className="mb-4"><h2 className="text-lg font-bold text-white">{title}</h2><p className="mt-1 text-xs text-slate-400">{description}</p></div>{children}</section>;
}
function CheckpointEditor({checkpoint,site,email,onSaved}) {
 return <Editor onSaved={onSaved} entity="QRCheckpoint" record={checkpoint} seed={{property_site:site,checkpoint_name:'',location_label:'',zone_or_building:'',description:'',is_active:true,is_required:true,qr_unique_id:'QR-'+crypto.randomUUID(),created_by_admin:email,print_count:0}} queryKey={['qrCheckpoints']}>
  {(draft,change)=><>
   <div className="grid gap-3 sm:grid-cols-2">{[['checkpoint_name','Checkpoint name'],['location_label','Physical location'],['zone_or_building','Zone / building'],['description','Notes']].map(([field,label])=><Field key={field} label={label}><input className={inputClass} value={draft[field]||''} onChange={event=>change(field,event.target.value)}/></Field>)}</div>
   <div className="flex gap-5 text-sm">{[['is_active','Active'],['is_required','Required']].map(([field,label])=><label key={field} className="flex items-center gap-2"><input type="checkbox" checked={draft[field]!==false} onChange={event=>change(field,event.target.checked)}/>{label}</label>)}</div>
  </>}
 </Editor>;
}
function Expand({title,children}) {
 const [open,setOpen] = useState(false);
 return <section className="rounded-2xl border border-slate-700 bg-slate-900/80"><button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)} className="flex min-h-14 w-full items-center justify-between px-5 text-left font-bold text-white">{title}<span className="text-cyan-300">{open?'−':'+'}</span></button>{open&&<div className="border-t border-slate-700 p-4">{children}</div>}</section>;
}

export default function AdminOperationsWorkbench() {
 const {user,isLoadingAuth} = useAuth();
 const [scope,setScope]=useState('site');
 const [search,setSearch] = useState('');
 const [selected,setSelected] = useState('');
 const [newCheckpoint,setNewCheckpoint] = useState(false);
 const [newGeneral,setNewGeneral] = useState(false);
 const dirtyDrafts = useRef(new Set());
 useEffect(() => {
  const track = event => { const {key,dirty} = event.detail; if(dirty)dirtyDrafts.current.add(key);else dirtyDrafts.current.delete(key); };
  const unload = event => {if(dirtyDrafts.current.size){event.preventDefault();event.returnValue='';}};
  window.addEventListener('operations-draft',track);window.addEventListener('beforeunload',unload);
  return ()=>{window.removeEventListener('operations-draft',track);window.removeEventListener('beforeunload',unload);};
 },[]);
 const selectSite = async id => {
  if (id === selected) return;
  if (dirtyDrafts.current.size && !await confirmInApp('Switch properties and discard unsaved site changes?')) return;
  for(const key of dirtyDrafts.current) if(!key.startsWith('GeneralPostOrder:'))dirtyDrafts.current.delete(key);setSelected(id);setNewCheckpoint(false);
 };
 const canManage = user?.role === 'admin';
 const queryOptions = {enabled:canManage,staleTime:60000,refetchOnWindowFocus:false};
 const locationsQuery = useQuery({queryKey:['operationsLocations'],queryFn:()=>listDirectoryLocations('site_name',1000),...queryOptions});
 const ordersQuery = useQuery({queryKey:['postOrders'],queryFn:()=>base44.entities.PostOrder.list('site_name'),...queryOptions});
 const rulesQuery = useQuery({queryKey:['jobDutyRules'],queryFn:()=>base44.entities.JobDutyRule.list('property_site',1000),...queryOptions});
 const checkpointsQuery = useQuery({queryKey:['qrCheckpoints'],queryFn:()=>base44.entities.QRCheckpoint.list('-created_date',1000),...queryOptions});
 const generalQuery = useQuery({queryKey:['generalPostOrders'],queryFn:()=>base44.entities.GeneralPostOrder.list('sort_order'),...queryOptions});
 if(isLoadingAuth) return <p className="p-6 text-slate-300">Loading access…</p>;
 if(!canManage) return <p className="p-6 text-slate-300">Administrator access required.</p>;
 const queries=[locationsQuery,ordersQuery,rulesQuery,checkpointsQuery,generalQuery];
 if(queries.some(query=>query.isPending)) return <p role="status" className="p-6 text-slate-300">Loading site operations…</p>;
 if(queries.some(query=>query.isError)) return <div className="p-6 text-white">Site operations could not load. <button type="button" className="text-cyan-300" onClick={()=>queries.filter(query=>query.isError).forEach(query=>query.refetch())}>Retry</button></div>;
 const locations=locationsQuery.data||[];
 const site=locations.find(location=>location.id===selected)||locations[0];
 const order=(ordersQuery.data||[]).find(row=>row.site_name===site?.site_name);
 const rule=(rulesQuery.data||[]).find(row=>row.property_site===site?.site_name);
 const checkpoints=(checkpointsQuery.data||[]).filter(row=>row.property_site===site?.site_name);
 const general=generalQuery.data||[];
 const filtered=locations.filter(location=>[location.site_name,location.address,location.division].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <div className="min-h-full bg-[#07101c] p-3 text-slate-100 md:p-5">
  <div className="mx-auto max-w-[1700px] space-y-4">
   <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-300"><Shield className="h-4 w-4"/>Administration</div><h1 className="mt-2 text-2xl font-black">Site Operations</h1><p className="mt-1 text-sm text-slate-400">One property. Its instructions, patrol standards and checkpoints.</p></div><div className="text-sm text-slate-400">{locations.length} properties · {general.length} company instruction sections</div></header>
   <div className="flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-900 p-2" role="tablist" aria-label="Operations scope">{[['site','Property operations'],['company','Universal company orders']].map(([id,label])=><button key={id} type="button" role="tab" aria-selected={scope===id} onClick={()=>setScope(id)} className="rounded-lg px-4 py-3 text-sm font-bold aria-selected:bg-cyan-800 aria-selected:text-white hover:bg-slate-800">{label}</button>)}</div>
   {scope==='company'&&<div className="space-y-4"><header className="rounded-xl border border-cyan-900 bg-cyan-950/40 p-5"><h2 className="text-xl font-bold">Black Point company orders</h2><p className="mt-2 text-sm text-slate-300">Applies across the company. Property selection is not required.</p></header>
     <Section id="operations-company" title="Company-wide orders" description="Shared instructions appear at every property. Edit them once here.">
      <div className="space-y-3">{general.map(section=><details key={section.id} className="rounded-lg border border-slate-700 p-3"><summary className="cursor-pointer text-sm font-bold">{section.section_title}</summary><div className="mt-4"><Editor entity="GeneralPostOrder" record={section} seed={{}} queryKey={['generalPostOrders']}>{(draft,change)=><><Field label="Section title"><input className={inputClass} value={draft.section_title||''} onChange={event=>change('section_title',event.target.value)}/></Field><Field label="Instructions"><textarea rows={5} className={inputClass} value={draft.content||''} onChange={event=>change('content',event.target.value)}/></Field><label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.active!==false} onChange={event=>change('active',event.target.checked)}/>Active</label></>}</Editor></div></details>)}
      {newGeneral?<Editor onSaved={()=>setNewGeneral(false)} key="new-general" entity="GeneralPostOrder" seed={{section_key:'company_'+crypto.randomUUID(),section_title:'',content:'',active:true,sort_order:general.length+1}} queryKey={['generalPostOrders']}>{(draft,change)=><><Field label="Section title"><input className={inputClass} value={draft.section_title} onChange={event=>change('section_title',event.target.value)}/></Field><Field label="Instructions"><textarea rows={4} className={inputClass} value={draft.content} onChange={event=>change('content',event.target.value)}/></Field><button type="button" onClick={()=>setNewGeneral(false)} className="text-xs text-slate-400">Close new section</button></>}</Editor>:<button type="button" className={buttonClass} onClick={()=>setNewGeneral(true)}><Plus className="h-4 w-4"/>Add company instruction</button>}</div>
     </Section>
   <Section id="company-site-references" title="Site reference library" description="Handbook orders for properties that are not configured as company locations. These references do not add a location, assign an officer or create a shift.">
     <div className="space-y-3">{(ordersQuery.data||[]).filter(order=>order.reference_only&&!locations.some(site=>site.site_name===order.site_name)).map(order=><details key={order.id} className="rounded-xl border border-slate-700 bg-slate-950 p-4"><summary className="cursor-pointer font-semibold">{order.site_name}<span className="ml-3 text-xs font-normal text-slate-400">Reference · {order.post_type?.replace('_',' ')}</span></summary><div className="mt-4 space-y-4"><p className="text-sm text-slate-400">{order.site_address}</p>{order.site_map_url&&<img src={order.site_map_url} alt={'Site map for '+order.site_name} className="max-h-[550px] max-w-full rounded-lg object-contain"/>}<Editor entity="PostOrder" record={order} seed={{}} queryKey={['postOrders']}>{(draft,change)=><><Field label="Site overview"><textarea rows={4} className={inputClass} value={draft.site_overview||''} onChange={event=>change('site_overview',event.target.value)}/></Field><Field label="Reference instructions"><textarea rows={16} className={inputClass} value={draft.special_instructions||''} onChange={event=>change('special_instructions',event.target.value)}/></Field></>}</Editor></div></details>)}</div>
   </Section>
   </div>}
   {scope==='site'&&
   <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
    <aside className="rounded-2xl border border-slate-700 bg-slate-900 p-3 lg:sticky lg:top-3">
     <label className="flex items-center gap-2 rounded-lg border border-slate-600 px-2"><Search className="h-4 w-4 text-slate-400"/><input aria-label="Find a property" placeholder="Find a property" value={search} onChange={event=>setSearch(event.target.value)} className="min-h-11 min-w-0 w-full bg-transparent text-sm outline-none"/></label>
     <div className="mt-3 max-h-[30vh] space-y-1 overflow-auto lg:max-h-[65vh]">{filtered.map(location=><button type="button" key={location.id} aria-pressed={site?.id===location.id} onClick={()=>selectSite(location.id)} className="w-full rounded-lg border border-transparent p-3 text-left text-sm hover:bg-slate-800 aria-pressed:border-cyan-700 aria-pressed:bg-cyan-950"><span className="block font-bold">{location.site_name}</span><span className="mt-1 block text-xs text-slate-400">{location.division || location.address}{location.active===false?' · Inactive':''}</span></button>)}{!filtered.length&&<p className="p-3 text-xs text-slate-400">No matching properties.</p>}</div>
    </aside>
    <main className="min-w-0 space-y-4">
     {!site?<p className="p-6 text-slate-300">Create a location in Manage Locations to configure its operations.</p>:<>
      <div className="rounded-2xl border border-cyan-900 bg-gradient-to-r from-cyan-950/70 to-slate-900 p-5"><div className="flex items-center gap-2 text-xs text-cyan-300"><MapPin className="h-4 w-4"/>{site.address}</div><h2 className="mt-2 text-2xl font-black">{site.site_name}</h2><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">{[[!!order,'Instructions'],[!!rule,'Duty rules'],[checkpoints.length>0,checkpoints.length+' checkpoints']].map(([ready,label])=><span key={label} className="flex items-center gap-1.5 text-slate-300">{ready?<CheckCircle2 className="h-4 w-4 text-emerald-400"/>:<Circle className="h-4 w-4 text-amber-400"/>}{label}</span>)}</div><nav aria-label="Jump to section" className="mt-4 flex flex-wrap gap-4 text-xs font-bold text-cyan-200">{[['instructions','Instructions'],['duties','Patrol standards'],['checkpoints','Checkpoints']].map(([id,label])=><a key={id} href={'#operations-'+id} className="hover:underline">{label}</a>)}</nav></div>
      <Section id="operations-instructions" title="Site instructions & post orders" description="What officers need to know at this property. Site identity and supervisor assignments come from Manage Locations.">
       <Editor key={'post-'+site.id+'-'+(order?.id||'new')} entity="PostOrder" record={order} seed={{site_name:site.site_name,site_address:site.address||'',post_type:'armed',emergency_police:'911',assigned_supervisors:site.assigned_supervisors||[]}} queryKey={['postOrders']}>
        {(draft,change)=><>
         {order?.site_map_url&&<img src={order.site_map_url} alt={site.site_name+" site map"} className="max-h-[550px] max-w-full rounded-lg object-contain"/>}
         <Field label="Post type"><select className={inputClass} value={draft.post_type||'armed'} onChange={event=>change('post_type',event.target.value)}><option value="armed">Armed</option><option value="unarmed">Unarmed</option><option value="concealed_carry">Concealed carry</option></select></Field>
         <div className="grid gap-4 xl:grid-cols-2">{textFields.map(([field,label])=><Field key={field} label={label}><textarea rows={3} className={inputClass} value={draft[field]||''} onChange={event=>change(field,event.target.value)}/></Field>)}</div>
         <details className="rounded-lg border border-slate-700 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-200">Contacts, access & emergency information</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{contactFields.map(([field,label])=><Field key={field} label={label}><input className={inputClass} value={draft[field]||''} onChange={event=>change(field,event.target.value)}/></Field>)}</div></details>
        </>}
       </Editor>
      </Section>
      <Section id="operations-duties" title="Patrol & reporting standards" description="Machine-enforced requirements belong here; narrative instructions stay in post orders above.">
       <Editor key={'duty-'+site.id+'-'+(rule?.id||'new')} entity="JobDutyRule" record={rule} seed={{property_site:site.site_name,active:true,daily_activity_report_required:true,incident_report_required_for_property_calls:true,qr_required:false,qr_frequency_minutes:60,qr_window_minutes:30,qr_scans_per_shift:0,require_all_required_checkpoints:true,required_checkpoint_ids:[],updated_by:user.email||''}} queryKey={['jobDutyRules']}>
        {(draft,change)=><>
         <div className="grid gap-3 sm:grid-cols-2">{[['active','Rule active'],['daily_activity_report_required','Daily activity report each shift'],['incident_report_required_for_property_calls','Incident report for property calls'],['qr_required','QR patrol required'],['require_all_required_checkpoints','Complete every required checkpoint']].map(([field,label])=><label key={field} className="flex items-center gap-3 rounded-lg border border-slate-700 p-3 text-sm"><input type="checkbox" checked={!!draft[field]} onChange={event=>change(field,event.target.checked)}/>{label}</label>)}</div>
         <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Performance effective date"><input type="date" className={inputClass} value={draft.effective_date||''} onChange={event=>change('effective_date',event.target.value)}/></Field>{[['qr_frequency_minutes','Patrol interval (min)',1],['qr_window_minutes','Scan window (min)',1],['qr_scans_per_shift','Minimum scans / shift',0]].map(([field,label,min])=><Field key={field} label={label}><input type="number" min={min} className={inputClass} value={draft[field]??0} onChange={event=>change(field,Number(event.target.value))}/></Field>)}</div>
         <p className="text-xs text-amber-200">No missed-duty scoring before the effective date. Zero minimum scans uses checkpoint and interval rules.</p>
         <fieldset className="rounded-lg border border-slate-700 p-3"><legend className="px-2 text-xs text-slate-300">Required checkpoints</legend><div className="grid gap-2 sm:grid-cols-2">{checkpoints.filter(cp=>cp.is_active!==false).map(cp=><label key={cp.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(draft.required_checkpoint_ids||[]).includes(cp.id)} onChange={event=>change('required_checkpoint_ids',event.target.checked?[...(draft.required_checkpoint_ids||[]),cp.id]:(draft.required_checkpoint_ids||[]).filter(id=>id!==cp.id))}/>{cp.checkpoint_name}</label>)}{!checkpoints.length&&<p className="text-xs text-slate-400">Add checkpoints below.</p>}</div></fieldset>
         <Field label="Rule notes"><input className={inputClass} value={draft.notes||''} onChange={event=>change('notes',event.target.value)}/></Field>
        </>}
       </Editor>
      </Section>
      <Section id="operations-checkpoints" title="Patrol checkpoints" description="Create and edit this property's scan points here, then print their labels below.">
       <div className="space-y-3">{checkpoints.map(cp=><details key={cp.id} className="rounded-lg border border-slate-700 p-3"><summary className="cursor-pointer text-sm font-bold">{cp.checkpoint_name}<span className="ml-2 font-normal text-slate-400">{cp.location_label} · {cp.is_active===false?'Inactive':'Active'}</span></summary><div className="mt-4"><CheckpointEditor checkpoint={cp} site={site.site_name} email={user.email}/></div></details>)}
       {newCheckpoint?<div className="rounded-lg border border-cyan-700 p-4"><CheckpointEditor key={'new-'+site.id} site={site.site_name} email={user.email} onSaved={()=>setNewCheckpoint(false)}/><button type="button" onClick={()=>setNewCheckpoint(false)} className="mt-3 text-xs text-slate-400">Close new checkpoint</button></div>:<button type="button" onClick={()=>setNewCheckpoint(true)} className={buttonClass}><Plus className="h-4 w-4"/>Add checkpoint</button>}
       <Expand title="Print QR patrol labels"><AdminQRPrintManager key={site.id} siteName={site.site_name}/></Expand></div>
      </Section>
     </>}

    </main>
   </div>}
  </div>
 </div>;
}

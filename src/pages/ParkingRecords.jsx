import {useEffect,useMemo,useState} from 'react';
import { base44 } from '@/api/base44Client';
import { getClientPortalUser } from '@/utils/clientPreview';
import VehicleFields from '@/components/reports/VehicleFields';
import PropertyResidentPicker from '@/components/reports/PropertyResidentPicker';
import RentRollImportPanel from '@/components/reports/RentRollImportPanel';
import RecordsCheckButton from '@/components/reports/RecordsCheckButton';
import { vehicleSummary } from '@/lib/vehicleForm';
import { Car,Printer,Download,RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { uploadInternalFile } from '@/lib/internalUpload';

const escapeHtml = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const siteKey = value => String(value||'').split(' - ')[0].split(':')[0].trim().toLowerCase();
const formatMoney = amount => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(amount)||0);
const thisDay=()=>new Date().toISOString().slice(0,10);
const thisTime=()=>new Date().toTimeString().slice(0,5);
const blankTicket=()=>({violation_date:thisDay(),violation_time:thisTime(),vehicle_year:'',vehicle_make:'',vehicle_model:'',vehicle_color:'',license_plate:'',license_state:'VA',vehicle_vin:'',vehicle_owner:'',subject_name:'',subject_dob:'',unit_number:'',violation_type:'no_permit',description:'',photo_url:'',warning_issued:false});
const blankResident=()=>({full_name:'',unit_number:'',building:'',lease_status:'active',lease_start:'',lease_end:'',lease_id:'',monthly_rent:'',rent_due_day:'',resident_type:'tenant',phone:'',email:'',notes:'',vehicle_plate:'',vehicle_state:'VA',vehicle_year:'',vehicle_make:'',vehicle_model:'',vehicle_color:'',vehicle_vin:''});
const blankCar=()=>({resident_id:'',plate:'',state:'VA',year:'',make:'',model:'',color:'',vin:'',permit_number:'',permit_status:'active',vehicle_status:'registered'});
const standardTypes=[['no_permit','No parking permit'],['expired_permit','Expired permit'],['unauthorized_area','Unauthorized area'],['fire_lane','Fire lane'],['handicap_violation','Accessible parking violation'],['blocking_traffic','Blocking traffic'],['other','Other']];
const classes='h-10 w-full rounded-lg border border-slate-600 bg-[#0b1724] px-3 text-sm text-white';
const card='rounded-xl border border-slate-700 bg-[#101c2c] p-4';
const csvEscape = value => `"${String(value??'').replace(/^[=+@-]/,'\u0027$&').replace(/"/g,'""')}"`;
const csvDownload = (items,site) => {
 const columns=['violation_date','citation_number','location','unit_number','vehicle_owner','vehicle_year','vehicle_make','vehicle_model','vehicle_color','license_plate','license_state','violation_type','fine_amount','warning_issued','status','supervisor_review_status','client_review_status','description'];
 const rows=[columns.join(','),...items.map(row=>columns.map(key=>csvEscape(row[key])).join(','))];
 const link=document.createElement('a');const url=URL.createObjectURL(new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
 link.href=url;link.download=`parking-30-days-${siteKey(site).replace(/[^a-z0-9]+/g,'-')}-${thisDay()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
};
function printDocument(title,subtitle,body,openedWindow){
 const w=openedWindow||window.open('','_blank','width=850,height=960');if(!w){toast.error('Allow popups to print the parking record');return;}
 w.document.open();
 w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><style>body{font:13px Arial,sans-serif;max-width:820px;margin:auto;padding:26px;color:#111}header{display:flex;align-items:center;gap:18px;background:#10263c;color:#fff;padding:16px;border-bottom:5px solid #16a6c5;border-radius:8px}header img{width:68px;height:68px;object-fit:contain}h1{font-size:23px;margin:0}header .muted{color:#c9e2ef}h2{font-size:15px;margin:22px 0 8px}p{margin:5px 0}.muted{color:#555}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #aaa;padding:7px;text-align:left;vertical-align:top}th{background:#f3f4f6}.signature{padding-top:28px;border-bottom:1px solid #333;width:260px}img{max-width:320px;max-height:260px}@media print{button{display:none}body{padding:0;margin:8mm}thead{display:table-header-group}}</style></head><body><header><img src="/black-point-shield.webp" alt="Black Point Protection shield"/><div><p style="font-size:10px;font-weight:bold;letter-spacing:.12em;color:#80e0f5">BLACK POINT PROTECTION</p><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(subtitle)}</p></div></header>${body}<p class="muted" style="margin-top:25px">This is a private property security notice, not a government-issued citation. Fines must be supported by property policies and applicable law.</p></body></html>`);
 w.document.close();w.focus();setTimeout(()=>w.print(),350);
}
function printNotice(ticket,openedWindow){
 const fields=[['Citation',ticket.citation_number],['Date / time',`${ticket.violation_date||''} ${ticket.violation_time||''}`],['Property',ticket.location],['Unit / space',ticket.unit_number],['Subject / owner',ticket.subject_name||ticket.vehicle_owner],['Vehicle',vehicleSummary({...ticket,vehicle_plate:ticket.license_plate,vehicle_state:ticket.license_state})],['VIN',ticket.vehicle_vin],['Violation',ticket.violation_type],['Notice',ticket.warning_issued?'Warning only':'Property violation'],['Fine',ticket.warning_issued?'No fine':formatMoney(ticket.fine_amount)],['Details',ticket.description],['Officer',ticket.officer_name],['Approval',ticket.status],['Client response',ticket.client_review_status]];
 printDocument('PARKING VIOLATION NOTICE',ticket.citation_number||'',`<table>${fields.map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>${/^https:\/\//.test(ticket.photo_url||'')?`<h2>Vehicle evidence</h2><img src="${escapeHtml(ticket.photo_url)}" alt="Vehicle evidence"/>`:''}<h2>Officer signature</h2><div class="signature"></div><h2>Property / resident acknowledgment</h2><div class="signature"></div>`,openedWindow);
}
function print30Day(items,site,openedWindow){
 const filtered=items.filter(row=>String(row.violation_date||'')>=new Date(Date.now()-30*86400000).toISOString().slice(0,10));
 printDocument('30-DAY PARKING VIOLATION ROLL',`${site} · ${filtered.length} violation(s) · Generated ${new Date().toLocaleString()}`,`<table><thead><tr><th>Date</th><th>Notice</th><th>Unit</th><th>Vehicle / plate</th><th>Photo</th><th>Violation</th><th>Fine</th><th>Status</th></tr></thead><tbody>${filtered.map(row=>`<tr><td>${escapeHtml(row.violation_date)}</td><td>${escapeHtml(row.citation_number)}</td><td>${escapeHtml(row.unit_number)}</td><td>${escapeHtml(vehicleSummary({...row,vehicle_plate:row.license_plate,vehicle_state:row.license_state}))}</td><td>${/^https:\/\//.test(row.photo_url||'')?`<img src="${escapeHtml(row.photo_url)}" alt="Evidence photo" style="max-width:80px;max-height:70px"/>`:''}</td><td>${escapeHtml(row.violation_type)}</td><td>${escapeHtml(row.warning_issued?'Warning':formatMoney(row.fine_amount))}</td><td>${escapeHtml(row.status)}</td></tr>`).join('')}</tbody></table>`,openedWindow);
}

export default function ParkingRecords({mode='officer'}){
 const rentRollOnly=['rentroll','client-rentroll','admin-rentroll'].includes(mode);
 const client=['client','client-rentroll'].includes(mode);
 const admin=['admin','admin-rentroll'].includes(mode);
 const supervisor=mode==='supervisor'||admin;
 const [site,setSite]=useState(''),[sites,setSites]=useState([]),[tab,setTab]=useState(rentRollOnly?'residents':client||supervisor?'violations':'new'),[data,setData]=useState({violations:[],rules:[],residents:[],vehicles:[]}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [ticket,setTicket]=useState(blankTicket),[resident,setResident]=useState(blankResident),[residentId,setResidentId]=useState(''),[rule,setRule]=useState({label:'',violation_type:'no_permit',fine_amount:0,warning_only:false,active:true,description:''}),[ruleId,setRuleId]=useState('');
 const [reviewNotes,setReviewNotes]=useState(''),[statusFilter,setStatusFilter]=useState('all'),[photoUploading,setPhotoUploading]=useState(false),[editingTicketId,setEditingTicketId]=useState('');
 const [sessionUser,setSessionUser]=useState(null),[returnedTasks,setReturnedTasks]=useState([]);
 const [car,setCar]=useState(blankCar),[carId,setCarId]=useState(''),[rentSearch,setRentSearch]=useState(''),[siteAuto,setSiteAuto]=useState(false),[importing,setImporting]=useState(false);
 const action=async (name,payload={})=>{
  try{
    const response=await base44.functions.invoke('manageParkingRecords',{action:name,site_name:site,...payload});const output=response?.data||response||{};
    if(output.error)throw Error(output.error);
    return output;
  }catch(error){
    const detail=error?.response?.data||error?.data||{};
    throw new Error(detail?.error||detail?.message||error?.message||'Property records request failed');
  }
 };
 useEffect(()=>{let cancelled=false;(async()=>{
   try{
    const profile=client?await getClientPortalUser():await base44.auth.me();
    if(!cancelled)setSessionUser(profile);
    const clientSites=[...(Array.isArray(profile?.assigned_locations)?profile.assigned_locations:[]),...(Array.isArray(profile?.assigned_sites)?profile.assigned_sites:[]),...(profile?.assigned_location?[profile.assigned_location]:[])];
    // The backend resolves direct site assignments AND properties matched to
    // the signed-in client's assigned_client_email. Admin client-preview mode
    // still uses the selected client's preview-scoped site list.
    const response=await base44.functions.invoke('manageParkingRecords',{action:'sites'});
    const result=response?.data||response||{};
    if(result.error)throw Error(result.error);
    const serverAssigned=Array.isArray(result.sites)?result.sites:[];
    const dutySite=result.duty_site||'';
    // The backend is the authoritative ACTIVE-property list. Never append old
    // assignments or cached directory results; those can contain inactive sites.
    const locations=client&&profile?.__client_preview?
      serverAssigned.filter(loc=>clientSites.some(name=>siteKey(name)===siteKey(loc))):serverAssigned;
    const unique=[...new Map(locations.filter(Boolean).map(x=>[siteKey(x),String(x)])).values()];
    const urlSite=new URLSearchParams(window.location.search).get('site')||'';
    const preferred=unique.find(loc=>siteKey(loc)===siteKey(urlSite))||unique.find(loc=>siteKey(loc)===siteKey(dutySite))||
      (client?(unique.find(loc=>[...clientSites].some(x=>siteKey(x)===siteKey(loc)))||unique[0]||''):
        unique.length===1?unique[0]:'');
    if(!cancelled){setSites(unique);setSite(prev=>unique.some(name=>siteKey(name)===siteKey(prev))?prev:preferred);setSiteAuto(!!dutySite&&siteKey(preferred)===siteKey(dutySite));if(!unique.length)setError('No active, authorized properties are available for Parking or Rent Roll. Inactive properties are hidden.');}
   }catch(e){if(!cancelled)setError('Property locations unavailable: '+e.message);}
 })();return()=>{cancelled=true};},[client]);
 const refresh=async()=>{if(!site)return;setLoading(true);setError('');try{setData(await action(rentRollOnly?'rent_roll':'overview'));}catch(e){setError(e.message||'Parking records unavailable');}finally{setLoading(false)}};
 useEffect(()=>{if(client)return;let active=true;
   base44.functions.invoke('manageParkingRecords',{action:'officer_tasks'}).then(response=>{
     const result=response?.data||response||{};
     if(active&&Array.isArray(result.tasks))setReturnedTasks(result.tasks);
   }).catch(()=>{});
   return()=>{active=false};
 },[client]);
 useEffect(()=>{if(site)refresh();},[site]);
 const save=async (operation,payload,callback)=>{setBusy(true);setError('');try{await action(operation,payload);toast.success('Parking records updated');callback?.();await refresh();if(['resident_save','vehicle_save'].includes(operation))window.dispatchEvent(new CustomEvent('pathfinder:rent-roll-updated',{detail:{site}}));}catch(e){setError(e.message||'Update failed');toast.error(e.message||'Update failed');}finally{setBusy(false)}};
 const rules=data.rules||[],residents=data.residents||[],vehicles=data.vehicles||[],violations=data.violations||[];
 const ruleFor=rules.find(item=>item.violation_type===ticket.violation_type&&item.active!==false);
 const ruleChoices=[...new Map([...standardTypes,...rules.filter(item=>item.active!==false).map(item=>[item.violation_type,item.label])]).entries()];
 const plateKey=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const matchedVehicle=vehicles.find(v=>plateKey(v.plate)&&plateKey(v.plate)===plateKey(ticket.license_plate)
   && String(v.state||'').toUpperCase()===String(ticket.license_state||'').toUpperCase());
 const matchedResident=matchedVehicle?residents.find(item=>item.id===matchedVehicle.resident_id):residents.find(item=>plateKey(item.vehicle_plate)&&plateKey(item.vehicle_plate)===plateKey(ticket.license_plate)
   && String(item.vehicle_state||'').toUpperCase()===String(ticket.license_state||'').toUpperCase());
 const matchingResidents=useMemo(()=>residents.filter(item=>String(item.full_name||'').toLowerCase().includes(rentSearch.toLowerCase())||String(item.vehicle_plate||'').toLowerCase().includes(rentSearch.toLowerCase())||String(item.unit_number||'').toLowerCase().includes(rentSearch.toLowerCase())||vehicles.some(v=>v.resident_id===item.id&&String(v.plate||'').toLowerCase().includes(rentSearch.toLowerCase()))),[residents,vehicles,rentSearch]);
 const filteredViolations=violations.filter(row=>statusFilter==='all'||row.status===statusFilter);
 const exportRentRoll=()=>{
  if(!site)return;
  const columns=['Property','Resident','Unit','Building','Lease Status','Lease Start','Lease End','Monthly Rent','Rent Due Day','Vehicle Plate','State','Year','Make','Model','Color','Permit Number','Permit Status'];
  const rows=[columns];
  for(const resident of residents){
    const cars=vehicles.filter(car=>car.resident_id===resident.id);
    for(const car of cars.length?cars:[{}])rows.push([site,resident.full_name,resident.unit_number,resident.building,resident.lease_status,resident.lease_start,resident.lease_end,resident.monthly_rent??'',resident.rent_due_day??'',car.plate,car.state,car.year,car.make,car.model,car.color,car.permit_number,car.permit_status]);
  }
  const blob=new Blob([rows.map(row=>row.map(csvEscape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
  link.download=`rent-roll-${siteKey(site).replace(/[^a-z0-9]+/g,'-')}-${thisDay()}.csv`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 const export30=async type=>{
  if(!site)return;
  // iPhone/iPad Safari needs the print window to open synchronously in the
  // click handler, not after the async API response.
  const printWindow=type==='print'?window.open('','_blank','width=850,height=960'):null;
  if(printWindow){printWindow.document.write('<title>Preparing parking roll…</title><p>Preparing the property parking roll…</p>');}
  setBusy(true);setError('');
  try {
    const result=await action('export');
    if(result.truncated){printWindow?.close();setError('The 30-day export exceeded the safe export batch limit. Contact administration for the remaining pages.');return;}
    const records=result.violations||[];
    if(type==='csv')csvDownload(records,site);
    else print30Day(records,site,printWindow);
  }catch(error){printWindow?.close();setError('30-day parking export unavailable: '+(error.message||'Retry'))}
  finally{setBusy(false)}
 };
 const printAndSave=async event=>{event.preventDefault();if(!site)return;
  // Open print view inside the user gesture (before the network await) so iOS
  // Safari can print the officer notice after the authenticated save completes.
  const printWindow=window.open('','_blank','width=850,height=960');
  if(printWindow)printWindow.document.write('<title>Saving parking notice…</title><p>Saving parking ticket for printing…</p>');
  setBusy(true);try{
   const response=await action(editingTicketId?'resubmit':'issue',{id:editingTicketId||undefined,violation:{...ticket,
      resident_id:matchedResident?.id||ticket.resident_id||'',vehicle_record_id:matchedVehicle?.id||ticket.vehicle_record_id||'',resident_verified:!!matchedResident,
      vehicle_owner:ticket.vehicle_owner||matchedResident?.full_name||'',unit_number:ticket.unit_number||matchedResident?.unit_number||''}});
   if(printWindow)printNotice(response.violation,printWindow);
   setTicket(blankTicket());setEditingTicketId('');setTab('violations');await refresh();toast.success('Parking notice saved for supervisor review'+(printWindow?' and opened for printing':' — print from the notice list'));
  }catch(e){printWindow?.close();setError(e.message||'Ticket not saved');toast.error(e.message||'Ticket not saved');}finally{setBusy(false)}};
 return <div className="min-h-full bg-[#081321] p-3 text-slate-100 md:p-5">
  <div className="mx-auto max-w-6xl space-y-4">
   <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-black"><Car className="text-cyan-300"/>{rentRollOnly?'Property Rent Roll & Resident Vehicles':'Property Parking & Notices'}</h1><p className="text-xs text-slate-400">{rentRollOnly?'Resident and lease registry, multiple cars per household, parking permits and property CSV export':'Parking violation notices, property fine schedules, printable tickets and review status. Search residents and vehicles in Records AI or the ticket form.'}</p></div>
    <button onClick={refresh} disabled={!site||loading} className="flex items-center gap-2 rounded-lg border border-cyan-700 px-3 py-2 text-xs"><RefreshCw size={15}/>{loading?'Refreshing…':'Refresh records'}</button></header>
   {!client&&returnedTasks.length>0&&<div role="status" className="rounded-lg border border-amber-500/50 bg-amber-950/20 p-3"><div className="font-bold text-amber-200">{returnedTasks.length} parking notice{returnedTasks.length===1?' needs':'s need'} corrections</div><div className="mt-2 flex flex-wrap gap-2">{returnedTasks.slice(0,8).map(task=><button key={task.id} type="button" className="rounded border border-amber-600 px-2 py-1 text-xs text-amber-100" onClick={()=>{setSite(task.location);setTab('violations');setStatusFilter('rejected');}}>{task.citation_number||task.license_plate} · {task.location}</button>)}</div></div>}
   <div className="rounded-xl border border-cyan-700/50 bg-[#101f32] p-3"><label className="block text-xs font-black uppercase tracking-wide text-cyan-200">Active property / site assignment <select value={site} disabled={importing} onChange={e=>{setSite(e.target.value);setSiteAuto(false);setRentSearch('');setTicket(blankTicket());setResident(blankResident());setCar(blankCar());}} className={`${classes} mt-2`}><option value="">Choose property before searching or issuing a notice</option>{sites.map(loc=><option key={loc} value={loc}>{loc}</option>)}</select></label><p className="mt-1 text-[11px] text-slate-400">{siteAuto?'Automatically selected from your active on-duty shift. You may change the property when authorized.':'Resident searches and ticket records are restricted to the property selected here.'}</p></div>
   {!!error&&<div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{error}</div>}
   {site&&<><nav aria-label={rentRollOnly?'Rent roll':'Parking workflow'} className="flex flex-wrap gap-2">{[
     ...(rentRollOnly?[['residents','Rent Roll & Registered Vehicles']]:[
       ...(!client?[['new','Issue parking notice']]:[]),['violations','Parking notices'],...(client||admin?[['rules','Violation rules & fines']]:[])
     ])
   ].map(([key,label])=><button key={key} onClick={()=>setTab(key)} aria-current={tab===key?'page':undefined} className={`rounded-lg border px-3 py-2 text-xs font-bold ${tab===key?'border-cyan-500 bg-cyan-900 text-white':'border-slate-700 text-slate-300'}`}>{label}</button>)}</nav>
   {tab==='new'&&!client&&<form onSubmit={printAndSave} className={`${card} space-y-3`}><h2 className="text-base font-black">{editingTicketId?'Correct returned notice and resubmit':'New parking violation / printable ticket'}</h2>
    <PropertyResidentPicker site={site} onSelect={(person,registeredVehicle)=>setTicket(t=>({...t,
      resident_id:person.id,vehicle_record_id:registeredVehicle?.id||'',subject_name:person.full_name,
      vehicle_owner:person.full_name,unit_number:person.unit_number||'',
      ...(registeredVehicle?{license_plate:registeredVehicle.plate||'',license_state:registeredVehicle.state||'VA',
        vehicle_year:registeredVehicle.year||'',vehicle_make:registeredVehicle.make||'',vehicle_model:registeredVehicle.model||'',
        vehicle_color:registeredVehicle.color||'',vehicle_vin:registeredVehicle.vin||''}:{})
    }))}/>
    <div className="grid gap-3 sm:grid-cols-3">{[['violation_date','Date','date'],['violation_time','Time','time'],['unit_number','Apartment / parking space','text']].map(([field,label,type])=><label key={field} className="text-xs">{label}<input type={type} value={ticket[field]||''} onChange={e=>setTicket(t=>({...t,[field]:e.target.value}))} className={classes}/></label>)}</div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Person / registered owner<input value={ticket.subject_name||''} onChange={e=>setTicket(t=>({...t,subject_name:e.target.value,vehicle_owner:e.target.value}))} className={classes}/></label><label className="text-xs">Date of birth<input type="date" value={ticket.subject_dob||''} onChange={e=>setTicket(t=>({...t,subject_dob:e.target.value}))} className={classes}/></label></div>
    <VehicleFields value={{...ticket,vehicle_plate:ticket.license_plate,vehicle_state:ticket.license_state}} onChange={values=>setTicket(t=>({...t,...values,license_plate:values.vehicle_plate,license_state:values.vehicle_state}))}/>
    {matchedResident&&<div role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-2 text-xs text-emerald-200">Property rent-roll vehicle match: <b>{matchedResident.full_name}</b> · Unit {matchedResident.unit_number||'not recorded'} · Lease {matchedResident.lease_status||'unknown'} · Permit {matchedVehicle?.permit_status||'not recorded'}. This is an internal property registration, not DMV ownership verification.</div>}
    <RecordsCheckButton name={ticket.subject_name} plate={ticket.license_plate} site={site}/>
    <label className="block text-xs">Property violation<select value={ticket.violation_type} onChange={e=>setTicket(t=>({...t,violation_type:e.target.value}))} className={classes}>{ruleChoices.map(([id,name])=><option key={id} value={id}>{rules.find(item=>item.violation_type===id)?.label||name}</option>)}</select></label>
    <p className="text-xs text-slate-400">Fine according to this property’s rules: <b className="text-cyan-200">{ruleFor?.warning_only?'Warning only':formatMoney(ruleFor?.fine_amount||0)}</b>. Officers cannot change client fines.</p>
    <label className="block text-xs">Description / parking space / observed circumstances<textarea rows={3} value={ticket.description} onChange={e=>setTicket(t=>({...t,description:e.target.value}))} className={`${classes} h-auto py-2`}/></label>
    <label className="block text-xs">Vehicle evidence photo (optional)<input type="file" accept="image/*" capture="environment" disabled={busy||photoUploading} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setPhotoUploading(true);try{const uploaded=await uploadInternalFile(file);const url=uploaded?.file_url||uploaded?.url;if(!url)throw Error('Photo upload returned no link');setTicket(t=>({...t,photo_url:url}));toast.success('Vehicle photograph attached');}catch(error){setError('Vehicle photo could not upload: '+error.message)}finally{setPhotoUploading(false)}}} className={`${classes} h-auto py-2`}/></label>{ticket.photo_url&&<p className="text-xs text-emerald-300">Vehicle evidence attached</p>}
    <button disabled={busy||!ticket.license_plate} type="submit" className="rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold disabled:opacity-40"><Printer className="mr-2 inline h-4 w-4"/>{busy?'Saving…':editingTicketId?'Resubmit returned parking notice':'Submit, open printable ticket & send for review'}</button>
   </form>}
   {tab==='violations'&&<section className={`${card} space-y-3`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black">Parking violation history · {violations.length} notices</h2><div className="flex gap-2"><button onClick={()=>void export30('csv')} className="rounded-md border border-cyan-700 px-3 py-2 text-xs"><Download size={14} className="mr-1 inline"/>30-day CSV</button><button onClick={()=>void export30('print')} className="rounded-md border border-cyan-700 px-3 py-2 text-xs"><Printer size={14} className="mr-1 inline"/>30-day roll</button></div></div>
    <div className="flex flex-wrap gap-2"><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className={`${classes} max-w-40`}>{['all','issued','approved','rejected','draft'].map(value=><option key={value} value={value}>{value}</option>)}</select></div>
    <div className="space-y-2">{filteredViolations.map(item=><article key={item.id} className="rounded-lg border border-slate-600 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><b>{item.citation_number||item.id}</b><span>{item.violation_date} · {item.status||'issued'}</span><button type="button" className="rounded border border-cyan-700 px-2 py-1" onClick={()=>printNotice(item)}>Print ticket</button></div><p className="mt-1 text-slate-300">{item.unit_number?'Unit '+item.unit_number+' · ':''}{vehicleSummary({...item,vehicle_plate:item.license_plate,vehicle_state:item.license_state})} · {item.violation_type} · {item.warning_issued?'Warning':formatMoney(item.fine_amount)}</p><p className="mt-1 text-slate-400">Supervisor: {item.supervisor_review_status||'pending'} · Client: {item.client_review_status||'pending'}</p>{!client && item.status==='rejected'&&(admin||String(item.officer_id||item.created_by_id)===String(sessionUser?.id))&&<button type="button" className="mt-2 rounded border border-amber-600 px-3 py-1.5 text-amber-200" onClick={()=>{setTicket({...blankTicket(),...item});setEditingTicketId(item.id);setTab('new');}}>Correct & resubmit returned notice</button>}{item.supervisor_notes&&<p className="mt-1 text-amber-300">Supervisor: {item.supervisor_notes}</p>}{item.client_notes&&<p className="mt-1 text-amber-300">Client: {item.client_notes}</p>}
     {/^https:\/\//.test(item.photo_url||'')&&<a href={item.photo_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-cyan-300 underline">View vehicle evidence photo</a>}
     {Array.isArray(item.approval_history)&&item.approval_history.length>0&&<details className="mt-2 rounded border border-slate-700 p-2"><summary className="cursor-pointer text-cyan-200">Review timeline · {item.approval_history.length} event(s)</summary>{item.approval_history.slice(-15).map((event,i)=><p key={i} className="mt-1 text-[11px] text-slate-300">{event.at||''} · {event.action||''} · {event.actor||''}{event.notes?' — '+event.notes:''}</p>)}</details>}
     {(supervisor||client)&&<div className="mt-2 flex flex-wrap gap-2"><input value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} placeholder="Review note or requested changes" className={`${classes} flex-1`}/>{(client?[['acknowledged','Acknowledge'],['disputed','Dispute'],['resolved','Resolved']]:[['approved','Approve'],['returned','Send back']]).map(([value,label])=><button key={value} type="button" disabled={busy} onClick={()=>save('review',{id:item.id,status:value,notes:reviewNotes},()=>setReviewNotes(''))} className="rounded-md border border-cyan-700 px-2 py-1.5">{label}</button>)}</div>}
    </article>)}{!filteredViolations.length&&<p className="text-sm text-slate-400">No notices match this property and filter. If records are still loading, use Refresh records.</p>}</div>
   </section>}
   {tab==='residents'&&<section className={`${card} space-y-3`}><h2 className="text-lg font-black text-cyan-100">{site} · Property Rent Roll</h2><p className="text-xs text-slate-400">One resident can have multiple registered vehicles. Records entered here are available to officers on parking notices, internal records checks, and incident report parties at this property.</p><div className="grid gap-2 sm:grid-cols-3">{[['Residents',residents.length],['Registered vehicles',vehicles.length],['Active leases',residents.filter(r=>r.lease_status==='active').length]].map(([title,count])=><div key={title} className="rounded-lg border border-slate-700 bg-slate-950 p-3"><div className="text-2xl font-black text-white">{count}</div><div className="text-xs text-slate-400">{title}</div></div>)}</div><input aria-label="Search property rent roll" placeholder="Search residents, apartment, building or any vehicle plate…" value={rentSearch} onChange={e=>setRentSearch(e.target.value)} className="h-10 w-full max-w-md rounded-lg border border-slate-600 bg-slate-950 px-3 text-white"/>{!client&&rentSearch.length>=2&&<RecordsCheckButton name={rentSearch} site={site} compact/>}{(client||admin)&&<button type="button" onClick={exportRentRoll} className="rounded-lg border border-cyan-600 bg-[#10243c] px-3 py-2 text-xs font-black text-cyan-100"><Download className="mr-1 inline h-4 w-4"/>Download this property's rent roll (CSV)</button>}
    {(client||admin)&&<RentRollImportPanel site={site} onImported={refresh} onImportingChange={setImporting}/>}
    {(client||admin)&&<form onSubmit={e=>{e.preventDefault();save('resident_save',{resident,id:residentId||undefined},()=>{setResident(blankResident());setResidentId('')});}} className="space-y-3 rounded-lg border border-slate-700 p-3"><h3 className="text-sm font-bold">{residentId?'Edit':'Add'} property rent-roll resident</h3><div className="grid gap-2 sm:grid-cols-3">{[['full_name','Full name'],['unit_number','Unit / apartment'],['building','Building'],['lease_id','Lease reference'],['phone','Phone'],['email','Email']].map(([field,label])=><label key={field} className="text-xs">{label}<input value={resident[field]||''} onChange={e=>setResident(v=>({...v,[field]:e.target.value}))} className={classes}/></label>)}<label className="text-xs">Lease status<select value={resident.lease_status} onChange={e=>setResident(v=>({...v,lease_status:e.target.value}))} className={classes}>{['active','pending','former'].map(x=><option key={x}>{x}</option>)}</select></label><label className="text-xs">Resident/household role<select value={resident.resident_type||'tenant'} onChange={e=>setResident(v=>({...v,resident_type:e.target.value}))} className={classes}>{[['tenant','Tenant'],['leaseholder','Leaseholder'],['co_tenant','Co-tenant'],['authorized_occupant','Authorized occupant'],['other','Other resident']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div><div className="grid grid-cols-2 gap-2">{[['lease_start','Lease start'],['lease_end','Lease end']].map(([key,label])=><label key={key} className="text-xs">{label}<input type="date" className={classes} value={resident[key]||''} onChange={e=>setResident(v=>({...v,[key]:e.target.value}))}/></label>)}</div><p className="text-xs text-slate-400">Register vehicles separately below to associate multiple vehicles with the same household. Existing single-vehicle records remain searchable.</p><label className="block text-xs">Property notes<textarea value={resident.notes||''} onChange={e=>setResident(v=>({...v,notes:e.target.value}))} className="h-20 w-full rounded border border-slate-600 bg-slate-950 p-2 text-white"/></label><button type="submit" disabled={busy||!resident.full_name} className="rounded-md bg-cyan-700 px-4 py-2 text-xs font-bold">{residentId?'Update resident':'Save resident to rent roll'}</button></form>}
    {(client||admin)&&<form onSubmit={e=>{e.preventDefault();save('vehicle_save',{vehicle:car,id:carId||undefined},()=>{setCar(blankCar());setCarId('')})}} className="space-y-3 rounded-lg border border-cyan-800 p-3"><h3 className="text-sm font-black">{carId?'Update linked vehicle':'Register another vehicle to a resident'}</h3><label className="block text-xs">Rent-roll resident<select value={car.resident_id} onChange={e=>setCar(v=>({...v,resident_id:e.target.value}))} className={classes} required><option value="">Select resident on {site}…</option>{residents.map(item=><option key={item.id} value={item.id}>{item.full_name} · Unit {item.unit_number||'—'}</option>)}</select></label><VehicleFields compact value={{vehicle_year:car.year,vehicle_make:car.make,vehicle_model:car.model,vehicle_color:car.color,vehicle_plate:car.plate,vehicle_state:car.state,vehicle_vin:car.vin}} onChange={v=>setCar(current=>({...current,year:v.vehicle_year,make:v.vehicle_make,model:v.vehicle_model,color:v.vehicle_color,plate:v.vehicle_plate,state:v.vehicle_state,vin:v.vehicle_vin}))}/><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">Permit number<input className={classes} value={car.permit_number||''} onChange={e=>setCar(v=>({...v,permit_number:e.target.value}))}/></label><label className="text-xs">Permit status<select className={classes} value={car.permit_status||'active'} onChange={e=>setCar(v=>({...v,permit_status:e.target.value}))}>{['active','expired','revoked','pending','none'].map(x=><option key={x} value={x}>{x}</option>)}</select></label></div><button disabled={busy||!car.resident_id||!car.plate} type="submit" className="rounded-lg bg-cyan-700 px-4 py-2 text-xs font-black">{carId?'Update vehicle':'Add linked vehicle / permit'}</button></form>}
    <div className="grid gap-2 md:grid-cols-2">{matchingResidents.map(item=><div key={item.id} className="rounded-lg border border-slate-700 p-3 text-xs"><div className="flex justify-between gap-2"><b>{item.full_name}</b><span className="text-cyan-300">{item.lease_status}</span></div><p className="mt-1">Unit {item.unit_number||'—'} · {item.building||''} {item.lease_end?' · Lease end '+item.lease_end:''}</p><div className="mt-2 space-y-1">{vehicles.filter(v=>v.resident_id===item.id).map(v=><div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950 p-2"><span>{v.plate} · {v.state} · {v.year} {v.make} {v.model} · Permit {v.permit_status||'unknown'}</span>{(client||admin)&&!v.id.startsWith('legacy:')&&<button type="button" onClick={()=>{setCar({...v});setCarId(v.id)}} className="rounded border border-cyan-700 px-2 py-1">Edit vehicle</button>}</div>)}{!vehicles.some(v=>v.resident_id===item.id)&&<p className="text-slate-400">No registered vehicles</p>}</div>{(client||admin)&&<button type="button" onClick={()=>{setResident(item);setResidentId(item.id);setCar(c=>({...c,resident_id:item.id}))}} className="mt-2 rounded border border-cyan-800 px-2 py-1">Edit resident / add vehicle</button>}</div>)}{!matchingResidents.length&&<p className="text-xs text-slate-400">No matching resident or vehicle records.</p>}</div>
   </section>}
   {tab==='rules'&&(client||admin)&&<section className={`${card} space-y-3`}><h2 className="font-black">Property parking rules and fine schedule</h2><p className="text-xs text-amber-200">Enter only amounts your property is authorized to assess. Pathfinder does not collect fines or issue government penalties.</p>
    <form onSubmit={e=>{e.preventDefault();save('rule_save',{rule,id:ruleId||undefined},()=>{setRule({label:'',violation_type:'no_permit',fine_amount:0,warning_only:false,active:true,description:''});setRuleId('')})}} className="grid gap-2 sm:grid-cols-2"><label className="text-xs">Violation type<select value={rule.violation_type} onChange={e=>setRule(r=>({...r,violation_type:e.target.value}))} className={classes}>{standardTypes.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><label className="text-xs">Custom violation code (optional)<input placeholder="e.g. visitor_limit or tow_zone" value={rule.violation_type} onChange={e=>setRule(r=>({...r,violation_type:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'_')}))} className={classes}/></label><label className="text-xs">Property label<input value={rule.label} onChange={e=>setRule(r=>({...r,label:e.target.value}))} className={classes} required/></label><label className="text-xs">Fine amount ($)<input type="number" min="0" max="10000" step="0.01" value={rule.fine_amount} onChange={e=>setRule(r=>({...r,fine_amount:e.target.value}))} className={classes}/></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={rule.warning_only||false} onChange={e=>setRule(r=>({...r,warning_only:e.target.checked}))}/>Warning only (no fine)</label><label className="col-span-full text-xs">Policy details<textarea rows={2} value={rule.description} onChange={e=>setRule(r=>({...r,description:e.target.value}))} className={`${classes} h-auto`}/></label><button type="submit" disabled={busy||!rule.label} className="rounded bg-cyan-700 px-4 py-2 text-xs">Save property rule</button></form>
    <div className="space-y-2">{rules.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 p-2 text-xs"><span>{item.label} · {item.violation_type} · {item.warning_only?'Warning':formatMoney(item.fine_amount)}</span><button onClick={()=>{setRule(item);setRuleId(item.id)}} className="rounded border px-2 py-1">Edit</button></div>)}</div>
   </section>}
   </>}
  </div>
 </div>;
}

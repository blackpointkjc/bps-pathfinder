import {useEffect,useMemo,useRef,useState} from 'react';
import {base44} from '@/api/base44Client';
import {Search,Users,Car,RefreshCw,CheckCircle2} from 'lucide-react';

const plate=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const cls='h-11 w-full rounded-lg border border-slate-600 bg-[#0b1827] px-3 text-sm text-white';
const isMatch=(resident,cars,q)=>{
 const tokens=String(q||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
 const searchable=[resident.full_name,resident.unit_number,resident.building,resident.phone,resident.email,resident.lease_id,resident.lease_status,resident.lease_start,resident.lease_end,resident.resident_type,
  ...cars.flatMap(vehicle=>[vehicle.plate,vehicle.state,vehicle.make,vehicle.model,vehicle.year,vehicle.color,vehicle.vin,vehicle.permit_number,vehicle.permit_status,vehicle.vehicle_status,vehicle.unit_number])]
  .map(x=>String(x||'').toLowerCase());
 return tokens.every(token=>searchable.some(value=>value.includes(token)));
};
/** Typed, server-scoped registry search: records appear as selectable cards,
 * not a resident dropdown. Matching residents and their vehicles are returned
 * only from the selected authorized property. */
export default function PropertyResidentPicker({site,onSelect,label='Search resident or vehicle on this property',showVehicle=true}){
 const [query,setQuery]=useState(''),[data,setData]=useState({residents:[],vehicles:[],total_matches:0}),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [selected,setSelected]=useState(null),[reload,setReload]=useState(0);
 const latest=useRef(0);
 useEffect(()=>{setQuery('');setData({residents:[],vehicles:[],total_matches:0});setSelected(null);setError('');latest.current++;},[site]);
 useEffect(()=>{
  const q=query.trim();const seq=++latest.current;
  if(!site||q.length<2){setData({residents:[],vehicles:[],total_matches:0,query:''});setLoading(false);return;}
  setLoading(true);setError('');
  const timer=setTimeout(()=>{
   base44.functions.invoke('manageParkingRecords',{action:'resident_lookup',site_name:site,query:q}).then(res=>{
    if(seq!==latest.current)return;
    const payload=res?.data||res||{};if(payload.error)throw Error(payload.error);
    setData({residents:payload.residents||[],vehicles:payload.vehicles||[],total_matches:payload.total_matches||0,query:q});
   }).catch(err=>{if(seq===latest.current)setError(err?.response?.data?.error||err?.data?.error||err?.message||'Resident search unavailable')})
   .finally(()=>{if(seq===latest.current)setLoading(false)});
  },320);
  return()=>clearTimeout(timer);
 },[query,site,reload]);
 useEffect(()=>{
  const onUpdate=event=>{if(event.detail?.site===site)setReload(n=>n+1)};
  window.addEventListener('pathfinder:rent-roll-updated',onUpdate);
  return()=>window.removeEventListener('pathfinder:rent-roll-updated',onUpdate);
 },[site]);
 const rows=useMemo(()=>{
  // Never display cards from the previous search while a new query is pending.
  // A stale selection could attach the wrong resident to an incident/ticket.
  if(!query.trim()||data.query!==query.trim())return [];
  return data.residents.filter(row=>isMatch(row,data.vehicles.filter(car=>car.resident_id===row.id),query));
 },[data,query]);
 const select=(person,car=null)=>{setSelected({resident:person,vehicle:car});onSelect?.(person,car)};
 return <section className="space-y-3 rounded-xl border border-cyan-700/40 bg-[#0b2030] p-3 text-slate-100">
  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-cyan-200"><Users size={17}/><span className="min-w-0 flex-1">{label}</span><button type="button" disabled={!site||loading||query.trim().length<2} onClick={()=>setReload(n=>n+1)} className="flex items-center gap-1 rounded-md border border-cyan-700 px-2 py-1 text-xs"><RefreshCw size={14}/>Refresh</button></div>
  {!site?<p className="text-xs text-amber-300">Choose the property first to search its resident and vehicle records.</p>:<>
    <div className="relative"><Search size={16} className="absolute left-3 top-3.5 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Start typing a name, unit, phone, email, plate, VIN, make, model or permit…" className={`${cls} pl-10`} aria-label="Type to find property residents and vehicles" autoComplete="off"/></div>
    {query.trim().length<2&&<p className="text-xs text-slate-400">Type at least two characters. Results appear below; click the resident or vehicle to add it to your report.</p>}
    {loading&&<p role="status" className="text-xs text-cyan-200">Searching this property's records…</p>}
    {error&&<p role="alert" className="rounded border border-amber-600 bg-amber-950/30 p-2 text-xs text-amber-200">{error}</p>}
    {query.trim().length>=2&&data.query===query.trim()&&!loading&&!error&&<div role="status" className="text-xs text-slate-400">{rows.length?`Showing ${rows.length}${data.total_matches>rows.length?` of ${data.total_matches}`:''} matching residents. Select a person or registered vehicle below.`:'No matching resident or registered vehicle at this property.'}</div>}
    {rows.length>0&&<div className="max-h-72 space-y-2 overflow-y-auto" aria-label="Resident search results">{rows.map(row=>{
      const cars=data.vehicles.filter(v=>v.resident_id===row.id);
      const selectedResident=selected?.resident?.id===row.id;
      return <div key={row.id} className={`rounded-lg border p-2 ${selectedResident?'border-emerald-500 bg-emerald-950/20':'border-slate-700 bg-slate-950/60'}`}>
        <button type="button" onClick={()=>select(row)} className="flex w-full items-start gap-2 rounded p-2 text-left hover:bg-cyan-950/40"><Users size={16} className="mt-0.5 shrink-0 text-cyan-300"/><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">{row.full_name}</span><span className="block text-xs text-slate-300">Unit {row.unit_number||'—'}{row.building?` · ${row.building}`:''} · {row.lease_status||'unknown'} lease</span>{row.phone&&<span className="block text-xs text-slate-400">{row.phone}</span>}</span>{selectedResident&&!selected?.vehicle&&<CheckCircle2 size={17} className="text-emerald-300"/>}</button>
        {showVehicle&&cars.length>0&&<div className="mt-1 space-y-1 pl-4">{cars.map(car=><button type="button" key={car.id} onClick={()=>select(row,car)} className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-[#102135] px-3 py-2 text-left text-xs hover:border-cyan-500"><Car size={14} className="shrink-0 text-amber-300"/><span className="min-w-0 flex-1"><b>{plate(car.plate)} {car.state||'VA'}</b> · {car.year||''} {car.make||''} {car.model||''} {car.color||''} · Permit {car.permit_status||'unknown'}</span>{selectedResident&&selected?.vehicle?.id===car.id&&<CheckCircle2 size={16} className="shrink-0 text-emerald-300"/>}</button>)}</div>}
      </div>;
    })}</div>}
    {selected&&<p role="status" className="flex gap-2 rounded-lg border border-emerald-600 bg-emerald-950/30 p-2 text-xs text-emerald-200"><CheckCircle2 size={16} className="shrink-0"/>Selected {selected.resident.full_name} · Unit {selected.resident.unit_number||'—'}{selected.vehicle?` · Vehicle ${selected.vehicle.plate}`:''}. Linked to this form.</p>}
    <p className="text-[11px] text-slate-400">Internal Pathfinder property registry only—not DMV or independent tenancy verification.</p>
  </>}
 </section>;
}

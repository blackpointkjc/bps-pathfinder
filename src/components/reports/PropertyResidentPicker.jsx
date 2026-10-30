import {useEffect,useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {Search,Users,Car} from 'lucide-react';

const plate=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const cls='h-10 w-full rounded-lg border border-slate-600 bg-[#0b1827] px-3 text-sm text-white';
/** One property-scoped rent roll lookup shared by parking and incident reports.
 * Never searches other properties or claims DMV ownership verification.
 */
export default function PropertyResidentPicker({site,onSelect,label='Find resident / vehicle in this property rent roll',showVehicle=true}){
 const [query,setQuery]=useState(''),[data,setData]=useState({residents:[],vehicles:[]}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[residentId,setResidentId]=useState(''),[vehicleId,setVehicleId]=useState('');
 useEffect(()=>{
  let active=true;setData({residents:[],vehicles:[]});setResidentId('');setVehicleId('');setQuery('');setError('');
  if(!site)return;
  setLoading(true);
  base44.functions.invoke('manageParkingRecords',{action:'resident_lookup',site_name:site}).then(response=>{
   const result=response?.data||response||{};
   if(result.error)throw Error(result.error);
   if(active)setData({residents:result.residents||[],vehicles:result.vehicles||[]});
  }).catch(err=>{if(active)setError('Property rent roll unavailable: '+(err.message||'Retry'))}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[site]);
 const rows=useMemo(()=>{
  const q=query.trim().toLowerCase();if(!q)return (data.residents||[]).slice(0,60);
  return (data.residents||[]).filter(row=>[row.full_name,row.unit_number,row.building,...data.vehicles.filter(v=>v.resident_id===row.id).flatMap(v=>[v.plate,v.vin])].some(x=>String(x||'').toLowerCase().includes(q))).slice(0,60);
 },[data,query]);
 const chosen=data.residents.find(row=>row.id===residentId);
 const cars=data.vehicles.filter(vehicle=>vehicle.resident_id===residentId);
 const pickResident=id=>{setResidentId(id);setVehicleId('');const found=data.residents.find(row=>row.id===id);if(found)onSelect?.(found,null)};
 const pickCar=id=>{setVehicleId(id);const found=cars.find(row=>row.id===id);if(chosen)onSelect?.(chosen,found||null)};
 return <section className="space-y-2 rounded-lg border border-cyan-700/40 bg-[#0b2030] p-3 text-slate-100">
  <div className="flex items-center gap-2 text-sm font-bold text-cyan-200"><Users size={17}/>{label}</div>
  {!site?<p className="text-xs text-amber-300">Select the incident / parking property first to use its rent roll.</p>:<>
   <label className="relative block"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Type resident name, apartment/unit, plate or VIN…" className={`${cls} pl-9`} aria-label="Search property residents and registered vehicles"/></label>
   {loading&&<p className="text-xs text-cyan-300">Loading this property’s rent roll…</p>}
   {error&&<p role="alert" className="text-xs text-amber-300">{error}</p>}
   {!loading&&<select value={residentId} onChange={e=>pickResident(e.target.value)} className={cls} aria-label="Select matching property resident"><option value="">Select resident ({rows.length} matching)…</option>{rows.map(row=><option key={row.id} value={row.id}>{row.full_name} · Unit {row.unit_number||'—'} · {row.lease_status||'unknown'}</option>)}</select>}
   {chosen&&<div className="text-xs text-emerald-200">Rent-roll match: <b>{chosen.full_name}</b> · Unit {chosen.unit_number||'—'} · {chosen.lease_status||'unknown'} lease {chosen.lease_end?`· ends ${chosen.lease_end}`:''}</div>}
   {chosen&&showVehicle&&<label className="block text-xs"><span className="mb-1 flex items-center gap-1 text-cyan-200"><Car size={14}/>Registered vehicle to attach (optional)</span><select value={vehicleId} onChange={e=>pickCar(e.target.value)} className={cls}><option value="">No vehicle selected / person only</option>{cars.map(car=><option key={car.id} value={car.id}>{plate(car.plate)} · {car.state||'VA'} · {car.year||''} {car.make||''} {car.model||''} · Permit {car.permit_status||'unknown'}</option>)}</select></label>}
   <p className="text-[11px] text-slate-400">Internal Pathfinder property records only. This does not verify legal vehicle ownership, DMV status, or current tenancy independently.</p>
  </>}
 </section>;
}

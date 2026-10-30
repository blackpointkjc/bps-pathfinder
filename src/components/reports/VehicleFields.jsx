import React from 'react';
import { US_STATES } from '@/lib/vehicleForm';
const PARTS=[['vehicle_year','Year'],['vehicle_make','Make'],['vehicle_model','Model'],['vehicle_color','Color'],['vehicle_plate','Plate'],['vehicle_vin','VIN']];
export default function VehicleFields({value={},onChange,plateField='vehicle_plate',stateField='vehicle_state',prefix='vehicle',compact=false}){
  const parts=PARTS.map(([field,label])=>[field==='vehicle_plate'?plateField:field,label]);
  return <fieldset className="min-w-0 rounded-xl border border-slate-600/50 p-3">
    <legend className="px-1 text-sm font-semibold">Associated vehicle</legend>
    <div className={`grid gap-2 ${compact?'sm:grid-cols-3':'sm:grid-cols-2 lg:grid-cols-4'}`}>
      {parts.map(([name,label])=><label key={name} className="min-w-0 text-xs font-medium"><span className="mb-1 block">{label}</span><input name={`${prefix}-${name}`} aria-label={label} value={value[name]||''} onChange={e=>onChange({...value,[name]:name===plateField?e.target.value.toUpperCase():e.target.value})} className="h-10 w-full min-w-0 rounded-md border border-slate-500 bg-slate-950 px-2 text-sm text-white"/></label>)}
      <label className="min-w-0 text-xs font-medium"><span className="mb-1 block">Registration state</span><select aria-label="Vehicle registration state" value={value[stateField]||''} onChange={e=>onChange({...value,[stateField]:e.target.value})} className="h-10 w-full rounded-md border border-slate-500 bg-slate-950 px-2 text-sm text-white"><option value="">Select state</option>{US_STATES.map(([abbr,name])=><option key={abbr} value={abbr}>{name} ({abbr})</option>)}</select></label>
    </div>
  </fieldset>;
}

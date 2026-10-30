import { useState } from 'react';
import { Layers } from 'lucide-react';
import { emergencyStations } from '@/lib/emergencyStationCatalog';

const options = [
  ['showFireStations', 'Fire stations'],
  ['showRescueStations', 'Volunteer rescue squads'],
  ['showEMS', 'Ambulance stations'],
  ['showPoliceStations', 'Police stations / precincts'],
  ['showJails', 'Jails'],
];
const regions = [['richmondFacilities','Richmond'],['henricoFacilities','Henrico'],['chesterfieldFacilities','Chesterfield']];

export default function MapIconFilters({ filters, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (key, checked) => onChange({ ...filters, [key]: checked });
  return <div className="pointer-events-auto relative">
    <button type="button" aria-expanded={open} aria-controls="map-icon-filter-options" onClick={()=>setOpen(value=>!value)}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-500 bg-slate-900 px-3 text-xs font-bold text-white">
      <Layers className="h-4 w-4" />Map icons
    </button>
    {open && <div id="map-icon-filter-options" className="absolute right-0 top-full z-[1400] mt-2 max-h-[65dvh] w-72 overflow-y-auto rounded-xl border border-slate-500 bg-slate-950 p-3 text-sm text-white shadow-2xl">
      <p className="font-bold">Show map icons</p>
      {options.map(([key,label])=><label key={key} className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={filters[key]===true} onChange={event=>toggle(key,event.target.checked)} className="h-4 w-4 accent-cyan-500"/>{label}
      </label>)}
      <fieldset className="mt-2 border-t border-slate-600 pt-2">
        <legend className="font-bold">Fire / rescue regions</legend>
        {regions.map(([key,label])=><label key={key} className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={filters[key]!==false} onChange={event=>toggle(key,event.target.checked)} className="h-4 w-4 accent-cyan-500"/>{label}
          <span className="ml-auto text-xs text-slate-300">{emergencyStations.filter(station=>station.agency===key.replace('Facilities','')).length}</span>
        </label>)}
      </fieldset>
      <p className="mt-2 text-xs text-slate-300">Hover for details. Click to open a popup. Choose Navigate to start GPS routing.</p>
    </div>}
  </div>;
}

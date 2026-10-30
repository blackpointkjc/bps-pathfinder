import { useState } from 'react';
import { Layers } from 'lucide-react';
import { emergencyStations } from '@/lib/emergencyStationCatalog';

const options = [
 ['showFireStations','Fire stations','Fire engines & companies','fire'],
 ['showRescueStations','Rescue squads','Volunteer rescue services','rescue'],
 ['showEMS','Ambulance stations','EMS bases','rescue'],
 ['showPoliceStations','Police stations','Headquarters & precincts','police'],
 ['showJails','Jails','Correctional facilities','jail'],
];
const regions = [['richmondFacilities','Richmond'],['henricoFacilities','Henrico'],['chesterfieldFacilities','Chesterfield']];

export function MapIconFilterContent({ filters, onChange }) {
 const toggle=(key,checked)=>onChange({...filters,[key]:checked});
 return <div className="pf-layer-content">
   <p className="pf-panel-eyebrow">Map layers</p><h2>Places & facilities</h2>
   <p className="pf-panel-description">Choose what appears on your map.</p>
   <div className="pf-layer-options">
     {options.map(([key,label,description,kind])=><label key={key} className="pf-layer-option">
       <span className={'pf-layer-swatch '+kind}/><span className="pf-layer-copy"><strong>{label}</strong><small>{description}</small></span>
       <input type="checkbox" role="switch" checked={filters[key]===true} onChange={event=>toggle(key,event.target.checked)} aria-label={label}/>
     </label>)}
   </div>
   <fieldset className="pf-region-options"><legend>Fire & rescue coverage</legend>
     {regions.map(([key,label])=><label key={key}><input type="checkbox" checked={filters[key]!==false} onChange={event=>toggle(key,event.target.checked)}/><span>{label}</span><small>{emergencyStations.filter(station=>station.agency===key.replace('Facilities','')).length} locations</small></label>)}
   </fieldset>
   <div className="pf-panel-hint">Select a marker for details. Routes start only after you choose Navigate.</div>
 </div>;
}

export default function MapIconFilters({filters,onChange}) {
 const [open,setOpen]=useState(false);
 return <div className="pf-layer-standalone">
   <button type="button" className="pf-map-secondary" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Layers size={16}/>Map layers</button>
   {open&&<div className="pf-map-tool-panel"><MapIconFilterContent filters={filters} onChange={onChange}/></div>}
 </div>;
}

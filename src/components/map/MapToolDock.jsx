import { Layers, MoreHorizontal, X } from 'lucide-react';
import { MapIconFilterContent } from './MapIconFilters';

export default function MapToolDock({actions, panel, onPanelChange, filters, onFiltersChange, top=64}) {
 const primary=actions.filter(action=>['search','recenter','fitunits','calls'].includes(action.key));
 const secondary=actions.filter(action=>!['search','recenter','fitunits','calls'].includes(action.key));
 const open=next=>onPanelChange(panel===next?null:next);
 return <div className="pf-map-tools" style={{top}}>
   <nav className="pf-map-dock" aria-label="Map tools">
     {primary.map(action=><button key={action.key} type="button" disabled={action.disabled} onClick={action.onClick}
       className={action.active?'is-active':''} aria-label={action.title} title={action.title} aria-pressed={action.active}>{action.icon}</button>)}
     <div className="pf-dock-divider"/>
     <button type="button" onClick={()=>open('layers')} className={panel==='layers'?'is-active':''} aria-label="Map layers" title="Map layers" aria-expanded={panel==='layers'}><Layers size={17}/></button>
     <button type="button" onClick={()=>open('more')} className={panel==='more'?'is-active':''} aria-label="More map tools" title="More map tools" aria-expanded={panel==='more'}><MoreHorizontal size={18}/></button>
   </nav>
   {panel&&<aside className="pf-map-tool-panel" aria-label={panel==='layers'?'Map layers':'More map tools'}>
     <button type="button" className="pf-panel-close pf-icon-button" aria-label="Close map tools" onClick={()=>onPanelChange(null)}><X size={16}/></button>
     {panel==='layers'?<MapIconFilterContent filters={filters} onChange={onFiltersChange}/>:<div className="pf-more-tools">
       <p className="pf-panel-eyebrow">Map tools</p><h2>More options</h2>
       {secondary.map(action=><button key={action.key} type="button" disabled={action.disabled} onClick={()=>{action.onClick?.();onPanelChange(null);}} aria-pressed={action.active}>{action.icon}<span>{action.title}</span></button>)}
     </div>}
   </aside>}
 </div>;
}

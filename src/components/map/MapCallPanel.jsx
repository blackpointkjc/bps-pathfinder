import { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronLeft, MapPin, Navigation2, LocateFixed, ExternalLink, Image, ShieldAlert, Users } from 'lucide-react';
import { cadReference } from '@/lib/cadReference';
import { cleanIncident } from '@/utils/callUtils';
import { formatEasternTime } from '@/lib/easternTime';
import AddressCallHistory from './AddressCallHistory';
import FieldCallActions from '@/components/dispatch/FieldCallActions';

export default function MapCallPanel({call,currentUser,district,collapsed,onCollapse,onClose,onLocate,onNavigate,routing,assigning,onAssign,onUnassign,onStreetView,onExternalMap,unitLabel,top=64}) {
 const [tab,setTab]=useState('overview');
 useEffect(()=>setTab('overview'),[call?.id]);
 if(!call)return null;
 const assigned=call.assigned_units?.includes(currentUser?.id);
 const priority=String(call.priority||'medium').toLowerCase();
 const reference=cadReference(call)||'Reference pending';
 if(collapsed)return <aside className="pf-call-collapsed" style={{top}}><button type="button" className="pf-icon-button" onClick={()=>onCollapse(false)} aria-label="Open call details"><ChevronLeft size={18}/></button></aside>;
 return <aside className="pf-map-call-panel" style={{top}} aria-label="Call details">
   <header className="pf-call-panel-heading"><span className="pf-panel-eyebrow">Selected call</span><div>
     <button type="button" className="pf-icon-button" onClick={()=>onCollapse(true)} aria-label="Collapse call details"><ChevronRight size={16}/></button>
     <button type="button" className="pf-icon-button" onClick={onClose} aria-label="Close call details"><X size={17}/></button>
   </div></header>
   <div className="pf-call-summary">
     <div className="pf-call-badges"><span className={'pf-priority-badge '+priority}>{priority}</span><span className="pf-call-state">{call.status||'New'}</span></div>
     <h2>{cleanIncident(call)}</h2>
     <p className="pf-call-address"><MapPin size={15}/><span>{call.location||'Address unavailable'}</span></p>
     <span className="pf-call-reference">{reference}</span>
     <div className="pf-call-primary-actions">
       <button type="button" className="pf-map-primary" disabled={routing||!call.latitude||!call.longitude} onClick={onNavigate}><Navigation2 size={15}/>{routing?'Finding route…':'Navigate'}</button>
       <button type="button" className="pf-map-secondary" onClick={onLocate}><LocateFixed size={15}/>Locate</button>
     </div>
   </div>
   <nav className="pf-call-tabs" aria-label="Call information">
     {[['overview','Overview'],['history','Address history'],['response','Response']].map(([key,label])=><button type="button" key={key} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}
   </nav>
   <div className="pf-call-panel-body">
     {call.hazards&&<section className="pf-call-hazard"><ShieldAlert size={17}/><div><strong>Safety information</strong><p>{call.hazards}</p></div></section>}
     {tab==='overview'&&<>
       <dl className="pf-call-facts">
         <div><dt>Agency</dt><dd>{call.agency||'—'}</dd></div>
         <div><dt>District</dt><dd>{district??call.zone??'—'}</dd></div>
         <div><dt>Received</dt><dd>{formatEasternTime(call.time_received||call.created_date)} ET</dd></div>
         <div><dt>Caller</dt><dd>{call.caller_name||'Not provided'}</dd></div>
       </dl>
       <section className="pf-call-section"><h3>Incident notes</h3><p>{call.description||'No additional notes have been provided.'}</p></section>
       {call.ai_summary&&<section className="pf-call-section"><h3>Analysis</h3><p>{call.ai_summary}</p></section>}
       <section className="pf-call-section"><h3><Users size={14}/>Assigned units</h3><div className="pf-unit-chips">{call.assigned_units?.length?call.assigned_units.map(id=><span key={id}>{unitLabel(id)}</span>):<p>No units assigned</p>}</div></section>
       <div className="pf-call-secondary-links">
         <button type="button" onClick={onExternalMap}><ExternalLink size={14}/>Google Maps</button>
         <button type="button" onClick={onStreetView} disabled={!call.latitude||!call.longitude}><Image size={14}/>Street view</button>
       </div>
     </>}
     {tab==='history'&&<AddressCallHistory address={call.location} excludeCallId={call.id}/>}
     {tab==='response'&&<section className="pf-call-response"><h3>Field response</h3><FieldCallActions call={call}/></section>}
   </div>
   <footer className="pf-call-footer"><span className={assigned?'pf-assignment-active':''}>{assigned?'You are assigned to this call':'Available for assignment'}</span>
     <button type="button" disabled={assigning} className="pf-map-secondary" onClick={assigned?onUnassign:onAssign}>{assigning?'Updating…':assigned?'Unassign me':'Assign to me'}</button>
   </footer>
 </aside>;
}

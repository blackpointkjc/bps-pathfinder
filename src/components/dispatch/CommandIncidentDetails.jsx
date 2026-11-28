import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {base44,clearBase44ReadCacheMatching} from '@/api/base44Client';
import {withRequestTimeout} from '@/lib/requestTimeout';
import {formatEasternDateTime} from '@/lib/easternTime';
import IncidentPrioritySelect from './IncidentPrioritySelect';
import AddressCallHistory from '@/components/map/AddressCallHistory';
import {ArrowRight,RefreshCw,X,MapPin,Users} from 'lucide-react';

const recorded=(value,fallback='Not recorded')=>value==null||String(value).trim()===''?fallback:String(value);
export default function CommandIncidentDetails({call,units,priority,reference,incident,elapsed,district,onClose,onUnits,onDispatch,onMap,onPriority,onClear,canChangePriority,canClear,working}){
 const bodyRef=useRef(null);
 const [tab,setTab]=useState('details');
 const id=String(call.id);
 const query=useQuery({
  queryKey:['commandIncidentDetails',id],
  queryFn:async()=>{
   const response=await withRequestTimeout(base44.functions.invoke('getCallHistoryFeed',{action:'call_details',call_id:id,call_number:reference}),25000,'Incident records');
   const data=response?.data||response||{};
   if(!data.success||data.error)throw Error(data.error||'Incident records unavailable');
   return data;
  },
  staleTime:30000,retry:false,refetchOnWindowFocus:false
 });
 const data=query.data;
 useEffect(()=>{bodyRef.current?.scrollTo({top:0});setTab('details');},[id]);
 useEffect(()=>{bodyRef.current?.scrollTo({top:0});},[tab]);
 const refresh=()=>{clearBase44ReadCacheMatching('function:getCallHistoryFeed:');void query.refetch();};
 const recordedAssignments=data?.assignments||[];
 const activeAssignments=recordedAssignments.filter(a=>!['cleared','cancelled','canceled','closed','completed'].includes(String(a.status||'').toLowerCase()));
 const unitLabel=id=>{const u=units.find(u=>[u.id,u.user_id,u.officer_id,u.active_officer_id,u.email,u.unit_number].some(v=>v!=null&&String(v)===String(id)));return u?[u.unit_number?'Unit '+u.unit_number:'',u.rank,u.last_name].filter(Boolean).join(' '):'Unresolved unit';};
 const fallbackAssignments=(call.assigned_units||[]).map(id=>({unit_id:id,label:unitLabel(id)}));
 const assigned=recordedAssignments.length?activeAssignments:fallbackAssignments;
 return <section className="tac-incident-detail-rail" aria-label="Incident details">
  <div className="tac-panel-bar"><span>Incident details</span><div><button type="button" onClick={refresh} disabled={query.isFetching} aria-label="Refresh incident records"><RefreshCw size={15} className={query.isFetching?'animate-spin':''}/></button><button type="button" onClick={onUnits}><Users size={15}/> Units</button><button type="button" aria-label="Close incident details" onClick={onClose}><X size={17}/></button></div></div>
  <div className="tac-detail-heading"><small>{reference}</small><div className="tac-detail-title"><h2>{incident}</h2><b data-priority={priority.label.split(' ')[0]}>{priority.label}</b></div><p><MapPin size={16}/>{recorded(call.location,'Location pending')}</p><div className="tac-detail-status"><span>{recorded(call.agency,'Agency pending')}</span><span>{recorded(call.status,'Status unavailable')}</span><span>{recorded(elapsed,'Elapsed unavailable')}</span></div></div>
  <div className="tac-segment"><button type="button" aria-pressed={tab==='details'} onClick={()=>setTab('details')}>Information</button><button type="button" aria-pressed={tab==='premise'} onClick={()=>setTab('premise')}>Premise history</button><button type="button" aria-pressed={tab==='activity'} onClick={()=>setTab('activity')}>Notes & activity{data?' ('+(data.timeline?.length||0)+')':''}</button></div>
  <div className="tac-detail-scroll" ref={bodyRef}>
   {query.isFetching&&!data&&<p className="tac-detail-message" role="status">Loading recorded call details and activity…</p>}
   {query.isError&&<p role="alert" className="tac-warning">Additional records could not be loaded. Showing available call information. Use refresh to retry.</p>}
   {data?.warnings?.length>0&&<p role="status" className="tac-warning">Some call records are unavailable: {data.warnings.join('; ')}</p>}
   {tab==='details'?<>
    <dl className="tac-detail-fields">{[['Received',call.time_received||call.created_date?formatEasternDateTime(call.time_received||call.created_date)+' ET':'Not recorded'],['District / zone',recorded(call.district||call.beat||call.zone||district)],['Cross street',recorded(call.cross_street)],['Source',recorded(call.source||call.source_channel)],['Caller',recorded(call.caller_name)],['Callback',recorded(call.caller_phone)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="tac-detail-block"><h3>Safety / hazards</h3><p className={call.hazards?'text-amber-200':''}>{recorded(call.hazards,'No hazards recorded.')}</p></div>
    <div className="tac-detail-block"><h3>Incident narrative</h3><p>{recorded(data?.narrative||call.description,query.isFetching?'Retrieving original narrative…':'No narrative recorded.')}</p></div>
    <div className="tac-detail-block"><h3>Assigned units · {assigned.length}</h3>{assigned.length?assigned.map((u,i)=><div className="tac-detail-assignment" key={u.unit_id+'-'+i}><b>{u.label}</b><small>{recorded(u.role,'Role not recorded')} · {recorded(u.status,'Status not recorded')}</small></div>):<p>{query.isFetching?'Checking assignments…':query.isError||data?.warnings?.length?'Assignment records may be incomplete.':'No assigned units in available records.'}</p>}</div>
    {data?.disposition&&<div className="tac-detail-block"><h3>Disposition</h3><p>{data.disposition}</p></div>}
    <div className="tac-detail-block"><h3>Recorded notes & activity</h3><button className="tac-detail-link" type="button" onClick={()=>setTab('activity')}>View CAD activity {data?'('+ (data.timeline?.length||0)+')':''} <ArrowRight size={14}/></button></div>
   </>:tab==='premise'?<div className="tac-detail-premise"><p className="tac-detail-message">Prior calls and repeat-call history for {recorded(call.location,'this address')}.</p>{String(call.location||'').trim()?<AddressCallHistory address={call.location} excludeCallId={id}/>:<p className="tac-detail-message">No address recorded for this call, so premise history cannot be checked.</p>}</div>:<div className="tac-detail-activity">{data?.timeline?.length?data.timeline.slice().reverse().map(event=><article key={event.id}><time>{event.at?formatEasternDateTime(event.at)+' ET':'Time not recorded'}</time><b>{event.title} · {event.actor}</b>{event.text&&<p>{event.text}</p>}</article>):<p className="tac-detail-message">{query.isFetching?'Loading recorded activity…':query.isError||data?.warnings?.length?'Activity may be incomplete. Refresh to retry.':'No recorded activity in the available records.'}</p>}</div>}
  </div>
  <footer className="tac-detail-actions"><button type="button" className="tac-primary" onClick={()=>onDispatch(call)}>Open dispatch / assign <ArrowRight size={15}/></button><div><button type="button" onClick={()=>onMap(call)}>Full map</button>{canChangePriority&&<IncidentPrioritySelect call={call} priority={priority.label.startsWith('P1')?'critical':priority.label.startsWith('P2')?'high':priority.label.startsWith('P3')?'medium':'low'} onSave={onPriority} disabled={!!working}/>} {canClear&&<button type="button" className="tac-danger" disabled={!!working} onClick={e=>{if(window.confirm('Clear this CAD incident? Confirm the response is complete.'))onClear(call,e);}}>{working?'Saving…':'Clear call'}</button>}</div></footer>
 </section>
}
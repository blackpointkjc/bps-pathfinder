import {useEffect,useState} from 'react';
import {base44,clearBase44ReadCacheMatching} from '@/api/base44Client';
import {formatEasternTime,parseServerTimestamp} from '@/lib/easternTime';
import {Activity,RefreshCw} from 'lucide-react';

export default function CommandEventLog({onSelect,calls=[]}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true,busy=false,changed=0;
  const load=async()=>{if(busy)return;busy=true;const epoch=changed;try{const data=await base44.entities.CallStatusLog.list('-created_date',40);if(alive){if(!Array.isArray(data))throw Error('Invalid CAD activity response');if(epoch===changed)setRows(data);setError('');}}catch(e){if(alive)setError(e.message||'Activity unavailable');}finally{busy=false;if(alive)setLoading(false);}};
  let unsub;try{unsub=base44.entities.CallStatusLog.subscribe(e=>{const row=e.data;if(!row?.id)return;changed++;setRows(old=>[...(e.type==='delete'?[]:[row]),...old.filter(x=>x.id!==row.id)].sort((a,b)=>(parseServerTimestamp(b.created_date)?.getTime()||0)-(parseServerTimestamp(a.created_date)?.getTime()||0)).slice(0,40));});}catch{}
  void load();const timer=setInterval(load,45000);
  return()=>{alive=false;clearInterval(timer);if(typeof unsub==='function')unsub();};
 },[revision]);
 return <section className="tac-event-panel"><div className="tac-panel-bar"><span><Activity size={15}/> Recorded CAD events</span><div><small>{error?'Feed unavailable':loading?'Loading':'Recent activity'}</small><button type="button" onClick={()=>{clearBase44ReadCacheMatching('entity:CallStatusLog:');setRevision(x=>x+1)}} aria-label="Refresh CAD events"><RefreshCw size={14}/></button></div></div>
 {error&&<p role="alert" className="tac-warning">Activity refresh failed. Last received events remain visible.</p>}
 <div className="tac-event-scroll">{rows.length?rows.map(r=>{const call=calls.find(c=>String(c.id)===String(r.call_id));return <div key={r.id} className="tac-event-row"><time>{formatEasternTime(r.created_date)} ET</time><b className={r.announcement_priority==='emergency'||r.announcement_priority==='critical'?'text-red-300':'text-cyan-200'}>{String(r.event_type||r.new_status||'CAD update').replaceAll('_',' ')}</b><span>{r.cad_number||r.incident_type||'CAD'}</span><span>{r.unit_name||'Dispatch / CAD'}</span>{call&&<button onClick={()=>onSelect(call)}>Open</button>}</div>}):<p className="tac-empty">{loading?'Retrieving recorded events…':error?'Unable to retrieve CAD events':'No recent recorded events'}</p>}</div></section>
}

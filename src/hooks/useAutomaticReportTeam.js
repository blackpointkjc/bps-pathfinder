import {useEffect,useRef} from 'react';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
// Records only work metadata. Narratives, confidential content and expenses never leave their own save flow.
export default function useAutomaticReportTeam(entity,data,active=true){
 const latest=useRef(data);latest.current=data;
 const work=useRef(null);
 const activeRef=useRef(active);activeRef.current=active;
 const key=JSON.stringify([active,data?.location||data?.property_site||data?.linked_call_location||'',data?.report_date||data?.incident_date||data?.shift_date||'',data?.linked_call_id||'']);
 useEffect(()=>{
  if(!active){
   if(work.current){const id=work.current;work.current=null;void base44.functions.invoke('prepareReportTeam',{action:'cancel',entity,work_id:id}).catch(()=>{});}
   return;
  }
  let disposed=false;
  const timer=setTimeout(()=>{
   const value=latest.current||{};
   const safe={};for(const field of ['location','property_site','report_date','incident_date','incident_time','shift_date','shift_start','linked_call_id','linked_call_number','linked_call_location'])if(value[field])safe[field]=value[field];
   base44.functions.invoke('prepareReportTeam',{action:'start',entity,data:safe}).then(r=>{
    if(r.data?.error)throw Error(r.data.error);
    const id=r.data?.work_id||null;
    if(!disposed)work.current=id;
    else if(id&&!activeRef.current)void base44.functions.invoke('prepareReportTeam',{action:'cancel',entity,work_id:id}).catch(()=>{});
   }).catch(error=>{if(!disposed)toast.error('Automatic report team could not sync. '+(error?.response?.data?.error||error.message));});
  },700);
  return ()=>{disposed=true;clearTimeout(timer);};
 },[entity,key]);
}

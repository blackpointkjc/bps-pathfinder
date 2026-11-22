import {useEffect} from 'react';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
// Background metadata only. Unsaved/abandoned forms never leave permanent credit.
export default function useAutomaticReportTeam(entity,data,active=true){
 const safe={};for(const field of ['location','property_site','report_date','incident_date','incident_time','shift_date','shift_start','linked_call_id','linked_call_number','linked_call_location'])if(data?.[field])safe[field]=data[field];
 const key=JSON.stringify(safe);
 useEffect(()=>{
  if(!active)return;
  let disposed=false,workId=null;const workToken=crypto.randomUUID();
  const cancel=id=>base44.functions.invoke('prepareReportTeam',{action:'cancel',entity,work_id:id,work_token:workToken}).catch(()=>{});
  const timer=setTimeout(()=>{
   base44.functions.invoke('prepareReportTeam',{action:'start',entity,data:JSON.parse(key),work_token:workToken}).then(r=>{
    if(r.data?.error)throw Error(r.data.error);
    workId=r.data?.work_id||null;
    if(disposed&&workId)void cancel(workId);
   }).catch(error=>{if(!disposed)toast.error('Automatic report team could not sync. '+(error?.response?.data?.error||error.message));});
  },700);
  return ()=>{disposed=true;clearTimeout(timer);if(workId)void cancel(workId);};
 },[entity,key,active]);
}

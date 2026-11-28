import {createContext,createElement,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {getAppDirectory} from '@/lib/appDirectory';
import {isOperationalOfficer} from '@/lib/directoryUtils';
import {getOfficerLocationSnapshot,subscribeOfficerLocationChanges,applyOfficerLocationEvent} from '@/lib/officerLocationHub';
const CadRosterContext=createContext(null);
const emailOf=p=>String(p?.email||p?.officer_email||'').trim().toLowerCase();
export function mergeCadRoster(directory=[],live=[]) {
 const byEmail=new Map(live.filter(emailOf).map(p=>[emailOf(p),p]));
 const known=new Set(directory.map(emailOf).filter(Boolean));
 const joined=directory.filter(isOperationalOfficer).map(p=>{
  const status=byEmail.get(emailOf(p));
  return {...p,...status,id:p.id||status?.user_id||status?.id,user_id:p.id||status?.user_id,email:p.email,rank:p.rank||status?.rank,last_name:p.last_name||status?.last_name,additional_roles:p.additional_roles||status?.additional_roles||[],disabled:p.disabled,termination_date:p.termination_date,employment_status:p.employment_status,account_status:p.account_status,platoon:p.platoon||p.oversight_platoon||status?.platoon||status?.oversight_platoon||null,profile_photo_url:p.profile_photo_url||status?.profile_photo_url,status:status?.status||p.status||'Out of Service'};
 });
 return [...joined,...live.filter(p=>!known.has(emailOf(p))&&isOperationalOfficer({...p,email:p.email||p.officer_email})).map(p=>({...p,id:p.user_id||p.id,email:p.email||p.officer_email,status:p.status||'Out of Service'}))];
}
function useLocalCadRoster(enabled=true){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[lastVerifiedAt,setLastVerifiedAt]=useState(null);
 const pending=useRef(null),directoryRef=useRef([]),liveRef=useRef([]),mounted=useRef(false);
 const refresh=useCallback((force=false)=>{
  if(!enabled)return Promise.resolve();
  if(pending.current)return pending.current;
  setLoading(true);setError('');
  const request=(async()=>{
   const errors=[];
   // Paint independently: a slow directory never prevents live status from appearing.
   const statusRequest=getOfficerLocationSnapshot({force}).then(payload=>{
    if(!mounted.current)return;
    const live=Array.isArray(payload.units)?payload.units:payload.users;
    if(!Array.isArray(live))throw Error('Invalid officer roster');
    if(payload.stale){errors.push('Live status delayed; showing the last received roster.');if(liveRef.current.length)return;}
    liveRef.current=live;
    setRows(mergeCadRoster(directoryRef.current,liveRef.current));
    if(!payload.stale&&payload.verified_at)setLastVerifiedAt(new Date(payload.verified_at));
   }).catch(()=>errors.push('Live status unavailable; retry when connected.'));
   await statusRequest;
   if(mounted.current){setError(errors.join(" "));setLoading(false);}
   await getAppDirectory(force).then(payload=>{
    if(!mounted.current)return;
    if(Array.isArray(payload.users)&&payload.users.length)directoryRef.current=payload.users;
    if(payload.meta?.degraded_sources?.includes('company employees'))errors.push('Officer directory delayed.');
    setRows(mergeCadRoster(directoryRef.current,liveRef.current));
   }).catch(()=>errors.push('Officer directory could not refresh.'));

   if(mounted.current){setError(errors.join(' '));setLoading(false);}
  })().finally(()=>{if(pending.current===request)pending.current=null;});
  pending.current=request;return request;
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  mounted.current=true;void refresh();
  const unsub=subscribeOfficerLocationChanges(event=>{
   if(event.directory_profile&&event.type==='delete'){directoryRef.current=directoryRef.current.filter(row=>String(row.id)!==String(event.id||event.data?.id));liveRef.current=liveRef.current.filter(row=>String(row.user_id||row.id)!==String(event.id||event.data?.id));setRows(mergeCadRoster(directoryRef.current,liveRef.current));return;}
   liveRef.current=applyOfficerLocationEvent(liveRef.current,event);
   setRows(old=>applyOfficerLocationEvent(old,event));
  });
  const timer=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh();},60000);
  const resume=()=>{if(document.visibilityState!=='hidden')void refresh();};
  const onPhotoUpdated=event=>{const change=event.detail;if(!change?.userId||!change?.profile_photo_url)return;setRows(old=>old.map(p=>String(p.id)===String(change.userId)?{...p,profile_photo_url:change.profile_photo_url}:p));void refresh();};
  window.addEventListener('online',resume);window.addEventListener('bps-personnel-photo-updated',onPhotoUpdated);
  document.addEventListener('visibilitychange',resume);
  return()=>{mounted.current=false;unsub?.();clearInterval(timer);window.removeEventListener('online',resume);window.removeEventListener('bps-personnel-photo-updated',onPhotoUpdated);document.removeEventListener('visibilitychange',resume);};
 },[enabled,refresh]);
 return {rows,loading,error,lastVerifiedAt,refresh};
}
export function CadRosterProvider({children}){
 const value=useLocalCadRoster();
 return createElement(CadRosterContext.Provider,{value},children);
}
export default function useCadRoster(){
 const shared=useContext(CadRosterContext);
 const local=useLocalCadRoster(!shared);
 return shared||local;
}

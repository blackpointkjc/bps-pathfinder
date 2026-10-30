import { useCallback,useEffect,useState } from 'react';
import { getAppDirectory } from '@/lib/appDirectory';
import { isOperationalOfficer } from '@/lib/directoryUtils';
import { getOfficerLocationSnapshot,subscribeOfficerLocationChanges,applyOfficerLocationEvent,clearOfficerLocationSnapshotCache } from '@/lib/officerLocationHub';
export function mergeCadRoster(directory=[],live=[]) {
 const byEmail=new Map(live.map(p=>[String(p.email||p.officer_email||'').toLowerCase(),p]));
 const joined=directory.filter(isOperationalOfficer).map(p=>{
  const status=byEmail.get(String(p.email).toLowerCase());
  return {...p,...status,email:p.email,rank:p.rank||status?.rank,last_name:p.last_name||status?.last_name,platoon:p.platoon||p.oversight_platoon||status?.platoon||status?.oversight_platoon||null,profile_photo_url:p.profile_photo_url||status?.profile_photo_url,status:status?.status||p.status||'Out of Service'};
 });
 const known=new Set(joined.map(p=>p.email.toLowerCase()));
 return [...joined,...live.filter(p=>!known.has(String(p.email||p.officer_email||'').toLowerCase())&&isOperationalOfficer({...p,email:p.email||p.officer_email})).map(p=>({...p,email:p.email||p.officer_email,status:p.status||'Out of Service'}))];
}
export default function useCadRoster(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async(force=false)=>{
  setLoading(true);setError('');
  let directory=[];
  try{const payload=await getAppDirectory(force);directory=payload.users||[];setRows(old=>mergeCadRoster(directory,old));}
  catch(e){setError('Officer directory could not refresh. '+(e.message||'Use Retry.'));}
  if(force)clearOfficerLocationSnapshotCache();
  try{const payload=await getOfficerLocationSnapshot({force});const live=Array.isArray(payload.units)&&payload.units.length?payload.units:(payload.users||[]);setRows(old=>mergeCadRoster(directory.length?directory:old,live));}
  catch(e){setError(previous=>previous||'Live status update delayed. Directory officers remain visible; use Retry.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  const onPhotoUpdated = event => {
   const change=event.detail;
   if(!change?.userId || !change?.profile_photo_url)return;
   setRows(previous=>previous.map(officer=>String(officer.id)===String(change.userId)
    ? {...officer,profile_photo_url:change.profile_photo_url} : officer));
   refresh(true);
  };
  window.addEventListener('bps-personnel-photo-updated',onPhotoUpdated);
  return()=>window.removeEventListener('bps-personnel-photo-updated',onPhotoUpdated);
 },[refresh]);
 useEffect(()=>{refresh();const unsub=subscribeOfficerLocationChanges(event=>setRows(rows=>applyOfficerLocationEvent(rows,event)));const timer=setInterval(()=>refresh(),60000);return()=>{unsub?.();clearInterval(timer);};},[refresh]);
 return {rows,loading,error,refresh};
}

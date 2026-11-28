import {useEffect,useMemo,useState} from 'react';
import {callTimestamp,isRecentActiveMapIncident,LIVE_MAP_WINDOW_MS} from '../../base44/functions/_shared/callFeedPolicy.js';
const EMPTY=[];
export default function useLiveMapWindow(calls=EMPTY){
 const [revision,setRevision]=useState(0);
 const {recent,next}=useMemo(()=>{
  const now=Date.now();
  const recent=calls.filter(c=>isRecentActiveMapIncident(c,now));
  const next=calls.reduce((earliest,c)=>{
   const at=callTimestamp(c);
   if(at>now+120000)return earliest;
   const boundary=at>now?at:at+LIVE_MAP_WINDOW_MS;
   return boundary>now?Math.min(earliest,boundary):earliest;
  },Infinity);
  return {recent,next};
 },[calls,revision]);
 useEffect(()=>{
  const refresh=()=>setRevision(v=>v+1);
  const timer=Number.isFinite(next)?setTimeout(refresh,Math.max(0,next-Date.now())+10):null;
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pageshow',refresh);
  return()=>{if(timer!==null)clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('pageshow',refresh);};
 },[calls,revision,next]);
 return recent;
}

import {useEffect,useMemo,useState} from 'react';
import {callTimestamp,isRecentActiveMapIncident,LIVE_MAP_WINDOW_MS} from '../../base44/functions/_shared/callFeedPolicy.js';
const EMPTY=[];
export default function useLiveMapWindow(calls=EMPTY){
 const [revision,setRevision]=useState(0);
 const recent=useMemo(()=>calls.filter(c=>isRecentActiveMapIncident(c,Date.now())),[calls,revision]);
 useEffect(()=>{
  const refresh=()=>setRevision(v=>v+1);
  const now=Date.now();
  const next=calls.reduce((earliest,c)=>{
   const at=callTimestamp(c);
   const boundary=at>now?at:at+LIVE_MAP_WINDOW_MS;
   return boundary>now?Math.min(earliest,boundary):earliest;
  },Infinity);
  const timer=Number.isFinite(next)?setTimeout(refresh,Math.max(0,next-now)+10):null;
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pageshow',refresh);
  return()=>{if(timer!==null)clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('pageshow',refresh);};
 },[calls,revision]);
 return recent;
}

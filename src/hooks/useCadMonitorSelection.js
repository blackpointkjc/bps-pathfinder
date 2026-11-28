import {useEffect,useState,useCallback} from 'react';
import {monitorStorageKey,normalizeMonitorIds,toggleMonitorId} from '@/lib/cadMonitorSelection';
const eventName='bps-cad-monitor-pins-changed';
const read=key=>{try{return normalizeMonitorIds(JSON.parse(window.localStorage.getItem(key)||'[]'));}catch{return [];}};
export default function useCadMonitorSelection(userId){
 const key=monitorStorageKey(userId);
 const [state,setState]=useState(()=>({key,ids:userId?read(key):[]}));
 const ids=state.key===key?state.ids:[];
 useEffect(()=>{const sync=event=>{if(event.type==='storage'&&event.key!==key&&event.key!==null)return;if(event.type===eventName&&event.detail?.key!==key)return;setState({key,ids:userId?(event.type===eventName?normalizeMonitorIds(event.detail.ids):read(key)):[]});};setState({key,ids:userId?read(key):[]});window.addEventListener('storage',sync);window.addEventListener(eventName,sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener(eventName,sync);};},[key,userId]);
 const toggle=useCallback(id=>{if(!userId)return;const next=toggleMonitorId(ids,id);setState({key,ids:next});try{window.localStorage.setItem(key,JSON.stringify(next));}catch{}window.dispatchEvent(new CustomEvent(eventName,{detail:{key,ids:next}}));},[key,userId,ids]);
 return {ids,toggle};
}

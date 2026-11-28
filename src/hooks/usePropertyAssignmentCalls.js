import {useEffect,useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {isOperationalPropertyAlert} from '@/lib/cadWorkspaceModel';
import {clearActiveDispatchCallMemoryCache} from '@/lib/activeDispatchCalls';
let recent=new Map(),listeners=new Set(),unsubscribe=null;
export default function usePropertyAssignmentCalls(calls=[]){
 const [version,setVersion]=useState(0);
 useEffect(()=>{listeners.add(setVersion);if(listeners.size===1){try{const stop=base44.entities.PropertyAlert.subscribe(event=>{const alert=event?.data;if(!alert?.callId)return;const id=String(alert.callId);recent.set(id,{active:event.type!=='delete'&&isOperationalPropertyAlert(alert),at:Date.now()});clearActiveDispatchCallMemoryCache();for(const fn of listeners)fn(v=>v+1);});unsubscribe=typeof stop==='function'?stop:null;}catch{unsubscribe=null;}}return()=>{listeners.delete(setVersion);if(!listeners.size){unsubscribe?.();unsubscribe=null;recent=new Map();}};},[]);
 const ids=useMemo(()=>{const result=new Set((calls||[]).filter(c=>c.pathfinder_property_alert===true).map(c=>String(c.id)));for(const [id,row] of recent)if(Date.now()-row.at<30000&&row.active)result.add(id);return result;},[calls,version]);
 return {ids,error:''};
}

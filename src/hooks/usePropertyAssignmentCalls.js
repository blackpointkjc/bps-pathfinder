import {useEffect,useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {isOperationalPropertyAlert} from '@/lib/cadWorkspaceModel';
// Share one read and one realtime subscription among simultaneously mounted CAD tools.
let rows=new Map(),listeners=new Set(),inflight=null,readAt=0,unsubscribe=null,timer=null,error='',generation=0;
const notify=()=>{const snapshot={ids:new Set([...rows.values()].filter(isOperationalPropertyAlert).map(a=>String(a.callId))),error};for(const fn of listeners)fn(snapshot);};
const refresh=()=>{if(inflight)return inflight;const started=Date.now(),epoch=generation;inflight=base44.entities.PropertyAlert.list('-created_date',1000).then(result=>{if(epoch!==generation)return;if(!Array.isArray(result))throw Error('Invalid property alert feed');const next=new Map(result.map(a=>[String(a.id),a]));for(const [id,a] of rows)if(Date.parse(a.updated_date||a.created_date||'')>=started)next.set(id,a);rows=next;readAt=Date.now();error='';notify();}).catch(()=>{if(epoch===generation){error='Property assignment feed delayed';notify();}}).finally(()=>{if(epoch===generation)inflight=null;});return inflight;};
export default function usePropertyAssignmentCalls(){
 const [snapshot,setSnapshot]=useState(()=>({ids:new Set(),error:''}));
 useEffect(()=>{listeners.add(setSnapshot);notify();if(listeners.size===1){if(Date.now()-readAt>30000)void refresh();try{unsubscribe=base44.entities.PropertyAlert.subscribe(event=>{const a=event.data;const id=String(event.id||a?.id||'');if(!id)return;if(event.type==='delete')rows.delete(id);else if(a)rows.set(id,{...rows.get(id),...a});notify();});}catch{}timer=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh();},30000);}return()=>{listeners.delete(setSnapshot);if(!listeners.size){unsubscribe?.();unsubscribe=null;clearInterval(timer);generation++;inflight=null;rows=new Map();readAt=0;error='';}};},[]);
 return snapshot;
}

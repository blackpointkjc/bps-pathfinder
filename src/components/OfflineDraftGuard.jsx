import {useEffect,useRef,useState} from 'react';
import {offlineGet,saveWork} from '@/lib/offlineWork';
export default function OfflineDraftGuard({owner,id,title,data,onRestore}) {
 const [existing,setExisting]=useState(null),[ready,setReady]=useState(false),[status,setStatus]=useState('Checking device draft…');
 const latest=useRef(data);latest.current=data;
 const save=()=>saveWork(owner,id,title,latest.current).then(()=>setStatus(navigator.onLine?'Recovery draft saved on device':'Offline draft saved on device — awaiting sync')).catch(e=>setStatus('Draft NOT saved: '+e.message));
 useEffect(()=>{let live=true;if(!owner)return;offlineGet(owner+':work:'+id).then(item=>{if(!live)return;setExisting(item||null);setReady(!item);setStatus(item?'A saved draft is available. Restore it before editing.':'Device recovery enabled.');}).catch(e=>setStatus(e.message));return()=>{live=false;};},[owner,id]);
 useEffect(()=>{if(!ready||!owner)return;const timer=setTimeout(save,700);const flush=()=>{save();};window.addEventListener('pagehide',flush);return()=>{clearTimeout(timer);window.removeEventListener('pagehide',flush);};},[owner,id,data,ready]);
 return <aside className="rounded border border-cyan-700 p-3 text-sm"><p role="status">{status}</p>{existing&&!ready&&<div className="mt-2 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded border px-3" onClick={()=>{onRestore(existing.data);setReady(true);}}>Restore saved draft</button><button type="button" className="min-h-11 rounded border px-3" onClick={()=>{setReady(true);setExisting(null);}}>Use current form instead</button></div>}{ready&&<button type="button" className="min-h-11 underline" onClick={save}>Save recovery draft now</button>}<p className="text-xs">Device/cloud drafts are not submitted reports. Attachments must finish uploading while online.</p></aside>;
}

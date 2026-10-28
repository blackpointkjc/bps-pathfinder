import {useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {offlineList,saveWork,syncWork} from '@/lib/offlineWork';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export default function OfflineWorkPanel({user}) {
 const [open,setOpen]=useState(false),[online,setOnline]=useState(navigator.onLine),[items,setItems]=useState([]),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=()=>offlineList(user?.id,'work').then(setItems).catch(()=>setMessage('Device storage unavailable. Work has not been saved.'));
 useEffect(()=>{if(!user?.id)return;let running=false;
  const sync=async()=>{if(running||!navigator.onLine)return;running=true;try{const result=await syncWork(base44,user.id);if(result.synced)setMessage(result.synced+' saved item(s) backed up to your cloud drafts.');}catch(e){setMessage('Pending sync: '+e.message);}finally{running=false;load();}};
  const connection=()=>{setOnline(navigator.onLine);if(navigator.onLine)sync();};
  const changed=()=>{load();};load();sync();
  window.addEventListener('online',connection);window.addEventListener('offline',connection);window.addEventListener('bps-offline-work-changed',changed);
  const timer=setInterval(sync,60000);
  return()=>{clearInterval(timer);window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('bps-offline-work-changed',changed);};
 },[user?.id]);
 if(!user?.id)return null;
 const pending=items.filter(item=>!item.synced).length;
 const synchronize=async()=>{setBusy(true);try{const result=await syncWork(base44,user.id);setMessage(result.synced+' items synced as drafts. Reports still require review and submission.');}catch(e){setMessage(e.message);}finally{setBusy(false);load();}};
 return <><button type="button" className="min-h-11 rounded-lg border border-cyan-700 px-3 text-xs font-bold" onClick={()=>setOpen(true)}>{online?'Offline work':'OFFLINE'}{pending?' · '+pending+' pending':''}</button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Offline work &amp; sync</DialogTitle><DialogDescription>Saved on this device for your account. Reconnection backs up drafts; it does not submit reports or send dispatch actions.</DialogDescription></DialogHeader><p role="status">{online?'Connected':'Offline — live calls and new routes are unavailable'}. {pending} item(s) awaiting sync.</p><label className="space-y-2">Field notes<textarea aria-label="Offline field notes" className="min-h-32 w-full rounded border p-3 text-base" value={note} onChange={e=>setNote(e.target.value)}/></label><button type="button" disabled={!note.trim()||busy} className="min-h-11 rounded border p-3" onClick={async()=>{setBusy(true);try{await saveWork(user.id,crypto.randomUUID(),'Field notes',{notes:note});setNote('');setMessage('Saved on this device.');if(navigator.onLine)await syncWork(base44,user.id);}catch(e){setMessage('Save failed: '+e.message);}finally{setBusy(false);load();}}}>Save notes on device</button><button type="button" disabled={!online||busy||!pending} className="min-h-11 rounded border p-3" onClick={synchronize}>{busy?'Working…':'Sync now'}</button>{message&&<p role="status" className="text-sm">{message}</p>}<div className="space-y-3">{items.map(item=><details key={item.key} className="rounded border p-3"><summary>{item.title} · {item.synced?'Cloud draft synced':'Pending sync'} · {new Date(item.updatedAt).toLocaleString()}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{JSON.stringify(item.data,null,2)}</pre></details>)}</div><p className="text-xs">Shift and incident report forms save local recovery drafts while open. Return to that form to restore one. Keep Pathfinder open for automatic sync; unsynced work stays on this device if the app is closed.</p></DialogContent></Dialog></>;
}

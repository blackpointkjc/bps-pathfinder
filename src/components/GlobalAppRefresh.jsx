import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { requestFreshApplication } from '@/utils/pageAssetHealth';

export default function GlobalAppRefresh() {
  const [available,setAvailable]=useState(()=>window.__pathfinderUpdateAvailable===true);
  const [refreshing,setRefreshing]=useState(false);
  useEffect(()=>{
    const update=event=>setAvailable(event.detail===true);
    window.addEventListener('pathfinder:update-available',update);
    return()=>window.removeEventListener('pathfinder:update-available',update);
  },[]);
  const refresh=()=>{
    if(refreshing)return;
    if(!window.confirm('Refresh the entire Pathfinder application? Save any unfinished reports or notes first. Active navigation may be interrupted.'))return;
    setRefreshing(true);
    requestFreshApplication();
  };
  return <button type="button" onClick={refresh} disabled={refreshing}
    aria-label={available?'Update Pathfinder now':'Refresh entire Pathfinder application'}
    title={available?'New application version available — refresh Pathfinder':'Reload all Pathfinder application files'}
    className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 font-black uppercase tracking-wide focus-visible:ring-2 focus-visible:ring-cyan-300 ${available?'border-emerald-400 bg-emerald-950 text-emerald-100':'border-cyan-500/70 bg-cyan-950/50 text-cyan-100 hover:bg-cyan-900'}`}>
    <RotateCw className={`h-4 w-4 shrink-0 ${refreshing?'animate-spin':''}`}/>
    <span>{refreshing?'Reloading…':available?'Update app':'Refresh app'}</span>
  </button>;
}

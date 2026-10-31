import { invalidateAppDirectory } from './appDirectory';
import { queryClientInstance } from './query-client';

// Device-local daily rollover. A server cannot delete a disconnected user's
// browser cache; every connected device performs its own rollover next time
// Pathfinder runs. Never wipe login, GPS preferences or pending offline work.
const KEY='bps:cache:rotated-day:v1';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let updating=false;
async function rotate(){
  if(updating||navigator.onLine===false)return;
  const today=day();
  try{if(localStorage.getItem(KEY)===today)return;}catch{}
  updating=true;
  try{
    // Browser CacheStorage is restricted to the current origin. Do not clear
    // third-party caches, authentication, or offline draft databases.
    if('caches' in window){
      const names=await caches.keys();
      await Promise.all(names.filter(name=>name.startsWith('pathfinder-offline-shell-')||name.startsWith('pathfinder-map-tiles-')).map(name=>caches.delete(name)));
    }
    invalidateAppDirectory();
    // Retain live mounted observers; mark their query data stale without
    // provoking a company-wide burst of requests during active CAD.
    queryClientInstance.removeQueries({type:'inactive'});
    queryClientInstance.invalidateQueries({refetchType:'none'});
    try{
      localStorage.removeItem('pathfinder-offline-prime-v1');
      for(let index=localStorage.length-1;index>=0;index--){
        const key=localStorage.key(index);
        if(key&&(/^(bps:analytics:|bps:performance-cache:|bps:app-directory:)/.test(key)))localStorage.removeItem(key);
      }
      localStorage.setItem(KEY,today);
    }catch{}
    window.dispatchEvent(new CustomEvent('bps-daily-cache-rotated',{detail:{day:today}}));
  }catch(error){console.warn('[Pathfinder] Daily cache rotation deferred:',error?.message||error);}
  finally{updating=false;}
}
export function installDailyCacheRotation(){
  if(typeof window==='undefined')return;
  // Run once on app startup and check again on foreground/online transition;
  // daily expiry does not force a reload or disconnect active field devices.
  void rotate();
  window.addEventListener('online',()=>{void rotate();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void rotate();});
  window.setInterval(()=>{void rotate();},15*60*1000);
}

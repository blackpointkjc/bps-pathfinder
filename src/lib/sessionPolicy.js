export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
// Filled with the session-revocation cutoff when this release is published.
export const REAUTHENTICATE_AFTER = '2026-11-01T00:00:00.000Z';
export function tokenIssuedAt(token){
 try{const encoded=String(token||'').split('.')[1];const payload=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));return Number(payload.iat||0)*1000;}catch{return 0;}
}
export const requiresFreshLogin = token => tokenIssuedAt(token) < Date.parse(REAUTHENTICATE_AFTER);
export const activityKey = userId => 'bps:auth-activity:'+userId;
export function recordLoginActivity(userId,storage=localStorage,now=Date.now()){
 if(userId)storage.setItem(activityKey(userId),String(now));
}
export function watchInactivity({userId,onExpire,storage=localStorage,target=window,documentTarget=document,now=Date.now,setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
 const key=activityKey(userId);
 let ended=false,lastWrite=0;
 let lastActivity=Number(storage.getItem(key)||0);
 if(!Number.isFinite(lastActivity)||lastActivity<=0){lastActivity=now();storage.setItem(key,String(lastActivity));}
 const expire=()=>{if(ended)return;ended=true;onExpire();};
 const check=()=>{const saved=Number(storage.getItem(key)||0);if(saved>lastActivity)lastActivity=saved;if(now()-lastActivity>=INACTIVITY_LIMIT_MS){expire();return false;}return !ended;};
 const activity=()=>{if(!check())return;lastActivity=now();if(lastActivity-lastWrite>=1000){storage.setItem(key,String(lastActivity));lastWrite=lastActivity;}};
 const sync=e=>{if(e.key===key)check();};
 const visible=()=>{if(documentTarget.visibilityState==='visible')check();};
 const events=['pointerdown','keydown','touchstart','scroll','wheel'];
 events.forEach(name=>target.addEventListener(name,activity,{passive:true,capture:true}));
 target.addEventListener('storage',sync);
 target.addEventListener('focus',check);
 target.addEventListener('pageshow',check);
 documentTarget.addEventListener('visibilitychange',visible);
 const timer=setIntervalFn(check,15000);
 check();
 return ()=>{ended=true;clearIntervalFn(timer);events.forEach(name=>target.removeEventListener(name,activity,{capture:true}));target.removeEventListener('storage',sync);target.removeEventListener('focus',check);target.removeEventListener('pageshow',check);documentTarget.removeEventListener('visibilitychange',visible);};
}

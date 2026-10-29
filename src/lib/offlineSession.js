import {appParams} from '@/lib/app-params';
const KEY='pathfinder-offline-session-v1';
// Kept in local storage (not the tab session) so an offline device can reopen the
// saved app shell after the tab or the app itself was closed. It never replaces a
// real sign-in: it is only used while the device is offline, expires after 12
// hours, and is cleared on sign-out.
export function rememberOfflineIdentity(user){try{if(user?.id)localStorage.setItem(KEY,JSON.stringify({user,token:appParams.token,verifiedAt:Date.now()}));}catch{}}
export function offlineIdentity(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');return saved?.token&&saved.token===appParams.token&&Date.now()-saved.verifiedAt<12*3600000?saved.user:null;}catch{return null;}}
export function forgetOfflineIdentity(){try{localStorage.removeItem(KEY);}catch{}}
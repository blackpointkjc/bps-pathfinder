import {appParams} from '@/lib/app-params';
const KEY='pathfinder-offline-session-v1';
export function rememberOfflineIdentity(user){try{if(user?.id)sessionStorage.setItem(KEY,JSON.stringify({user,token:appParams.token,verifiedAt:Date.now()}));}catch{}}
export function offlineIdentity(){try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');return saved?.token&&saved.token===appParams.token&&Date.now()-saved.verifiedAt<12*3600000?saved.user:null;}catch{return null;}}
export function forgetOfflineIdentity(){try{sessionStorage.removeItem(KEY);}catch{}}

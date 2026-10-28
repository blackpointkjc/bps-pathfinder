const DB = 'pathfinder-offline-v1';
export const changed = () => window.dispatchEvent(new Event('bps-offline-work-changed'));
let opening;
function database() {
  if (!opening) opening = new Promise((resolve,reject) => {
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('items',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{opening=null;reject(request.error);};
  });
  return opening;
}
export async function offlinePut(item) {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction('items','readwrite');tx.objectStore('items').put(item);tx.oncomplete=()=>{changed();resolve(item);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Device storage could not save work'));});
}
export async function offlineGet(key) {
  const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('items').objectStore('items').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function offlineList(owner,kind) {
  if(!owner)return [];
  const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('items').objectStore('items').getAll();req.onsuccess=()=>resolve(req.result.filter(item=>item.owner===owner&&(!kind||item.kind===kind)).sort((a,b)=>b.updatedAt-a.updatedAt));req.onerror=()=>reject(req.error);});
}
export async function saveWork(owner,id,title,data) {
  if(!owner)throw new Error('Sign in before saving offline work');
  let deviceId=localStorage.getItem('pathfinder-offline-device');
  if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem('pathfinder-offline-device',deviceId);}
  return offlinePut({deviceId,key:owner+':work:'+id,id,owner,kind:'work',title,data,updatedAt:Date.now(),revision:crypto.randomUUID(),synced:false});
}
const syncRuns=new Map();
export async function syncWork(api,owner) {
  if(syncRuns.has(owner))return syncRuns.get(owner);
  if(!navigator.onLine)return {synced:0};
  const run=async()=>{
    const pending=(await offlineList(owner,'work')).filter(row=>!row.synced);
    if(!pending.length)return {synced:0};
    const me=await api.auth.me();if(me.id!==owner)throw new Error('Sign back in to the account that saved this work');
    let synced=0;
    for(const item of pending) {
      const response=await api.functions.invoke('syncOfflineWork',{id:item.deviceId+':'+item.id,title:item.title,data:item.data,revision:item.revision,updatedAt:item.updatedAt});
      if(!(response?.data||response)?.success)throw new Error('Server did not confirm this draft');
      const current=await offlineGet(item.key);
      if(current?.revision===item.revision)await offlinePut({...current,synced:true,syncedAt:Date.now()});
      synced++;
    }
    return {synced};
  };
  const pending=(navigator.locks ? navigator.locks.request('pathfinder-offline-sync:'+owner,run) : run()).finally(()=>syncRuns.delete(owner));
  syncRuns.set(owner,pending);return pending;
}

export async function offlineDelete(key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('items','readwrite');tx.objectStore('items').delete(key);tx.oncomplete=()=>{changed();resolve();};tx.onerror=()=>reject(tx.error);});}

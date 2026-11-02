let worker,serial=0;const requests=new Map();
function getWorker(){
 if(worker)return worker;
 worker=new Worker(new URL('./localRewrite.worker.js',import.meta.url),{type:'module'});
 worker.onmessage=event=>{const data=event.data,request=requests.get(data.id);if(!request)return;if(data.type==='progress'){request.progress?.(data.message);return;}requests.delete(data.id);data.type==='result'?request.resolve(data.text):request.reject(new Error(data.message));};
 worker.onerror=()=>{for(const request of requests.values())request.reject(new Error('The browser AI worker stopped. Your draft is preserved. Reload and retry.'));requests.clear();worker?.terminate();worker=null;};
 return worker;
}
export function rewriteOnDevice(text,onProgress){
 if(!String(text||'').trim())return Promise.reject(new Error('Enter text before rewriting.'));
 const id=++serial;
 return new Promise((resolve,reject)=>{requests.set(id,{resolve,reject,progress:onProgress});onProgress?.('Preparing browser AI. The first use downloads and caches its model…');try{getWorker().postMessage({id,text});}catch(error){requests.delete(id);reject(error);}});
}

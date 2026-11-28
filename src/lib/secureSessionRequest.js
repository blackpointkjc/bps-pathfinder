import {retryDeadline} from './cadRequestPolicy.js';
const statusOf=e=>Number(e?.response?.status||e?.status||0);
const errorMessage=e=>String(e?.response?.data?.error||e?.message||'');
export function isTemporarySessionError(error){
 return [429,502,503,504].includes(statusOf(error))||/rate limit|too many requests|network error|failed to fetch/i.test(errorMessage(error));
}
// Only retry a settled transient failure. A timed-out network request may still
// be running, so never create overlapping verification requests on timeout.
export async function runSecureSessionRequest(task,{now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),budget=35000,attempts=3}={}){
 const deadline=now()+budget;
 for(let i=0;i<attempts;i++){
  try{return await task();}
  catch(error){
   if(!isTemporarySessionError(error)||i===attempts-1)throw error;
   const headers=error?.response?.headers;
   const retry=retryDeadline(now(),headers?.get?.('retry-after')??headers?.['retry-after'],errorMessage(error),1500*(i+1));
   const wait=Math.max(500,retry-now());
   if(now()+wait+1000>=deadline)throw error;
   await sleep(wait);
  }
 }
}

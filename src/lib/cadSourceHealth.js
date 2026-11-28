import {parseServerTimestamp} from './easternTime.js';
let snapshot=null;
let confirmedRead=0;
let readFailure='';
const listeners=new Set();
const stamp=value=>parseServerTimestamp(value)?.getTime()||0;
const emit=()=>listeners.forEach(fn=>fn());
export function noteCadSourceHealth(source){
 if(!source)return;
 if(snapshot&&stamp(source.poll_at)<stamp(snapshot.poll_at))return;
 snapshot={...source};emit();
}
export function noteCadRead(at){if(Number.isFinite(at)&&at>confirmedRead)confirmedRead=at;readFailure='';emit();}
export function noteCadReadFailure(error){readFailure=String(error?.message||error||'CAD read failed');emit();}
export function getCadSourceSnapshot(){return snapshot;}
export function getConfirmedCadRead(){return confirmedRead;}
export function getCadReadFailure(){return readFailure;}
export function subscribeCadHealth(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function sourceStatus(source,now=Date.now()){
 const at=stamp(source?.poll_at),successAt=stamp(source?.last_success_at)||(/^success/.test(source?.poll_status||'')?at:0);
 if(!at)return {label:'GRAC status unavailable',tone:'warning'};
 if(!/^success/.test(source?.poll_status||''))return {label:'GRAC retrying',tone:'warning'};
 if(now-at>120000)return {label:'GRAC delayed',tone:'warning'};
 if(now-at>75000)return {label:'GRAC check due',tone:'warning'};
 if(source?.website_rows===0||source?.api_rows===0)return {label:'GRAC partial source',tone:'warning'};
 return {label:'GRAC synced',tone:'ready',successAt};
}
export function cadSourceNeedsPoll(source,now=Date.now()){
 const at=stamp(source?.poll_at);
 return !at||!/^success/.test(source?.poll_status||'')||now-at>=75000;
}

import {useEffect,useState} from 'react';
import {getCadSourceSnapshot,getConfirmedCadRead,getCadReadFailure,subscribeCadHealth,sourceStatus} from '@/lib/cadSourceHealth';
import {formatEasternTime} from '@/lib/easternTime';
export default function GracFeedIndicator(){
 const [,tick]=useState(0);
 useEffect(()=>{const stop=subscribeCadHealth(()=>tick(t=>t+1));const timer=setInterval(()=>tick(t=>t+1),5000);return()=>{stop();clearInterval(timer);};},[]);
 const source=getCadSourceSnapshot(),read=getConfirmedCadRead(),failure=getCadReadFailure(),state=sourceStatus(source),age=read?Math.max(0,Math.floor((Date.now()-read)/1000)):null;
 const queue=read?'CAD read '+formatEasternTime(new Date(read),{second:'2-digit'})+' ET':'CAD read not yet confirmed';
 return <span className="grac-feed-indicator" data-tone={state.tone} title={failure||'Source poll and browser queue read are independent; reported incident time is not publication time.'}><i/><b>{state.label}</b>{source?.poll_at&&<span> · {formatEasternTime(source.poll_at,{second:'2-digit'})} ET</span>}<span> · {queue}{failure||age!==null&&age>30?' (delayed)':''}</span>{Number.isFinite(source?.snapshot_count)&&<span> · GRAC {source.visible_source_count??'—'}/{source.snapshot_count} active records</span>}{source?.missing_source_count>0&&<span className="text-amber-300"> · {source.missing_source_count} source records unavailable</span>}{source?.latest_received&&<span> · Newest source incident {formatEasternTime(source.latest_received)} ET</span>}</span>;
}

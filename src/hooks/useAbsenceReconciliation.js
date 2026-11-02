import { useEffect } from 'react';
import { base44,getBase44RequestHealth } from '@/api/base44Client';
let pending=null, lastRun=0;
export function useAbsenceReconciliation(user){
 useEffect(()=>{
  const roles=new Set(user?.additional_roles||[]);
  if(!user||!(user.role==='admin'||['full_access','supervisor','cad_access','officer'].some(role=>roles.has(role))))return;
  let cancelled=false;
  const run=async()=>{
   if(cancelled||pending||Date.now()-lastRun<110000)return;
   const health=getBase44RequestHealth();
   if(health.rateLimitedUntil||health.readRetryAt||Number(health.queuedReads||0)>=3)return;
   lastRun=Date.now();
   pending=base44.functions.invoke('enforceOfficerDutyStatus',{action:'reconcile_absences'});
   try{await pending;}catch(error){console.warn('Absence coverage synchronization needs retry',error?.message);}finally{pending=null;}
  };
  run();const timer=setInterval(run,120000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[user?.id,user?.role,JSON.stringify(user?.additional_roles||[])]);
}

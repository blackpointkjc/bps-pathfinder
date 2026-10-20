import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { syncOfficerVehicles } from '@/lib/fleetScheduleSync';
export function useFleetScheduling(user){
 const qc=useQueryClient();
 useEffect(()=>{
  const roles=user?.additional_roles||[];
  if(!user||!(user.role==='admin'||roles.includes('full_access')||roles.includes('fleet_manager')))return;
  let stopped=false,timer;
  const run=()=>{if(!stopped)syncOfficerVehicles(qc).catch(error=>console.warn('Fleet scheduling needs retry',error?.message));};
  const queue=()=>{clearTimeout(timer);timer=setTimeout(run,1500);};
  const subscriptions=[];
  for(const entity of [base44.entities.Schedule,base44.entities.Vehicle]){
   try{const off=entity.subscribe(queue);if(typeof off==='function')subscriptions.push(off);}catch{}
  }
  queue();const interval=setInterval(queue,60000);
  return()=>{stopped=true;clearTimeout(timer);clearInterval(interval);subscriptions.forEach(off=>off());};
 },[user?.id,user?.role,JSON.stringify(user?.additional_roles||[]),qc]);
}

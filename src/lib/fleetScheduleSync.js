import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
let pending=null;
let lastSuccessfulAt=0;
let lastResult=null;
let nextRetryAt=0;
export async function syncOfficerVehicles(queryClient, afterWrite=false){
 if(!afterWrite && lastResult && Date.now()-lastSuccessfulAt<120000)return lastResult;
 if(!afterWrite && Date.now()<nextRetryAt)return lastResult;
 if(pending)return afterWrite?pending.then(()=>syncOfficerVehicles(queryClient)):pending;
 pending=base44.functions.invoke('getFleetScheduleData',{action:'sync'}).then(async response=>{
  const data=response?.data||{};if(data.error)throw new Error(data.error);
  clearBase44ReadCacheMatching('function:getFleetScheduleData:');
  if(queryClient){queryClient.setQueryData(['fleetDefaultSync'],data.sync);}
  if(queryClient)await Promise.all(['fleetScheduleData','fleetAssignments','myVehicleAssignments'].map(key=>queryClient.invalidateQueries({queryKey:[key]})));
  lastSuccessfulAt=Date.now();lastResult=data.sync;nextRetryAt=0;
  return data.sync;
 }).catch(error=>{nextRetryAt=Date.now()+60000;throw error;}).finally(()=>{pending=null;});
 return pending;
}

import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
let pending=null;
export async function syncOfficerVehicles(queryClient){
 if(pending)return pending;
 pending=base44.functions.invoke('getFleetScheduleData',{action:'sync'}).then(async response=>{
  const data=response?.data||{};if(data.error)throw new Error(data.error);
  clearBase44ReadCacheMatching('function:getFleetScheduleData:');
  if(queryClient)await Promise.all(['fleetScheduleData','fleetAssignments','myVehicleAssignments'].map(key=>queryClient.invalidateQueries({queryKey:[key]})));
  return data.sync;
 }).finally(()=>{pending=null;});
 return pending;
}

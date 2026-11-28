import {useQuery} from '@tanstack/react-query';
import {base44,clearBase44ReadCacheMatching} from '@/api/base44Client';
export default function useRecentPropertyIncidents(userId){
 const query=useQuery({queryKey:['recentPropertyIncidents',userId],enabled:!!userId,queryFn:async()=>{
   const response=await base44.functions.invoke('getCallHistoryFeed',{action:'recent_property_incidents'});
   const payload=response?.data||response;
   if(!payload?.success||!Array.isArray(payload.calls))throw Error(payload?.error||'Property incident log unavailable');
   return payload.calls;
 },staleTime:10000,refetchInterval:30000,refetchIntervalInBackground:false,refetchOnWindowFocus:true,retry:false});
 return {rows:query.data||[],loading:query.isPending,error:query.isError?'Property incident log delayed. Last available records shown.':'',refresh:()=>{clearBase44ReadCacheMatching('function:getCallHistoryFeed:');return query.refetch();}};
}

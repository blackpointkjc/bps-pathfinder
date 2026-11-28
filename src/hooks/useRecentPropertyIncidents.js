import {useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {base44,clearBase44ReadCacheMatching} from '@/api/base44Client';
export default function useRecentPropertyIncidents(userId,enabled=true){
 const manual=useRef(false);
 const query=useQuery({queryKey:['recentPropertyIncidents',userId],enabled:!!userId&&enabled,queryFn:async()=>{
   const force=manual.current;
   manual.current=false;
   const response=await base44.functions.invoke('getCallHistoryFeed',{action:'recent_property_incidents',cached:true,...(force?{refresh:true}:{})});
   const payload=response?.data||response;
   if(!payload?.success||!Array.isArray(payload.calls))throw Error(payload?.error||'Property incident log unavailable');
   return {rows:payload.calls,warning:payload.warning||"",fetchedAt:payload.fetched_at||null};
 },staleTime:60000,refetchInterval:90000,refetchIntervalInBackground:false,refetchOnWindowFocus:true,retry:false});
 const refresh=async()=>{
   if(!userId||query.isFetching)return;
   manual.current=true;
   clearBase44ReadCacheMatching('function:getCallHistoryFeed:');
   try{return await query.refetch({cancelRefetch:false});}finally{manual.current=false;}
 };
 return {rows:query.data?.rows||[],loading:query.isPending,refreshing:query.isFetching,fetchedAt:query.data?.fetchedAt,error:query.isError?'Property incident log delayed. Last available records shown.':query.data?.warning||'',refresh};
}

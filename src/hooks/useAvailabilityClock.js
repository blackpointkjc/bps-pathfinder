import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { invalidateAppDirectory } from '@/lib/appDirectory';

// Re-evaluate scheduled departures/returns without requiring a page reload.
export function useAvailabilityClock() {
 const [, tick] = useState(0);
 const queryClient = useQueryClient();
 useEffect(() => {
  const timer = window.setInterval(() => tick(value => value + 1), 30000);
  let unsubscribe;
  try {
   unsubscribe = base44.entities.User.subscribe(() => {
    invalidateAppDirectory();
    clearBase44ReadCacheMatching('function:getAppDirectory:');
    queryClient.invalidateQueries({predicate: query => ['clientSupervisorDirectory','allUsersRank','allUsers'].includes(String(query.queryKey[0]))});
   });
  } catch {}
  return () => { window.clearInterval(timer); if (typeof unsubscribe === 'function') unsubscribe(); };
 }, [queryClient]);
}

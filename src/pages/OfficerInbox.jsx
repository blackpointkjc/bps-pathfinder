import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import MessagingPanel from '@/components/dispatch/MessagingPanel';

export default function OfficerInbox() {
  const { data: currentUser, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: units = [] } = useQuery({
    queryKey: ['dispatchMessageUnits'],
    queryFn: () => base44.entities.User.list('-last_name', 500),
    enabled: !!currentUser,
    staleTime: 60000,
  });

  if (loadingUser || !currentUser) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-400">Loading inbox...</div>;
  }

  return (
    <div className="h-[calc(100vh-5.5rem)] p-3 md:p-5">
      <MessagingPanel currentUser={currentUser} units={units} embedded inboxOnly />
    </div>
  );
}

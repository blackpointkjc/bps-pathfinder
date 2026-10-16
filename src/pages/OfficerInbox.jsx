import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import UniversalInbox from '@/components/chat/UniversalInbox';
import OfficerChat from './OfficerChat';
import { listOfficerDirectory } from '@/lib/appDirectory';

export default function OfficerInbox() {
  const { data: currentUser, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: units = [] } = useQuery({
    queryKey: ['dispatchMessageUnits'],
    queryFn: () => listOfficerDirectory('-last_name', 500),
    enabled: !!currentUser,
    staleTime: 60000,
  });

  const { data: imap = [], isLoading: loadingImap } = useQuery({
    queryKey: ['officerCompanyImap', currentUser?.id],
    queryFn: async () => { const response = await base44.functions.invoke('companyImapMail', { action:'status' }); const payload = response?.data || response || {}; return payload.mailboxes || []; },
    enabled: !!currentUser?.id,
    staleTime: 60000,
  });

  if (loadingUser || loadingImap || !currentUser) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-400">Loading inbox...</div>;
  }

  // Purelymail accounts do not provide Microsoft Teams authentication.
  // Use the existing Pathfinder officer chat instead of demanding Outlook sign-in.
  if (imap.some(mailbox => mailbox.active !== false)) return <OfficerChat />;

  return (
    <div className="h-full min-h-0 w-full p-0 md:p-5">
      <UniversalInbox currentUser={currentUser} users={units} />
    </div>
  );
}

import SiteChainOfCommand from '@/components/SiteChainOfCommand';
import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, UserCheck, MapPin } from "lucide-react";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

export default function ClientSupervisors() {

  const { data: user } = useQuery({
    queryKey: ['clientPortalUser', getClientPreviewId()],
    queryFn: getClientPortalUser,
    staleTime: 60000,
  });

  const clientLocations = [...new Set([
    ...(Array.isArray(user?.assigned_locations) ? user.assigned_locations : []),
    ...(Array.isArray(user?.assigned_sites) ? user.assigned_sites : []),
    ...(user?.assigned_location ? [user.assigned_location] : []),
  ].filter(Boolean))];

  const siteKey = value => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
  const assignedSiteKeys = new Set(clientLocations.map(siteKey));
  const { data: siteLocations = [] } = useQuery({
    queryKey: ['clientSupervisorLocations', clientLocations.join('|')],
    queryFn: async () => (await listDirectoryLocations()).filter(loc => assignedSiteKeys.has(siteKey(loc.site_name))),
    enabled: clientLocations.length > 0,
  });

  const { data: allUsers = [], isPending: usersLoading, isError: usersError, refetch: retryUsers } = useQuery({
    queryKey: ['clientSupervisorDirectory', user?.id, getClientPreviewId()],
    queryFn: () => listDirectoryUsers(),
    enabled: !!user,
    staleTime: 60000,
  });


  if (clientLocations.length === 0) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Location Assigned</h2>
        <p className="text-slate-600">Please contact Black Point Protection.</p>
      </div>
    );
  }

  return (
    <div className="client-supervisors-page min-h-screen w-full min-w-0 overflow-x-hidden p-3 sm:p-4 md:p-6">
      <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-5 sm:space-y-6">
        <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
          <UserCheck className="h-8 w-8 shrink-0 text-violet-400" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">Site Operations</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Your Site Supervisors</h1>
            <p className="mt-1 flex min-w-0 items-center gap-2 break-words text-slate-300"><MapPin className="w-4 h-4" />{clientLocations.length > 1 ? `${clientLocations.length} assigned properties` : clientLocations[0]}</p>
          </div>
        </div>

        <Card className="w-full min-w-0 overflow-hidden border border-slate-700 bg-slate-900 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-300">
              <UserCheck className="w-6 h-6" />
              Site Supervisors
            </CardTitle>
            <p className="text-sm text-slate-400">One site supervisor per property, with their reporting chain shown above them</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {siteLocations.map(location => (
              <div key={location.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold text-white">{location.site_name}</p><p className="text-xs text-slate-500">{location.address || location.division || ''}</p></div></div>
                {usersLoading ? <p role="status" className="text-slate-400">Loading site chain of command…</p> : usersError ? <button type="button" onClick={() => retryUsers()} className="text-cyan-300">Could not load supervisors. Retry</button> : <SiteChainOfCommand assignedSupervisors={location.assigned_supervisors || []} users={allUsers}/>}

              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 border border-slate-700 bg-slate-900 shadow-lg">
          <CardContent className="p-6">
            <h3 className="mb-3 font-bold text-blue-300">Chain of Command</h3>
            <div className="space-y-2 text-sm text-slate-300">
              <p><strong>For immediate site issues:</strong> Contact your Site Supervisor</p>
              <p><strong>For escalated concerns:</strong> Contact Division Command</p>
              <p className="mt-3 text-xs text-slate-400">
                Use the phone and email links on each card to contact your site supervisor or their chain of command. For urgent matters, contact Black Point Protection dispatch.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

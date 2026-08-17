import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, UserCheck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { listDirectoryLocations, listDirectoryUsers } from '@/lib/appDirectory';

export default function ClientSupervisors() {

  const { data: user } = useQuery({
    queryKey: ['clientPortalUser', getClientPreviewId()],
    queryFn: getClientPortalUser,
    staleTime: 0,
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

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => listDirectoryUsers(),
    initialData: [],
  });

  const siteSupervisorGroups = siteLocations.map(location => {
    const assigned = new Set((location.assigned_supervisors || []).map(email => String(email || '').trim().toLowerCase()));
    return { location, supervisors: (allUsers || []).filter(u => !u.termination_date && assigned.has(String(u.email || '').trim().toLowerCase())) };
  });

  const commandRanks = new Set(['senior corporal','sergeant','lieutenant','captain','major','lt colonel','lieutenant colonel','colonel']);
  const assignedDivisions = new Set(siteLocations.map(loc => String(loc.division || '').trim().toLowerCase()).filter(Boolean));
  const divisionCommand = allUsers?.filter(u =>
    !u.termination_date && assignedDivisions.has(String(u.division || '').trim().toLowerCase()) && commandRanks.has(String(u.rank || '').trim().toLowerCase())
  ) || [];

  const getRankColor = (rank) => {
    switch (rank) {
      case "Lieutenant": return "bg-orange-100 text-orange-800 border-orange-300";
      case "Sergeant": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "Senior Corporal": return "bg-lime-100 text-lime-800 border-lime-300";
      case "Corporal": return "bg-green-100 text-green-800 border-green-300";
      default: return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

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
        {clientLocations.length > 1 && (
          <Card className="border-none shadow-lg bg-gradient-to-r from-purple-50 to-blue-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <MapPin className="w-8 h-8 text-purple-600" />
                <div className="flex-1">
                  <Label className="text-sm font-semibold text-purple-900 mb-2 block">
                    Select Location to View
                  </Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select a location to view..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clientLocations.map((locName) => (
                        <SelectItem key={locName} value={locName}>
                          {locName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex min-w-0 items-start gap-3">
          <UserCheck className="h-8 w-8 shrink-0 text-violet-400" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Your Site Supervisors</h1>
            <p className="mt-1 flex min-w-0 items-center gap-2 break-words text-slate-300">
              <MapPin className="w-4 h-4" />
              {effectiveLocation}
            </p>
          </div>
        </div>

        <Card className="w-full min-w-0 overflow-hidden border border-slate-700 bg-slate-900 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-300">
              <UserCheck className="w-6 h-6" />
              Site Supervisors
            </CardTitle>
            <p className="text-sm text-slate-400">Supervisors assigned directly to this client location</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {siteSupervisors.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {siteSupervisors.map((supervisor) => (
                  <div key={supervisor.id} className="min-w-0 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      {supervisor.profile_photo_url ? (
                        <img
                          src={supervisor.profile_photo_url}
                          alt={`${supervisor.first_name} ${supervisor.last_name}`}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                          {supervisor.first_name?.charAt(0)}{supervisor.last_name?.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="break-words font-bold text-white">
                          {supervisor.first_name} {supervisor.last_name}
                        </p>
                        <Badge className={`${getRankColor(supervisor.rank)} text-xs`}>
                          {supervisor.rank}
                        </Badge>
                      </div>
                    </div>
                    {supervisor.unit_number && (
                      <p className="text-sm text-slate-300">
                        <span className="font-semibold">Unit:</span> #{supervisor.unit_number}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm text-slate-300">No site supervisors are assigned to {effectiveLocation}. If this location should have supervisors, update the location's Assigned Supervisors field in Admin.</div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 overflow-hidden border border-slate-700 bg-slate-900 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-300">
              <Shield className="w-6 h-6" />
              Division Command
            </CardTitle>
            <p className="text-sm text-slate-400">Command staff assigned to the {location?.division || 'site'} division</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {divisionCommand.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {divisionCommand.map((supervisor) => (
                  <div key={supervisor.id} className="min-w-0 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      {supervisor.profile_photo_url ? (
                        <img
                          src={supervisor.profile_photo_url}
                          alt={`${supervisor.first_name} ${supervisor.last_name}`}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-bold">
                          {supervisor.first_name?.charAt(0)}{supervisor.last_name?.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="break-words font-bold text-white">
                          {supervisor.first_name} {supervisor.last_name}
                        </p>
                        <Badge className={`${getRankColor(supervisor.rank)} text-xs`}>
                          {supervisor.rank}
                        </Badge>
                      </div>
                    </div>
                    {supervisor.unit_number && (
                      <p className="text-sm text-slate-300">
                        <span className="font-semibold">Unit:</span> #{supervisor.unit_number}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No division command officers are available for this location.</p>
            )}
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 border border-slate-700 bg-slate-900 shadow-lg">
          <CardContent className="p-6">
            <h3 className="mb-3 font-bold text-blue-300">Chain of Command</h3>
            <div className="space-y-2 text-sm text-slate-300">
              <p><strong>For immediate site issues:</strong> Contact your Site Supervisor</p>
              <p><strong>For escalated concerns:</strong> Contact Division Command</p>
              <p className="mt-3 text-xs text-slate-400">
                Note: Contact information is not displayed for security and privacy reasons. For urgent matters, please contact Black Point Protection dispatch.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

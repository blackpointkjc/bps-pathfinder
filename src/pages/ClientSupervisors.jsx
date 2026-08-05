import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, UserCheck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function ClientSupervisors() {
  const [selectedLocation, setSelectedLocation] = React.useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  React.useEffect(() => {
    if (clientLocations.length > 0 && !selectedLocation) {
      setSelectedLocation(clientLocations[0]);
    }
  }, [clientLocations, selectedLocation]);

  const effectiveLocation = selectedLocation || clientLocations[0];

  const { data: location } = useQuery({
    queryKey: ['clientLocation', effectiveLocation],
    queryFn: async () => {
      if (!effectiveLocation) return null;
      const locations = await base44.entities.Location.list();
      return locations.find(loc => loc.site_name === effectiveLocation);
    },
    enabled: !!effectiveLocation,
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  // Get site supervisors from location's assigned_supervisors field ONLY
  const siteSupervisors = allUsers?.filter(u => 
    !u.termination_date &&
    location?.assigned_supervisors?.includes(u.email)
  ) || [];

  // Get division command (Senior Corporal to Captain ranks from the same division)
  const divisionCommand = allUsers?.filter(u =>
    !u.termination_date &&
    u.division === location?.division &&
    (u.rank === 'Senior Corporal' || u.rank === 'Sergeant' || u.rank === 'Lieutenant' || u.rank === 'Captain')
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
        <p className="text-slate-600">Please contact Virtus Security.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
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

        <div className="flex items-center gap-3">
          <UserCheck className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Your Site Supervisors</h1>
            <p className="text-slate-600 flex items-center gap-2 mt-1">
              <MapPin className="w-4 h-4" />
              {effectiveLocation}
            </p>
          </div>
        </div>

        <Card className="border-none shadow-xl bg-gradient-to-r from-green-50 to-emerald-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <UserCheck className="w-6 h-6" />
              Site Supervisors
            </CardTitle>
            <p className="text-sm text-green-700">Your on-site Corporal and Senior Corporal supervisors</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {siteSupervisors.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {siteSupervisors.map((supervisor) => (
                  <div key={supervisor.id} className="bg-white p-4 rounded-lg border border-green-200 shadow-sm">
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
                        <p className="font-bold text-slate-900">
                          {supervisor.first_name} {supervisor.last_name}
                        </p>
                        <Badge className={`${getRankColor(supervisor.rank)} text-xs`}>
                          {supervisor.rank}
                        </Badge>
                      </div>
                    </div>
                    {supervisor.unit_number && (
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Unit:</span> #{supervisor.unit_number}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No site supervisors currently assigned to this location.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-gradient-to-r from-yellow-50 to-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <Shield className="w-6 h-6" />
              Division Command
            </CardTitle>
            <p className="text-sm text-yellow-700">Senior Corporals through Captains for {location?.division}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {divisionCommand.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {divisionCommand.map((supervisor) => (
                  <div key={supervisor.id} className="bg-white p-4 rounded-lg border border-yellow-200 shadow-sm">
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
                        <p className="font-bold text-slate-900">
                          {supervisor.first_name} {supervisor.last_name}
                        </p>
                        <Badge className={`${getRankColor(supervisor.rank)} text-xs`}>
                          {supervisor.rank}
                        </Badge>
                      </div>
                    </div>
                    {supervisor.unit_number && (
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Unit:</span> #{supervisor.unit_number}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No division command officers available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-blue-50">
          <CardContent className="p-6">
            <h3 className="font-bold text-blue-900 mb-3">Chain of Command</h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p><strong>For immediate site issues:</strong> Contact your Site Supervisor</p>
              <p><strong>For escalated concerns:</strong> Contact Division Command (Senior Corporal through Captain)</p>
              <p className="text-xs text-blue-600 mt-3">
                Note: Contact information is not displayed for security and privacy reasons. For urgent matters, please contact Virtus Security dispatch.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
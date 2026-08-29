import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, MapPin, Clock, Activity } from "lucide-react";
import { format } from "date-fns";

const LOGO_URL = "/black-point-shield.webp";

export default function ActiveTracker() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activeOfficers = [], isLoading, error, refetch } = useQuery({
    queryKey: ['activeOfficers', user?.id],
    queryFn: async () => {
      const result = await base44.functions.invoke('getOnDutyUnits', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      // Full getOnDutyUnits returns the canonical enriched user rows. Use those
      // when available so rank/name/status/location all come from one source.
      const rows = Array.isArray(payload.users) && payload.users.length ? payload.users : (payload.units || []);
      return rows.filter(row => row.session_active !== false && row.status !== 'Out of Service');
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Read-only view. The app-wide BackgroundLocationTracker is the only component
  // permitted to create/update/remove ActiveOfficer live-location records.

  const roles = new Set([user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase()));
  const canTrack = roles.has('admin') || roles.has('full_access') || roles.has('supervisor') || roles.has('cad_access') || roles.has('dispatch') || user?.dispatch_role === true;
  const officerDisplay = (officer) => {
    const last = String(officer?.last_name || officer?.full_name || officer?.officer_name || '').trim().split(/\s+/).pop();
    return [officer?.rank, last].filter(Boolean).join(' ') || (officer?.unit_number ? `Unit ${officer.unit_number}` : 'Officer');
  };

  if (user?.id && !canTrack) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Operational Tracking Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <img src={LOGO_URL} alt="Black Point Protection" className="w-16 h-16 object-contain" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-8 h-8 text-green-600" />
              Active Officer Tracker
            </h1>
            <p className="text-slate-600">Real-time location and status of on-duty officers</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-none shadow-lg bg-gradient-to-br from-green-600 to-green-700 text-white">
            <CardHeader>
              <CardTitle className="text-white text-sm font-medium">Officers On Duty</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold">{activeOfficers?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeOfficers?.map((officer) => (
            <Card key={officer.id} className="border-none shadow-xl hover:shadow-2xl transition-shadow">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg">
                        {officer.officer_name?.charAt(0) || 'O'}
                      </span>
                    </div>
                    <span className="text-slate-900">{officerDisplay(officer)}</span> 
                  </div>
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" title="Active" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Current Location</p>
                    <p className="text-sm font-semibold text-slate-900">{officer.current_location || officer.assigned_location || 'Location pending'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Clocked In</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {officer.clock_in_time && officer.clock_in_time !== '' ? format(new Date(officer.clock_in_time), 'h:mm a') : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Activity className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Last Update</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {officer.last_update && officer.last_update !== '' ? format(new Date(officer.last_update), 'h:mm:ss a') : 'N/A'}
                    </p>
                  </div>
                </div>
                {Number.isFinite(Number(officer.latitude)) && Number.isFinite(Number(officer.longitude)) && (
                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-500 font-mono">
                      GPS: {Number(officer.latitude).toFixed(6)}, {Number(officer.longitude).toFixed(6)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {error && (
          <Card className="border border-red-800/50 bg-red-950/20 shadow-lg">
            <CardContent className="p-8 text-center">
              <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
              <p className="font-bold text-red-200">Officer tracking could not refresh.</p>
              <p className="mt-1 text-sm text-slate-400">{error?.message || 'Unable to load the live officer feed.'}</p>
              <button onClick={() => refetch()} className="mt-4 rounded-lg border border-red-600 px-4 py-2 text-xs font-black text-red-100">TRY AGAIN</button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && !activeOfficers?.length && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Activity className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No officers currently have a fresh active tracking session.</p>
            </CardContent>
          </Card>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> Officer locations update automatically while they are signed into the app. 
            Live location comes from the same canonical Pathfinder GPS/session feed used by CAD. This page refreshes every 30 seconds and also refreshes when you return to the window.
          </p>
        </div>
      </div>
    </div>
  );
}
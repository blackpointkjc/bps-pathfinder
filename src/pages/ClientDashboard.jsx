import { getClientPortalUser, getClientPreviewId } from '@/utils/clientPreview';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, FileText, AlertTriangle, UserX, MapPin, Clock, Radio } from "lucide-react";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { listDirectoryLocations } from '@/lib/appDirectory';

export default function ClientDashboard() {
  
  const { data: user } = useQuery({
    queryKey: ['clientPortalUser', getClientPreviewId()],
    queryFn: getClientPortalUser,
    staleTime: 0,
  });

  const clientLocations = [...new Set([...(Array.isArray(user?.assigned_locations) ? user.assigned_locations : []), ...(Array.isArray(user?.assigned_sites) ? user.assigned_sites : []), ...(user?.assigned_location ? [user.assigned_location] : [])].filter(Boolean))];

  const siteKey = (value) => String(value || '').split(' - ')[0].split(':')[0].trim().toLowerCase();
  const assignedKeys = new Set(clientLocations.map(siteKey));
  const { data: assignedLocations = [] } = useQuery({
    queryKey: ['clientLocationsPortfolio', clientLocations.join('|')],
    queryFn: async () => (await listDirectoryLocations()).filter(loc => assignedKeys.has(siteKey(loc.site_name))),
    enabled: clientLocations.length > 0,
  });

  const { data: liveBilling = {} } = useQuery({
    queryKey: ['clientDashboardLiveCoverage', user?.id || user?.email, getClientPreviewId()],
    queryFn: async () => {
      const result = await base44.functions.invoke('getClientBillingData', getClientPreviewId() ? { client_id: getClientPreviewId() } : {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    enabled: !!user && clientLocations.length > 0,
    initialData: {},
    staleTime: 0,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const { data: clientRequests = [] } = useQuery({
    queryKey: ['clientDashboardRequests', user?.id, user?.email, getClientPreviewId()],
    queryFn: async () => {
      const rows = await base44.entities.SpecialCoverageRequest.list('-created_date', 100).catch(() => []);
      return rows.filter(row => row.created_by_id === user?.id || String(row.client_email || '').toLowerCase() === String(user?.email || '').toLowerCase());
    },
    enabled: !!user,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: reports } = useQuery({
    queryKey: ['clientDashboardReports', clientLocations.join('|')],
    queryFn: async () => {
      if (!clientLocations.length) return { shift: [], incident: [], trespass: [], parking: [], maintenance: [], opendoor: [], criminal: [] };
      
      const [shift, incident, trespass] = await Promise.all([
        base44.entities.ShiftReport.list('-created_date'),
        base44.entities.IncidentReport.list('-created_date'),
        base44.entities.TrespassingNotice.list('-created_date'),
      ]);
      const [parking, maintenance, opendoor] = await Promise.all([
        base44.entities.ParkingViolation.list('-created_date'),
        base44.entities.MaintenanceReport.list('-created_date'),
        base44.entities.OpenDoorReport.list('-created_date'),
      ]);
      const criminal = await base44.entities.CriminalComplaint.list('-created_date');

      return {
        shift: shift.filter(r => assignedKeys.has(siteKey(r.location)) && r.status === 'approved'),
        incident: incident.filter(r => assignedKeys.has(siteKey(r.location)) && r.status === 'approved'),
        trespass: trespass.filter(r => assignedKeys.has(siteKey(r.location)) && r.status === 'approved'),
        parking: parking.filter(r => assignedKeys.has(siteKey(r.location)) && r.status === 'approved'),
        maintenance: maintenance.filter(r => assignedKeys.has(siteKey(r.location))),
        opendoor: opendoor.filter(r => assignedKeys.has(siteKey(r.location))),
        criminal: criminal.filter(r => assignedKeys.has(siteKey(r.location)) && r.status === 'approved'),
      };
    },
    enabled: clientLocations.length > 0,
    staleTime: 0,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  if (clientLocations.length === 0) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Location Assigned</h2>
        <p className="text-slate-600">Please contact Black Point Protection to assign your account to a location.</p>
      </div>
    );
  }

  const totalReports = Object.values(reports || {}).reduce((sum, arr) => sum + arr.length, 0);
  const liveEntries = (liveBilling.time_entries || []).filter(entry => entry?.clock_in && !entry?.clock_out);
  const liveOfficers = liveBilling.officers || [];
  const pendingClientRequests = clientRequests.filter(row => ['pending','submitted','under_review'].includes(String(row.status || '').toLowerCase()));

  return (
    <div className="min-h-screen bg-[#070d17] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-xl sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Client Security Portal</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Welcome, {user?.first_name || 'Client'}</h1>
          <p className="mt-2 text-sm text-slate-400">Live coverage, verified activity, reports and service access across all properties assigned to your account.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {assignedLocations.map(location => <div key={location.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3"><div className="flex items-center gap-2 font-bold text-white"><MapPin className="h-4 w-4 text-cyan-400" />{location.site_name}</div><p className="mt-1 text-xs text-slate-400">{location.address || 'Address not listed'}</p></div>)}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-900/50 bg-[#0b1725] p-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Live Coverage</p><p className="mt-1 text-sm text-slate-400">Current clocked-in coverage at your properties · realtime with safety refresh</p></div>
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-black text-emerald-300">{liveEntries.length} ACTIVE</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveEntries.length ? liveEntries.map(entry => {
              const officer = liveOfficers.find(row => String(row.email || '').toLowerCase() === String(entry.officer_email || '').toLowerCase());
              const display = [officer?.rank, officer?.last_name].filter(Boolean).join(' ') || `Unit ${officer?.unit_number || 'Assigned'}`;
              return <div key={entry.id} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold text-white">{display}</span><span className="h-2 w-2 rounded-full bg-emerald-400"/></div><div className="mt-1 text-xs text-cyan-300">{entry.location || 'Assigned property'}</div><div className="mt-1 text-xs text-slate-500">On duty since {entry.clock_in ? new Date(entry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</div></div>;
            }) : <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500 sm:col-span-2 lg:col-span-3">No officers are currently clocked in at your assigned properties.</div>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border border-blue-500/25 bg-[#0b1725] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-black text-blue-200">Total Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-black text-white">{totalReports}</p>
            </CardContent>
          </Card>

          <Card className="border border-slate-700 bg-[#0b1725] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Incidents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-white">{reports?.incident?.length || 0}</p>
            </CardContent>
          </Card>

          <Card className="border border-slate-700 bg-[#0b1725] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserX className="w-4 h-4 text-orange-600" />
                Trespass
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-white">{reports?.trespass?.length || 0}</p>
            </CardContent>
          </Card>

          <Card className="border border-slate-700 bg-[#0b1725] text-white shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" /> {/* Changed from Car */}
                Shift Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-white">{reports?.shift?.length || 0}</p>
            </CardContent>
          </Card>
        </div>

        <section className="rounded-2xl border border-amber-500/20 bg-[#0a1421] p-5 shadow-lg">
          <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[.16em] text-amber-300">Pending Actions</div><h2 className="mt-1 text-xl font-black text-white">Service requests in progress</h2><p className="mt-1 text-xs text-slate-500">Requests you submitted that are still pending or under review.</p></div><AlertTriangle className="h-5 w-5 text-amber-300"/></div>
          <div className="mt-4 space-y-2">{pendingClientRequests.slice(0,6).map(row => <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-sm font-black text-white">Special Coverage Request</div><div className="text-xs font-bold text-cyan-200">{row.location || 'Assigned property'}</div><div className="mt-1 text-xs text-slate-500">{row.reason || row.special_requirements || 'Coverage request'} · {String(row.status || 'pending').replace(/_/g,' ')}</div></div><Link to={createPageUrl('ClientSpecialRequests')} className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-500/20">VIEW TASK</Link></div>)}{!pendingClientRequests.length && <div className="rounded-xl border border-dashed border-emerald-800/60 p-6 text-center text-sm text-emerald-300">No client requests are waiting for action.</div>}</div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5 shadow-lg">
            <div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Recent Verified Activity</div><h2 className="mt-1 text-xl font-black text-white">Latest reports from your properties</h2>
            <div className="mt-4 space-y-2">
              {[...(reports?.incident || []).map(row=>({...row,_type:'Incident'})), ...(reports?.shift || []).map(row=>({...row,_type:'Shift Report'})), ...(reports?.trespass || []).map(row=>({...row,_type:'Trespass'}))].sort((a,b)=>new Date(b.created_date||b.report_date||0)-new Date(a.created_date||a.report_date||0)).slice(0,6).map((row,index)=><div key={row.id||index} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3"><div className="min-w-0"><div className="text-sm font-bold text-white">{row._type}</div><div className="truncate text-xs text-cyan-300">{row.location || 'Assigned property'}</div></div><div className="max-w-[45%] truncate text-right text-xs text-slate-500">{row.incident_type || row.reason || row.summary || row.subject_name || 'Verified record'}</div></div>)}
              {!((reports?.incident?.length||0)+(reports?.shift?.length||0)+(reports?.trespass?.length||0)) && <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No recent verified activity is available.</div>}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-800 bg-[#0a1421] p-5 shadow-lg"><div className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Service Access</div><h2 className="mt-1 text-xl font-black text-white">Common client actions</h2><div className="mt-4 space-y-2">{[["Calls for Service","ClientCallHistory",Radio],["All Reports","ClientReports",FileText],["Trespass Management","ClientTrespass",UserX],["Property Information","ClientLocation",MapPin]].map(([label,page,Icon])=><Link key={label} to={createPageUrl(page)} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#0d1a2a] px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-500/40 hover:bg-[#102238]"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300"><Icon className="h-4 w-4"/></div><span className="flex-1">{label}</span><span className="text-slate-600">→</span></Link>)}</div></section>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link to={createPageUrl("ClientCallHistory")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-slate-900 to-blue-950 text-white">
                <CardTitle className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-amber-400" />
                  Calls for Service
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-400 text-sm">View active and archived police, fire, EMS, and BPS calls verified for your property</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("ClientReports")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  View All Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-400 text-sm">Access approved reports across all of your assigned sites</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("ClientTrespass")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50">
                <CardTitle className="flex items-center gap-2">
                  <UserX className="w-5 h-5 text-orange-600" />
                  Trespass Management
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-400 text-sm">Review and manage trespass records for your properties</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("ClientLocation")}>
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow cursor-pointer">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-green-600" />
                  Location Info
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-slate-400 text-sm">View property details and authorized site information</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

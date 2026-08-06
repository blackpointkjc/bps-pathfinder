import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, RefreshCw, MapPin, FileText, MessageSquare, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { calculateDistance } from '@/utils/alertUtils';
import { getClientPortalUser } from '@/utils/clientPreview';

const norm = value => String(value || '').toUpperCase().replace(/\bBLOCK\b/g, '').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const fmt = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const compactRef = value => String(value || '').replace(/^(BPS-\d{6}-)0+(\d+)$/i, '$1$2');

function callMatchesSite(call, site) {
  if (!call || !site) return false;
  const callLocation = norm(call.location);
  const siteName = norm(site.site_name);
  const siteAddress = norm(site.address);
  if (siteName && callLocation.includes(siteName)) return true;
  if (siteAddress && (callLocation.includes(siteAddress) || siteAddress.includes(callLocation))) return true;

  const lat = Number(call.latitude);
  const lng = Number(call.longitude);
  const siteLat = Number(site.latitude);
  const siteLng = Number(site.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(siteLat) && Number.isFinite(siteLng)) {
    const radius = Math.max(Number(site.geofence_radius_meters || 100), 100);
    return calculateDistance(lat, lng, siteLat, siteLng) <= radius;
  }
  return false;
}

export default function ClientCallHistory() {
  const [user, setUser] = useState(null);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState('ALL');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [agency, setAgency] = useState('ALL');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = async () => {
    try {
      const me = user || await getClientPortalUser();
      if (!user) setUser(me);
      const assignedNames = me?.assigned_locations || (me?.assigned_location ? [me.assigned_location] : []);
      const [allLocations, active, archived, notes, reports, propertyAlerts, monitoredProperties] = await Promise.all([
        base44.entities.Location.list(),
        base44.entities.DispatchCall.list('-time_received', 500),
        base44.entities.CallHistory.list('-archived_date', 500),
        base44.entities.CallNote.list('-created_date', 1000),
        base44.entities.IncidentReport.list('-created_date', 1000),
        base44.entities.PropertyAlert.list('-created_date', 1000).catch(() => []),
        base44.entities.MonitoredProperty.list('-created_date', 500).catch(() => []),
      ]);
      const assignedSites = (allLocations || []).filter(site => assignedNames.includes(site.site_name) || String(site.assigned_client_email || '').toLowerCase() === String(me?.email || '').toLowerCase());
      setSites(assignedSites);

      const calls = [...(active || []).map(c => ({ ...c, _source: 'active' })), ...(archived || []).map(c => ({ ...c, _source: 'archived' }))];
      const unique = new Map();
      for (const call of calls) {
        const key = call.external_call_id || call.original_call_id || call.call_id || `${call.time_received}|${call.location}|${call.incident}`;
        const current = unique.get(key);
        if (!current || current._source === 'archived') unique.set(key, call);
      }

      const clientRows = [...unique.values()].flatMap(call => {
        const callIdentifiers = new Set([call.id, call.original_call_id, call.call_id, call.agency_cad_number, call.bps_reference].filter(Boolean).map(String));
        const verifiedAlert = (propertyAlerts || []).find(alert => callIdentifiers.has(String(alert.callId || '')) && assignedSites.some(site => norm(alert.propertyName) === norm(site.site_name)));
        const monitoredMatch = !verifiedAlert ? (monitoredProperties || []).find(property => {
          const assignedSite = assignedSites.find(site => norm(property.name) === norm(site.site_name) || norm(property.address) === norm(site.address));
          if (!assignedSite) return false;
          return callMatchesSite(call, {
            ...assignedSite,
            latitude: property.latitude ?? assignedSite.latitude,
            longitude: property.longitude ?? assignedSite.longitude,
            geofence_radius_meters: property.radiusMeters ?? assignedSite.geofence_radius_meters,
          });
        }) : null;
        const matchedSite = verifiedAlert
          ? assignedSites.find(site => norm(site.site_name) === norm(verifiedAlert.propertyName))
          : monitoredMatch
            ? assignedSites.find(site => norm(site.site_name) === norm(monitoredMatch.name) || norm(site.address) === norm(monitoredMatch.address))
            : assignedSites.find(site => callMatchesSite(call, site));
        if (!matchedSite) return [];
        const identifiers = callIdentifiers;
        const linkedNotes = (notes || []).filter(note => identifiers.has(String(note.call_id || '')));
        const linkedReports = (reports || []).filter(report => {
          if (report.status !== 'approved') return false;
          if (identifiers.has(String(report.linked_call_id || '')) || identifiers.has(String(report.linked_call_number || '')) || identifiers.has(String(report.call_number || ''))) return true;
          const sameSite = report.location === matchedSite.site_name;
          const callDate = new Date(call.time_received || call.created_date || 0).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          return sameSite && report.incident_date === callDate;
        });
        return [{ ...call, matchedSite, linkedNotes, linkedReports, propertyVerified: Boolean(verifiedAlert), propertyAlert: verifiedAlert || null }];
      });
      setRows(clientRows);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => rows.filter(row => {
    if (selectedSite !== 'ALL' && row.matchedSite?.site_name !== selectedSite) return false;
    if (agency !== 'ALL' && row.agency !== agency) return false;
    const q = search.toLowerCase();
    return !q || [row.incident, row.location, row.agency, row.call_id, row.bps_reference, row.matchedSite?.site_name].some(v => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => new Date(b.time_received || b.created_date) - new Date(a.time_received || a.created_date)), [rows, selectedSite, agency, search]);

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white"><div className="text-center"><div className="h-8 w-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />Loading client call history…</div></div>;

  return (
    <div className="min-h-full bg-slate-950 text-white font-mono pb-24">
      <div className="border-b-2 border-gold/50 bg-slate-900 px-4 py-3 flex flex-wrap items-center gap-3">
        <Radio className="w-5 h-5 text-gold" />
        <div><h1 className="font-black tracking-widest">CALLS FOR SERVICE</h1><p className="text-[10px] text-slate-400">Only calls matched to your assigned properties</p></div>
        <div className="ml-auto text-[10px] text-slate-500">UPDATED {lastRefresh.toLocaleTimeString()}</div>
        <button onClick={() => { setRefreshing(true); load(); }} className="px-3 py-2 border border-slate-600 rounded bg-slate-800 text-xs flex items-center gap-2"><RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />REFRESH</button>
      </div>

      <div className="p-3 md:p-4 border-b border-slate-800 bg-slate-900/70 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search incident, address, agency or reference" className="w-full bg-slate-800 border border-slate-700 rounded pl-9 pr-3 py-2 text-xs" /></div>
        <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs"><option value="ALL">ALL PROPERTIES</option>{sites.map(site => <option key={site.id} value={site.site_name}>{site.site_name}</option>)}</select>
        <select value={agency} onChange={e => setAgency(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs"><option value="ALL">ALL AGENCIES</option>{[...new Set(rows.map(r => r.agency).filter(Boolean))].sort().map(a => <option key={a}>{a}</option>)}</select>
      </div>

      <div className="p-3 md:p-4 space-y-2">
        {filtered.length === 0 ? <div className="border border-slate-800 rounded-xl p-12 text-center text-slate-500">No calls for service matched your assigned properties.</div> : filtered.map(row => {
          const open = expanded === row.id;
          const official = row.agency_cad_number || (row.official_cad_verified ? row.call_id : '');
          const ref = official || compactRef(row.bps_reference || row.call_id);
          return <div key={`${row._source}-${row.id}`} className="border border-slate-700 bg-slate-900 rounded-lg overflow-hidden">
            <button onClick={() => setExpanded(open ? null : row.id)} className="w-full text-left p-3 md:p-4 grid grid-cols-1 md:grid-cols-[150px_1fr_220px_90px_90px_32px] gap-2 md:items-center hover:bg-slate-800/70">
              <div><div className={`text-xs font-black ${official ? 'text-blue-300' : 'text-gold'}`}>{ref || 'REFERENCE PENDING'}</div><div className="text-[10px] text-slate-500">{fmt(row.time_received || row.created_date)}</div></div>
              <div><div className="font-black text-sm">{row.incident || 'CALL FOR SERVICE'}</div><div className="text-xs text-slate-400 flex items-start gap-1 mt-1"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{row.location}</div></div>
              <div className="text-xs"><div className="text-slate-500">PROPERTY</div><div className="font-bold text-slate-200">{row.matchedSite?.site_name}</div>{row.propertyVerified && <div className="text-[9px] font-bold text-green-400 mt-1">✓ VERIFIED BY MONITORING QUEUE</div>}</div>
              <div className="text-xs"><span className="px-2 py-1 rounded border border-blue-700/50 bg-blue-900/30 text-blue-300">{row.agency || 'N/A'}</span></div>
              <div className="flex gap-2"><span title="Call notes" className="flex items-center gap-1 text-[10px] text-slate-300"><MessageSquare className="w-3 h-3" />{row.linkedNotes.length}</span><span title="Incident reports" className="flex items-center gap-1 text-[10px] text-slate-300"><FileText className="w-3 h-3" />{row.linkedReports.length}</span></div>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {open && <div className="border-t border-slate-700 p-4 grid md:grid-cols-2 gap-4 bg-slate-950/60">
              <div><h3 className="text-[10px] tracking-widest text-slate-500 mb-2">CALL DETAILS</h3><div className="space-y-2 text-xs"><p><span className="text-slate-500">Status:</span> {row.status || 'Unknown'}</p><p><span className="text-slate-500">Source:</span> {row._source === 'active' ? 'Active Calls Feed' : 'Archived Call History'}</p><p><span className="text-slate-500">Property match:</span> {row.propertyVerified ? `Verified by monitoring queue${row.propertyAlert?.relation ? ` · ${row.propertyAlert.relation}` : ''}` : 'Matched by assigned property address/GPS'}</p>{row.propertyAlert?.description && <p className="text-green-300">{row.propertyAlert.description}</p>}{row.description && <p className="leading-relaxed text-slate-300">{row.description}</p>}</div></div>
              <div><h3 className="text-[10px] tracking-widest text-slate-500 mb-2">NOTES & INCIDENT REPORTS</h3>{row.linkedNotes.length === 0 && row.linkedReports.length === 0 ? <p className="text-xs text-slate-500">No linked note or approved incident report.</p> : <div className="space-y-2">{row.linkedNotes.map(note => <div key={note.id} className="border border-slate-700 rounded p-2"><div className="text-[10px] text-slate-500">NOTE · {fmt(note.created_date)}</div><div className="text-xs mt-1">{note.note}</div></div>)}{row.linkedReports.map(report => <div key={report.id} className="border border-green-700/50 bg-green-950/20 rounded p-2"><div className="text-[10px] text-green-400">APPROVED INCIDENT REPORT · {report.report_number || report.linked_call_number || ''}</div><div className="text-xs font-bold mt-1">{String(report.incident_type || 'Incident').replace(/_/g, ' ')}</div><div className="text-xs text-slate-300 mt-1">{report.description}</div></div>)}</div>}</div>
            </div>}
          </div>;
        })}
      </div>
    </div>
  );
}

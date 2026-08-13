import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle, RefreshCw, ScanSearch, ServerCrash, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { runClientFunctionalAudit } from '@/utils/appDiagnostics';

const severityConfig = {
  outage: { label: 'Outage', color: 'text-red-300', bg: 'bg-red-950/35 border-red-700', icon: ServerCrash },
  degraded: { label: 'Degraded', color: 'text-amber-300', bg: 'bg-amber-950/30 border-amber-700', icon: AlertTriangle },
  maintenance: { label: 'Maintenance', color: 'text-blue-300', bg: 'bg-blue-950/30 border-blue-700', icon: Wrench },
};

const formatESTTime = (isoString) => {
  if (!isoString) return 'Unknown time';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

export default function SystemIssuesPanel({ currentUser }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [userMap, setUserMap] = useState({});
  const [scanning, setScanning] = useState(false);
  const [audit, setAudit] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [all, users] = await Promise.all([
        base44.entities.SystemOutage.list('-created_date', 100).catch(() => []),
        base44.entities.User.list().catch(() => []),
      ]);
      const map = {};
      (users || []).forEach(user => {
        const name = [user.rank, user.last_name?.toUpperCase()].filter(Boolean).join(' ') || user.full_name || user.email;
        map[user.id] = name;
        map[user.email] = name;
      });
      setUserMap(map);
      setIssues(all || []);
    } catch (error) {
      toast.error(error?.message || 'Unable to load reported system issues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runFullAudit = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const [serverResponse, clientAudit] = await Promise.all([
        base44.functions.invoke('runSystemAudit', {}),
        runClientFunctionalAudit(),
      ]);
      const serverAudit = serverResponse?.data || serverResponse || {};
      if (serverAudit.error) throw new Error(serverAudit.error);
      const combinedFindings = [...(clientAudit.findings || []), ...(serverAudit.findings || [])];
      const combined = {
        ...serverAudit,
        findings: combinedFindings,
        client_summary: clientAudit.summary,
        summary: {
          ...(serverAudit.summary || {}),
          areas_checked: (serverAudit.summary?.areas_checked || 0) + 5,
          issues_found: combinedFindings.length,
          outages: combinedFindings.filter(item => item.severity === 'outage').length,
          degraded: combinedFindings.filter(item => item.severity === 'degraded').length,
          maintenance: combinedFindings.filter(item => item.severity === 'maintenance').length,
        },
        duration_ms: Math.max(serverAudit.duration_ms || 0, clientAudit.duration_ms || 0),
        scanned_at: new Date().toISOString(),
      };
      setAudit(combined);
      if (combined.summary.issues_found) {
        toast.warning(`Full app scan found ${combined.summary.issues_found} issue(s)`);
      } else {
        toast.success('Full app functional and code scan completed — no issues found');
      }
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'Full app scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleResolve = async (id) => {
    const resolvedByName = [currentUser?.rank, currentUser?.last_name?.toUpperCase()].filter(Boolean).join(' ') || currentUser?.full_name || currentUser?.email;
    try {
      await base44.entities.SystemOutage.update(id, {
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedByName,
      });
      toast.success('Issue marked as resolved');
      load();
    } catch (error) {
      toast.error(error?.message || 'Unable to resolve issue');
    }
  };

  const active = issues.filter(issue => !issue.resolved_at);
  const resolved = issues.filter(issue => issue.resolved_at);
  const displayed = showResolved ? resolved : active;
  const findings = audit?.findings || [];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-cyan-700/60 bg-cyan-950/20 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black tracking-wider text-white">
              <ScanSearch className="h-5 w-5 text-cyan-300" />
              FULL APPLICATION SYSTEM AUDIT
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
              Checks every page module for broken code, captured runtime crashes, browser functions, voice and location support,
              plus users, CAD, assignments, properties, alerts, scheduling, timekeeping, reports, training, communications, fleet, BOLO, and data services.
            </p>
          </div>
          <button
            onClick={runFullAudit}
            disabled={scanning}
            className="flex min-w-52 items-center justify-center gap-2 rounded-lg border border-cyan-500 bg-cyan-700/30 px-5 py-3 text-xs font-black tracking-wider text-cyan-100 transition hover:bg-cyan-700/50 disabled:cursor-wait disabled:opacity-60"
          >
            <ScanSearch className={`h-4 w-4 ${scanning ? 'animate-pulse' : ''}`} />
            {scanning ? 'SCANNING ENTIRE APP...' : 'RUN FULL APP SCAN'}
          </button>
        </div>

        {audit && (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {[
                ['Areas Checked', audit.summary?.areas_checked || 0, 'text-cyan-300'],
                ['Issues Found', audit.summary?.issues_found || 0, findings.length ? 'text-amber-300' : 'text-green-300'],
                ['Outages', audit.summary?.outages || 0, 'text-red-300'],
                ['Degraded', audit.summary?.degraded || 0, 'text-amber-300'],
                ['Maintenance', audit.summary?.maintenance || 0, 'text-blue-300'],
              ].map(([label, number, color]) => (
                <div key={label} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
                  <div className={`mt-1 text-2xl font-black ${color}`}>{number}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              Last full scan: {formatESTTime(audit.scanned_at)} · {audit.duration_ms || 0} ms
              {audit.client_summary && ` · ${audit.client_summary.page_modules_loaded}/${audit.client_summary.page_modules_checked} page modules loaded · ${audit.client_summary.runtime_errors_24h} runtime errors captured in 24h`}
            </div>
          </div>
        )}
      </section>

      {audit && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black tracking-widest text-white">FULL APP SCAN RESULTS ({findings.length})</h3>
          </div>
          {findings.length === 0 ? (
            <div className="rounded-lg border border-green-700 bg-green-950/25 px-4 py-8 text-center text-sm font-bold text-green-300">
              <CheckCircle className="mx-auto mb-2 h-7 w-7" />
              All checked application areas passed.
            </div>
          ) : (
            <div className="space-y-2">
              {findings.map(finding => {
                const cfg = severityConfig[finding.severity] || severityConfig.degraded;
                const Icon = cfg.icon;
                return (
                  <div key={finding.key} className={`rounded-lg border p-4 ${cfg.bg}`}>
                    <div className="flex items-start gap-3">
                      <Icon className={`mt-0.5 h-5 w-5 flex-none ${cfg.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-[10px] font-black uppercase tracking-widest ${cfg.color}`}>
                          {finding.area} · {cfg.label}{finding.count ? ` · ${finding.count} records` : ''}
                        </div>
                        <div className="mt-1 text-sm font-bold text-white">{finding.title}</div>
                        <div className="mt-1 text-xs leading-relaxed text-slate-300">{finding.description}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="border-t border-slate-800 pt-5">
        <div className="mb-3 text-xs font-black tracking-widest text-white">REPORTED SYSTEM ISSUES</div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <button
              onClick={() => setShowResolved(false)}
              className={`rounded border px-4 py-2 text-sm font-bold transition-colors ${!showResolved ? 'border-red-700 bg-red-900/40 text-red-300' : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Active ({active.length})
            </button>
            <button
              onClick={() => setShowResolved(true)}
              className={`rounded border px-4 py-2 text-sm font-bold transition-colors ${showResolved ? 'border-green-700 bg-green-900/40 text-green-300' : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Resolved ({resolved.length})
            </button>
          </div>
          <button onClick={load} aria-label="Refresh reported issues" className="rounded-lg bg-slate-800 p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-white" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            {showResolved ? 'No resolved reported issues' : 'No active reported issues'}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {displayed.map(issue => {
              const cfg = severityConfig[issue.severity] || severityConfig.outage;
              return (
                <div key={issue.id} className={`rounded-lg border p-4 ${cfg.bg}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className={`text-xs font-bold ${cfg.color}`}>{issue.component} — {cfg.label.toUpperCase()}</div>
                      <div className="mt-1 text-sm font-bold text-white">{issue.title}</div>
                      {issue.description && <div className="mt-1 text-xs text-slate-400">{issue.description}</div>}
                      <div className="mt-2 text-xs text-slate-500">
                        Reported by {userMap[issue.reported_by] || issue.reported_by || 'System'} · {formatESTTime(issue.created_date)}
                      </div>
                      {issue.resolved_at && (
                        <div className="mt-1 text-xs text-green-500">
                          Resolved by {userMap[issue.resolved_by] || issue.resolved_by} · {formatESTTime(issue.resolved_at)}
                        </div>
                      )}
                    </div>
                    {!issue.resolved_at && (
                      <button onClick={() => handleResolve(issue.id)} className="flex flex-none items-center gap-1.5 rounded bg-green-800 px-3 py-1.5 text-xs text-green-200 hover:bg-green-700">
                        <CheckCircle className="h-3 w-3" /> Resolve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

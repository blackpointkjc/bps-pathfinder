import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ServerCrash, Wrench } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import RateLimitDiagnostics from '@/components/admin/RateLimitDiagnostics';
import { getBase44RateLimitSummary, getBase44RequestHealth } from '@/api/base44Client';
import { runClientFunctionalAudit } from '@/utils/appDiagnostics';

const severityConfig = {
  outage: { label: 'System Outage', icon: ServerCrash, border: 'border-red-600/60', bg: 'bg-red-950/35', text: 'text-red-300' },
  degraded: { label: 'Degraded Service', icon: AlertTriangle, border: 'border-amber-600/60', bg: 'bg-amber-950/30', text: 'text-amber-300' },
  maintenance: { label: 'Maintenance', icon: Wrench, border: 'border-blue-600/60', bg: 'bg-blue-950/30', text: 'text-blue-300' },
};

const formatTime = value => {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function SystemStatus() {
  const [issues, setIssues] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiTraceOpen, setApiTraceOpen] = useState(false);
  const [diagnosticFindings, setDiagnosticFindings] = useState([]);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  const load = async ({ runChecks = false } = {}) => {
    setLoading(true);
    try {
      const [rows, user, scanRuns] = await Promise.all([
        base44.entities.SystemOutage.filter({ resolved_at: null }, '-created_date', 100),
        base44.auth.me().catch(() => null),
        base44.entities.SystemScanRun.list('-scanned_at', 1).catch(() => []),
      ]);
      setIssues(rows || []);
      setCurrentUser(user || null);

      let findings = [];
      let checkedAt = scanRuns?.[0]?.scanned_at || null;
      if (scanRuns?.[0]?.audit_json) {
        try {
          const previous = JSON.parse(scanRuns[0].audit_json);
          findings = Array.isArray(previous?.findings) ? previous.findings : [];
        } catch {}
      }

      if (runChecks && user?.role === 'admin') {
        // A manual System Status refresh is a real functional check, not just a
        // reread of SystemOutage rows. Run server and browser probes sequentially
        // so the diagnostic itself does not create another request burst.
        const serverResponse = await base44.functions.invoke('runSystemAudit', {});
        const serverAudit = serverResponse?.data || serverResponse || {};
        if (serverAudit.error) throw new Error(serverAudit.error);
        const clientAudit = await runClientFunctionalAudit();
        const merged = new Map();
        for (const item of [...(serverAudit.findings || []), ...(clientAudit.findings || [])]) {
          const key = item.key || `${item.area}|${item.title}`;
          if (!merged.has(key)) merged.set(key, item);
        }
        findings = [...merged.values()];
        checkedAt = new Date().toISOString();
      }

      setDiagnosticFindings(findings);
      setLastCheckedAt(checkedAt);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const initial = async () => {
      await load({ runChecks: false });
      if (!active) return;
    };
    initial();
    let unsubscribe = null;
    try {
      unsubscribe = base44.entities.SystemOutage.subscribe(() => load({ runChecks: false }));
    } catch {}
    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const activeOutages = useMemo(() => {
    const bySignature = new Map();
    for (const issue of issues.filter(issue => !issue.resolved_at)) {
      const signature = [issue.component, issue.title, issue.source].map(value => String(value || '').trim().toLowerCase()).join('|');
      const existing = bySignature.get(signature);
      const issueStamp = new Date(issue.last_seen_at || issue.created_date || 0).getTime();
      const existingStamp = existing ? new Date(existing.last_seen_at || existing.created_date || 0).getTime() : -Infinity;
      if (!existing || issueStamp >= existingStamp) bySignature.set(signature, issue);
    }
    return [...bySignature.values()].sort((a, b) => new Date(b.last_seen_at || b.created_date || 0) - new Date(a.last_seen_at || a.created_date || 0));
  }, [issues]);

  const requestHealth = getBase44RequestHealth();
  const rateLimitSummary = getBase44RateLimitSummary();
  const rateLimitCount = rateLimitSummary.reduce((sum, item) => sum + (Number(item.rateLimits) || 0), 0);
  const diagnosticIssues = useMemo(() => (diagnosticFindings || []).map(item => ({
    id: `diagnostic:${item.key || item.title}`,
    severity: item.severity || 'degraded',
    component: item.area || 'System Audit',
    title: item.title || 'Diagnostic issue',
    description: item.description || '',
    created_date: lastCheckedAt,
    last_seen_at: lastCheckedAt,
    source: 'functional_audit',
    occurrence_count: item.count || 1,
  })), [diagnosticFindings, lastCheckedAt]);
  const requestPressureIssue = requestHealth.rateLimitedUntil || rateLimitCount > 0 ? [{
    id: 'diagnostic:api-pressure',
    severity: 'degraded',
    component: 'Base44 API',
    title: requestHealth.rateLimitedUntil ? 'API request throttling is active' : 'API rate limiting was detected recently',
    description: requestHealth.rateLimitedUntil
      ? `Pathfinder is deliberately suppressing and deduplicating background requests until ${formatTime(requestHealth.rateLimitedUntil)} so live CAD/GPS traffic can recover.`
      : `${rateLimitCount} rate-limit event(s) were recorded during the last 15 minutes. Open API Trace to see the affected functions.`,
    created_date: requestHealth.recentRateLimitAt || new Date().toISOString(),
    last_seen_at: requestHealth.recentRateLimitAt || new Date().toISOString(),
    source: 'request_health',
    occurrence_count: Math.max(1, rateLimitCount),
  }] : [];
  const statusIssues = useMemo(() => {
    const map = new Map();
    [...activeOutages, ...diagnosticIssues, ...requestPressureIssue].forEach(item => {
      const key = [item.component, item.title].map(value => String(value || '').trim().toLowerCase()).join('|');
      if (!map.has(key)) map.set(key, item);
    });
    return [...map.values()];
  }, [activeOutages, diagnosticIssues, requestPressureIssue]);

  return (
    <div className="min-h-full bg-[#060b12] p-3 text-white sm:p-5">
      {currentUser?.role === 'admin' && <RateLimitDiagnostics open={apiTraceOpen} onClose={() => setApiTraceOpen(false)} />}
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700 bg-[#0a1623] p-4 shadow-xl">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${statusIssues.length ? 'border-red-600/50 bg-red-950/50 text-red-300' : 'border-emerald-600/50 bg-emerald-950/30 text-emerald-300'}`}>
            {statusIssues.length ? <ServerCrash className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Pathfinder System Status</div>
            <h1 className="mt-0.5 text-xl font-black">{statusIssues.length ? `${statusIssues.length} Active System Issue${statusIssues.length === 1 ? '' : 's'}` : 'All Checked Systems Operational'}</h1>
            <p className="mt-1 text-xs text-slate-400">Outage records, latest functional audit findings, browser/runtime checks, and current API pressure are all included.{lastCheckedAt ? ` Last full check: ${formatTime(lastCheckedAt)}.` : ''}</p>
          </div>
          <button type="button" onClick={() => load({ runChecks: currentUser?.role === 'admin' })} disabled={loading} className="flex h-9 items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 text-[10px] font-black text-slate-200 hover:border-cyan-500 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />REFRESH
          </button>
          {currentUser?.role === 'admin' && (
            <>
              <button type="button" onClick={() => setApiTraceOpen(true)} className="flex h-9 items-center gap-2 rounded-lg border border-red-600/50 bg-red-950/25 px-3 text-[10px] font-black text-red-200 hover:bg-red-900/40">
                <Activity className="h-3.5 w-3.5" /> API TRACE {rateLimitCount > 0 ? `· ${rateLimitCount}` : ''}
              </button>

            </>
          )}
        </div>

        {currentUser?.role === 'admin' && (
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-[#0a1623] px-3 py-2">
              <div className="text-[8px] font-black uppercase tracking-[.14em] text-slate-500">Queued API Reads</div>
              <div className="mt-1 text-lg font-black text-cyan-300">{requestHealth.queuedReads}</div>
            </div>
            <div className="rounded-xl border border-slate-700 bg-[#0a1623] px-3 py-2">
              <div className="text-[8px] font-black uppercase tracking-[.14em] text-slate-500">Active API Requests</div>
              <div className="mt-1 text-lg font-black text-blue-300">{requestHealth.activeReads + requestHealth.activeWrites}</div>
            </div>
            <button type="button" onClick={() => setApiTraceOpen(true)} className="rounded-xl border border-red-700/50 bg-red-950/25 px-3 py-2 text-left transition hover:bg-red-900/35">
              <div className="text-[8px] font-black uppercase tracking-[.14em] text-red-300">Rate Limits Logged</div>
              <div className="mt-1 text-lg font-black text-red-200">{rateLimitCount}</div>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-800 bg-[#08111d]">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : statusIssues.length === 0 ? (
          <div className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 px-5 py-14 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <div className="mt-3 text-lg font-black text-emerald-200">No issue was found by the current status sources.</div>
            <div className="mt-1 text-sm text-slate-400">For administrators, REFRESH runs the server audit and browser functional probes before declaring the system healthy.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {statusIssues.map(issue => {
              const cfg = severityConfig[issue.severity] || severityConfig.outage;
              const Icon = cfg.icon;
              return (
                <section key={issue.id} className={`rounded-2xl border p-4 shadow-lg ${cfg.border} ${cfg.bg}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${cfg.border} ${cfg.text}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${cfg.text}`}>{cfg.label} · {issue.component || 'Pathfinder'}</div>
                      <h2 className="mt-1 text-base font-black text-white">{issue.title || 'System issue'}</h2>
                      {issue.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{issue.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-[10px] font-bold text-slate-500">
                        <span>Reported: {formatTime(issue.created_date)}</span>
                        {issue.last_seen_at && <span>Last detected: {formatTime(issue.last_seen_at)}</span>}
                        {Number(issue.occurrence_count) > 1 && <span>Detected {issue.occurrence_count} times</span>}
                        {issue.source && <span>Source: {String(issue.source).replace(/_/g, ' ')}</span>}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

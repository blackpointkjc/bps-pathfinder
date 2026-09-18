import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ServerCrash, Wrench } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';

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

  const load = async () => {
    setLoading(true);
    try {
      const [rows, user] = await Promise.all([
        base44.entities.SystemOutage.filter({ resolved_at: null }, '-created_date', 100),
        base44.auth.me().catch(() => null),
      ]);
      setIssues(rows || []);
      setCurrentUser(user || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const initial = async () => {
      await load();
      if (!active) return;
    };
    initial();
    let unsubscribe = null;
    try {
      unsubscribe = base44.entities.SystemOutage.subscribe(() => load());
    } catch {}
    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const activeOutages = useMemo(
    () => issues.filter(issue => !issue.resolved_at).sort((a, b) => new Date(b.last_seen_at || b.created_date || 0) - new Date(a.last_seen_at || a.created_date || 0)),
    [issues]
  );

  return (
    <div className="min-h-full bg-[#060b12] p-3 text-white sm:p-5">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700 bg-[#0a1623] p-4 shadow-xl">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${activeOutages.length ? 'border-red-600/50 bg-red-950/50 text-red-300' : 'border-emerald-600/50 bg-emerald-950/30 text-emerald-300'}`}>
            {activeOutages.length ? <ServerCrash className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Pathfinder System Status</div>
            <h1 className="mt-0.5 text-xl font-black">{activeOutages.length ? `${activeOutages.length} Active System Issue${activeOutages.length === 1 ? '' : 's'}` : 'All Systems Operational'}</h1>
            <p className="mt-1 text-xs text-slate-400">Current outage and degraded-service information reported by Pathfinder.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="flex h-9 items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 text-[10px] font-black text-slate-200 hover:border-cyan-500 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />REFRESH
          </button>
          {currentUser?.role === 'admin' && (
            <button type="button" onClick={() => { window.location.href = `${createPageUrl('AdminPortal')}?tab=sysissues`; }} className="flex h-9 items-center gap-2 rounded-lg border border-cyan-600/60 bg-cyan-950/30 px-3 text-[10px] font-black text-cyan-200 hover:bg-cyan-900/40">
              MANAGE ISSUES <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-800 bg-[#08111d]">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : activeOutages.length === 0 ? (
          <div className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 px-5 py-14 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
            <div className="mt-3 text-lg font-black text-emerald-200">No active outage is currently reported.</div>
            <div className="mt-1 text-sm text-slate-400">The red System Outage indicator will disappear when all active outage records are resolved.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeOutages.map(issue => {
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

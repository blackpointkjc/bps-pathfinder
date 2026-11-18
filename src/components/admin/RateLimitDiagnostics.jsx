import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clipboard, Trash2, X } from 'lucide-react';
import { clearBase44RequestTrace, getBase44RequestHealth, getBase44RequestTrace } from '@/api/base44Client';

const outcomeClass = outcome => {
  if (outcome === 'rate_limit') return 'border-red-500/50 bg-red-950/40 text-red-200';
  if (outcome === 'error' || outcome === 'queue_timeout') return 'border-amber-500/40 bg-amber-950/30 text-amber-200';
  if (outcome === 'success') return 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200';
  return 'border-slate-700 bg-slate-900/70 text-slate-400';
};

export default function RateLimitDiagnostics({ open, onClose }) {
  const [rows, setRows] = useState(() => getBase44RequestTrace());
  const [health, setHealth] = useState(() => getBase44RequestHealth());

  useEffect(() => {
    if (!open) return undefined;
    const refresh = () => {
      setRows(getBase44RequestTrace());
      setHealth(getBase44RequestHealth());
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('bps-base44-request-trace', refresh);
    window.addEventListener('bps-base44-request-trace-cleared', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('bps-base44-request-trace', refresh);
      window.removeEventListener('bps-base44-request-trace-cleared', refresh);
    };
  }, [open]);

  const recentWindowRows = useMemo(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    return rows.filter(row => new Date(row.at || 0).getTime() >= cutoff);
  }, [rows]);
  const summary = useMemo(() => {
    const grouped = new Map();
    for (const row of recentWindowRows) {
      const key = row.label || 'unknown';
      const current = grouped.get(key) || { label: key, total: 0, rateLimits: 0, errors: 0, successes: 0, cacheHits: 0, lastAt: null };
      current.total += 1;
      if (row.outcome === 'rate_limit') current.rateLimits += 1;
      if (row.outcome === 'error' || row.outcome === 'queue_timeout') current.errors += 1;
      if (row.outcome === 'success') current.successes += 1;
      if (row.outcome === 'cache_hit' || row.outcome === 'deduped_inflight') current.cacheHits += 1;
      if (!current.lastAt || String(row.at) > String(current.lastAt)) current.lastAt = row.at;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => (b.rateLimits - a.rateLimits) || (b.total - a.total));
  }, [recentWindowRows]);
  const rateLimits = useMemo(() => recentWindowRows.filter(row => row.outcome === 'rate_limit'), [recentWindowRows]);
  const recent = recentWindowRows.slice(0, 100);

  if (!open) return null;

  const copyTrace = async () => {
    const payload = {
      exported_at: new Date().toISOString(),
      health,
      top_sources: summary.slice(0, 30),
      rate_limits: rateLimits.slice(0, 100),
      recent_requests: recent,
    };
    try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); } catch {}
  };

  const clear = () => {
    clearBase44RequestTrace();
    setRows([]);
    setHealth(getBase44RequestHealth());
  };

  return (
    <div className="fixed inset-0 z-[2147483100] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <section className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-[#07111d] text-white shadow-[0_30px_100px_rgba(0,0,0,.75)]" onClick={event => event.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-slate-700 bg-[#0b1725] px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/40 bg-red-950/40"><Activity className="h-4 w-4 text-red-300" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black tracking-wide">BASE44 API TRACE</h2>
            <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">Local diagnostics only · creates no additional Base44 traffic</div>
          </div>
          <button onClick={copyTrace} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-2.5 text-[9px] font-black text-slate-200 hover:border-cyan-500"><Clipboard className="h-3.5 w-3.5"/>COPY TRACE</button>
          <button onClick={clear} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-[9px] font-black text-slate-400 hover:border-red-500 hover:text-red-200"><Trash2 className="h-3.5 w-3.5"/>CLEAR</button>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white"><X className="h-4 w-4"/></button>
        </header>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-800 p-3 sm:grid-cols-5">
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2"><div className="text-lg font-black text-white">{rows.length}</div><div className="text-[8px] font-black uppercase text-slate-500">Logged Events</div></div>
          <div className="rounded-lg border border-red-500/40 bg-red-950/25 px-3 py-2"><div className="text-lg font-black text-red-300">{rateLimits.length}</div><div className="text-[8px] font-black uppercase text-red-200/60">429 / Rate Limits</div></div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2"><div className="text-lg font-black text-cyan-300">{health.queuedReads}</div><div className="text-[8px] font-black uppercase text-slate-500">Queued Reads</div></div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2"><div className="text-lg font-black text-blue-300">{health.activeReads}</div><div className="text-[8px] font-black uppercase text-slate-500">Active Reads</div></div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2"><div className="text-lg font-black text-amber-300">{health.activeWrites}</div><div className="text-[8px] font-black uppercase text-slate-500">Active Writes</div></div>
        </div>

        {health.rateLimitedUntil && (
          <div className="flex items-center gap-2 border-b border-red-700/60 bg-red-950/40 px-4 py-2 text-[10px] font-black text-red-200">
            <AlertTriangle className="h-4 w-4"/>CLIENT COOLDOWN ACTIVE UNTIL {new Date(health.rateLimitedUntil).toLocaleTimeString()}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-hidden rounded-xl border border-slate-700 bg-[#08111d]">
            <div className="border-b border-slate-800 px-3 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400">Top Request Sources · Last 15 Minutes</div>
            <div className="max-h-full overflow-y-auto">
              {summary.slice(0, 50).map(item => (
                <div key={item.label} className="border-b border-slate-800/70 px-3 py-2">
                  <div className="truncate text-[10px] font-black text-white">{item.label}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[8px] font-black uppercase">
                    <span className="text-slate-500">{item.total} events</span>
                    {item.rateLimits > 0 && <span className="text-red-300">{item.rateLimits} rate limited</span>}
                    {item.errors > 0 && <span className="text-amber-300">{item.errors} errors</span>}
                    <span className="text-emerald-400">{item.successes} network success</span>
                    <span className="text-cyan-400">{item.cacheHits} cached/deduped</span>
                  </div>
                </div>
              ))}
              {!summary.length && <div className="p-6 text-center text-xs text-slate-500">No requests logged yet.</div>}
            </div>
          </div>

          <div className="min-h-0 overflow-hidden rounded-xl border border-slate-700 bg-[#08111d]">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <span className="text-[9px] font-black uppercase tracking-[.14em] text-slate-400">Recent Request Trace</span>
              <span className="text-[8px] font-bold text-slate-600">Newest first</span>
            </div>
            <div className="max-h-full overflow-y-auto">
              {recent.map(row => (
                <div key={row.id} className="grid gap-1 border-b border-slate-800/70 px-3 py-2 md:grid-cols-[110px_minmax(0,1fr)_110px] md:items-center">
                  <div className="text-[9px] font-mono text-slate-500">{new Date(row.at).toLocaleTimeString()}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-black text-white">{row.label}</div>
                    <div className="truncate text-[8px] text-slate-600">{row.page || 'unknown page'}{row.error ? ` · ${row.error}` : ''}</div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    {Number.isFinite(row.duration_ms) && <span className="text-[8px] font-mono text-slate-500">{row.duration_ms}ms</span>}
                    <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase ${outcomeClass(row.outcome)}`}>{row.outcome}</span>
                  </div>
                </div>
              ))}
              {!recent.length && <div className="p-6 text-center text-xs text-slate-500">No requests logged yet.</div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

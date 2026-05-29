import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const severityConfig = {
  outage: { label: 'Outage', color: 'text-red-400', bg: 'bg-red-900/30 border-red-700' },
  degraded: { label: 'Degraded', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700' },
  maintenance: { label: 'Maintenance', color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-700' },
};

export default function SystemIssuesPanel({ currentUser }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [userMap, setUserMap] = useState({});

  const load = async () => {
    setLoading(true);
    const [all, users] = await Promise.all([
      base44.entities.SystemOutage.list('-created_date', 100),
      base44.entities.User.list()
    ]);
    const map = {};
    (users || []).forEach(u => {
      const name = [u.rank, u.last_name?.toUpperCase()].filter(Boolean).join(' ') || u.full_name || u.email;
      map[u.id] = name;
      map[u.email] = name;
    });
    setUserMap(map);
    setIssues(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async (id) => {
    const resolvedByName = [currentUser?.rank, currentUser?.last_name?.toUpperCase()].filter(Boolean).join(' ') || currentUser?.full_name || currentUser?.email;
    await base44.entities.SystemOutage.update(id, {
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedByName,
    });
    toast.success('Issue marked as resolved');
    load();
  };

  const active = issues.filter(i => !i.resolved_at);
  const resolved = issues.filter(i => i.resolved_at);
  const displayed = showResolved ? resolved : active;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            onClick={() => setShowResolved(false)}
            className={`px-4 py-2 rounded font-mono text-sm font-bold border transition-colors ${!showResolved ? 'bg-red-900/40 border-red-700 text-red-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
          >
            Active ({active.length})
          </button>
          <button
            onClick={() => setShowResolved(true)}
            className={`px-4 py-2 rounded font-mono text-sm font-bold border transition-colors ${showResolved ? 'bg-green-900/40 border-green-700 text-green-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
          >
            Resolved ({resolved.length})
          </button>
        </div>
        <button onClick={load} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-slate-500 font-mono">
          {showResolved ? 'No resolved issues' : '✓ No active system issues'}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(issue => {
            const cfg = severityConfig[issue.severity] || severityConfig.outage;
            return (
              <div key={issue.id} className={`p-4 rounded-lg border ${cfg.bg}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-mono font-bold ${cfg.color}`}>{issue.component} — {cfg.label.toUpperCase()}</span>
                    </div>
                    <div className="text-white font-mono font-bold text-sm">{issue.title}</div>
                    {issue.description && <div className="text-slate-400 text-xs mt-1">{issue.description}</div>}
                    <div className="text-slate-500 text-xs mt-2 font-mono">
                      Reported by {userMap[issue.reported_by] || issue.reported_by} · {new Date(issue.created_date).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                    </div>
                    {issue.resolved_at && (
                      <div className="text-green-500 text-xs mt-1 font-mono">
                        ✓ Resolved by {userMap[issue.resolved_by] || issue.resolved_by} · {new Date(issue.resolved_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                      </div>
                    )}
                  </div>
                  {!issue.resolved_at && (
                    <button
                      onClick={() => handleResolve(issue.id)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-green-800 hover:bg-green-700 text-green-300 rounded font-mono text-xs"
                    >
                      <CheckCircle className="w-3 h-3" /> Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
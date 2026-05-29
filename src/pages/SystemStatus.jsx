import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Plus, X } from 'lucide-react';

const COMPONENTS = [
  'Dispatch Feed - Richmond',
  'Dispatch Feed - Henrico',
  'Dispatch Feed - Chesterfield',
  'GPS / Location Tracking',
  'AI Dispatch',
  'Geocoding Service',
  'Database',
  'Authentication',
];

const severityConfig = {
  outage: { label: 'Outage', color: 'text-red-400', bg: 'bg-red-900/30 border-red-700', icon: XCircle },
  degraded: { label: 'Degraded', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700', icon: AlertTriangle },
  maintenance: { label: 'Maintenance', color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-700', icon: AlertTriangle },
};

export default function SystemStatus() {
  const [outages, setOutages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ component: COMPONENTS[0], severity: 'outage', title: '', description: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [all, me] = await Promise.all([
        base44.entities.SystemOutage.filter({ resolved_at: null }),
        base44.auth.me(),
      ]);
      setOutages(all);
      setUser(me);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const componentStatus = (comp) => {
    const active = outages.find(o => o.component === comp && !o.resolved_at);
    return active || null;
  };

  const handleReport = async () => {
    if (!form.title.trim()) return;
    await base44.entities.SystemOutage.create({
      ...form,
      reported_by: user?.email,
    });
    // Email all admins
    try {
      const allUsers = await base44.entities.User.list();
      const admins = allUsers.filter(u => u.role === 'admin' && u.email);
      await Promise.all(admins.map(admin =>
        base44.integrations.Core.SendEmail({
          to: admin.email,
          subject: `[BPS CAD] System Issue Reported: ${form.component}`,
          body: `A system issue has been reported.\n\nComponent: ${form.component}\nSeverity: ${form.severity.toUpperCase()}\nTitle: ${form.title}\n${form.description ? `Details: ${form.description}\n` : ''}\nReported by: ${user?.email}\n\nPlease review at System Status page.`,
        })
      ));
    } catch (e) {
      console.error('Email notification failed:', e);
    }
    setShowForm(false);
    setForm({ component: COMPONENTS[0], severity: 'outage', title: '', description: '' });
    load();
  };

  const handleResolve = async (id) => {
    await base44.entities.SystemOutage.update(id, {
      resolved_at: new Date().toISOString(),
      resolved_by: user?.email,
    });
    load();
  };

  const activeCount = outages.length;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-mono text-white">System Status</h1>
            <p className="text-slate-400 text-sm font-mono mt-1">
              {activeCount === 0 ? '✓ All systems operational' : `${activeCount} active incident${activeCount > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            {user?.role === 'admin' && (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-mono text-sm">
                <Plus className="w-4 h-4" /> Report Issue
              </button>
            )}
          </div>
        </div>

        {/* Component Grid */}
        <div className="grid gap-2 mb-8">
          {COMPONENTS.map(comp => {
            const issue = componentStatus(comp);
            const cfg = issue ? severityConfig[issue.severity] : null;
            const Icon = cfg ? cfg.icon : CheckCircle;
            return (
              <div key={comp} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${issue ? cfg.bg : 'bg-slate-900 border-slate-800'}`}>
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${issue ? cfg.color : 'text-green-400'}`} />
                  <span className="font-mono text-sm">{comp}</span>
                </div>
                <div className="flex items-center gap-3">
                  {issue ? (
                    <>
                      <span className={`text-xs font-mono font-bold ${cfg.color}`}>{cfg.label.toUpperCase()}</span>
                      {user?.role === 'admin' && (
                        <button onClick={() => handleResolve(issue.id)} className="text-xs px-2 py-1 bg-green-800 hover:bg-green-700 text-green-300 rounded font-mono">
                          Resolve
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs font-mono text-green-400">OPERATIONAL</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Active Incidents */}
        {activeCount > 0 && (
          <div>
            <h2 className="text-sm font-mono font-bold text-slate-400 uppercase tracking-widest mb-3">Active Incidents</h2>
            <div className="space-y-3">
              {outages.map(o => {
                const cfg = severityConfig[o.severity];
                return (
                  <div key={o.id} className={`p-4 rounded-lg border ${cfg.bg}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className={`text-xs font-mono font-bold ${cfg.color} mb-1`}>{o.component} — {cfg.label.toUpperCase()}</div>
                        <div className="text-white font-mono text-sm font-bold">{o.title}</div>
                        {o.description && <div className="text-slate-400 text-xs mt-1">{o.description}</div>}
                        <div className="text-slate-500 text-xs mt-2 font-mono">Reported by {o.reported_by} · {new Date(o.created_date).toLocaleString()}</div>
                      </div>
                      {user?.role === 'admin' && (
                        <button onClick={() => handleResolve(o.id)} className="ml-4 text-xs px-3 py-1.5 bg-green-800 hover:bg-green-700 text-green-300 rounded font-mono flex-shrink-0">
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Report Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-mono font-bold text-white">Report System Issue</h3>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-mono text-slate-400 mb-1 block">Component</label>
                  <select value={form.component} onChange={e => setForm(f => ({...f, component: e.target.value}))}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm">
                    {COMPONENTS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono text-slate-400 mb-1 block">Severity</label>
                  <select value={form.severity} onChange={e => setForm(f => ({...f, severity: e.target.value}))}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm">
                    <option value="outage">Outage</option>
                    <option value="degraded">Degraded</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono text-slate-400 mb-1 block">Title</label>
                  <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                    placeholder="Brief description..."
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-mono text-slate-400 mb-1 block">Details (optional)</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
                    rows={3} placeholder="Additional details..."
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white font-mono text-sm resize-none" />
                </div>
                <button onClick={handleReport} className="w-full py-2 bg-red-700 hover:bg-red-600 text-white font-mono font-bold rounded">
                  Submit Report
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
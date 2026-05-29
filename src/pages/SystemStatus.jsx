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

const SEV_CFG = {
    outage:      { label: 'OUTAGE',      color: 'text-red-400',    bar: 'bg-red-500',    row: 'bg-red-950/30 border-l-red-500',    badge: 'bg-red-900/50 text-red-300 border-red-700' },
    degraded:    { label: 'DEGRADED',    color: 'text-yellow-400', bar: 'bg-yellow-500', row: 'bg-yellow-950/20 border-l-yellow-500', badge: 'bg-yellow-900/50 text-yellow-300 border-yellow-700' },
    maintenance: { label: 'MAINTENANCE', color: 'text-blue-400',   bar: 'bg-blue-500',   row: 'bg-blue-950/20 border-l-blue-500',  badge: 'bg-blue-900/50 text-blue-300 border-blue-700' },
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
            const [all, me] = await Promise.all([base44.entities.SystemOutage.filter({ resolved_at: null }), base44.auth.me()]);
            setOutages(all);
            setUser(me);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const componentStatus = (comp) => outages.find(o => o.component === comp && !o.resolved_at) || null;

    const handleReport = async () => {
        if (!form.title.trim()) return;
        await base44.entities.SystemOutage.create({ ...form, reported_by: user?.email });
        try {
            const allUsers = await base44.entities.User.list();
            await Promise.all(allUsers.filter(u => u.role === 'admin' && u.email).map(admin =>
                base44.integrations.Core.SendEmail({ to: admin.email, subject: `[BPS CAD] System Issue: ${form.component}`, body: `Component: ${form.component}\nSeverity: ${form.severity.toUpperCase()}\nTitle: ${form.title}\n${form.description ? `Details: ${form.description}\n` : ''}\nReported by: ${user?.email}` })
            ));
        } catch {}
        setShowForm(false);
        setForm({ component: COMPONENTS[0], severity: 'outage', title: '', description: '' });
        load();
    };

    const handleResolve = async (id) => {
        await base44.entities.SystemOutage.update(id, { resolved_at: new Date().toISOString(), resolved_by: user?.email });
        load();
    };

    const activeCount = outages.length;
    const allOperational = activeCount === 0;

    return (
        <div className="bg-slate-950 min-h-full flex flex-col font-mono">
            {/* Header */}
            <div className={`flex-none border-b-2 px-4 py-2 flex items-center gap-3 ${allOperational ? 'bg-slate-900 border-green-600/50' : 'bg-slate-900 border-red-600/50'}`}>
                <div className={`w-1 h-6 rounded-sm ${allOperational ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-white font-bold text-sm tracking-widest">SYSTEM STATUS</span>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold ml-2 ${allOperational ? 'bg-green-900/30 border-green-700/50 text-green-300' : 'bg-red-900/30 border-red-700/50 text-red-300 animate-pulse'}`}>
                    {allOperational ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {allOperational ? 'ALL SYSTEMS OPERATIONAL' : `${activeCount} ACTIVE INCIDENT${activeCount > 1 ? 'S' : ''}`}
                </div>
                <div className="flex-1" />
                <button onClick={load} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-white hover:border-gold transition-all text-[10px]">
                    <RefreshCw className="w-3 h-3" />REFRESH
                </button>
                {user?.role === 'admin' && (
                    <button onClick={() => setShowForm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-700 border border-red-700 rounded text-white font-bold text-[10px] transition-colors">
                        <Plus className="w-3 h-3" />REPORT ISSUE
                    </button>
                )}
            </div>

            {/* Component Grid */}
            <div className="flex-1 p-4">
                <div className="mb-3">
                    <span className="text-[9px] text-slate-500 tracking-widest">COMPONENT STATUS BOARD</span>
                </div>

                {/* Column headers */}
                <div className="flex items-center bg-slate-800 border border-slate-700 px-4 py-1.5 mb-1 text-[9px] text-slate-500 tracking-widest rounded-t">
                    <div className="flex-1">COMPONENT</div>
                    <div className="w-32 text-right">STATUS</div>
                    <div className="w-32 text-right">ACTION</div>
                </div>

                <div className="border border-slate-800 rounded-b overflow-hidden mb-6">
                    {COMPONENTS.map((comp, idx) => {
                        const issue = componentStatus(comp);
                        const cfg = issue ? SEV_CFG[issue.severity] : null;
                        return (
                            <div key={comp} className={`flex items-center px-4 py-3 border-b last:border-b-0 border-slate-800 ${issue ? `${cfg.row} border-l-2` : 'bg-slate-900 hover:bg-slate-800/50 border-l-2 border-l-transparent'} ${idx % 2 === 0 && !issue ? 'bg-slate-900' : !issue ? 'bg-slate-900/50' : ''}`}>
                                <div className="flex items-center gap-3 flex-1">
                                    {issue ? (
                                        <XCircle className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                                    ) : (
                                        <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-500" />
                                    )}
                                    <span className="text-white text-[11px] font-bold">{comp}</span>
                                    {issue && <span className="text-[9px] text-slate-500">{issue.title}</span>}
                                </div>
                                <div className="w-32 text-right">
                                    {issue ? (
                                        <span className={`text-[9px] px-2 py-1 rounded border font-bold ${cfg.badge}`}>{cfg.label}</span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-green-400">OPERATIONAL</span>
                                    )}
                                </div>
                                <div className="w-32 text-right">
                                    {issue && user?.role === 'admin' && (
                                        <button onClick={() => handleResolve(issue.id)}
                                            className="text-[9px] px-2.5 py-1 bg-green-900/40 border border-green-700/50 hover:bg-green-800/60 text-green-300 rounded transition-colors">
                                            MARK RESOLVED
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Active Incidents Detail */}
                {activeCount > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1 h-4 bg-red-500 rounded-sm" />
                            <span className="text-[10px] text-red-400 font-bold tracking-widest">ACTIVE INCIDENT DETAILS</span>
                        </div>
                        <div className="space-y-2">
                            {outages.map(o => {
                                const cfg = SEV_CFG[o.severity];
                                return (
                                    <div key={o.id} className={`border ${cfg.badge} rounded p-3 border-l-2 ${cfg.row}`}>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className={`text-[9px] font-bold ${cfg.color} tracking-widest mb-1`}>{o.component} — {cfg.label}</div>
                                                <div className="text-white text-sm font-bold">{o.title}</div>
                                                {o.description && <div className="text-slate-400 text-[10px] mt-1">{o.description}</div>}
                                                <div className="text-slate-600 text-[9px] mt-2">RPT: {o.reported_by} · {new Date(o.created_date).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                            </div>
                                            {user?.role === 'admin' && (
                                                <button onClick={() => handleResolve(o.id)}
                                                    className="ml-4 flex-shrink-0 text-[9px] px-3 py-1.5 bg-green-900/40 border border-green-700/50 hover:bg-green-800/60 text-green-300 rounded font-bold transition-colors">
                                                    RESOLVE
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {/* Report Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-red-800/60 rounded w-full max-w-md">
                        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800 bg-red-950/30">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-5 bg-red-500 rounded-sm" />
                                <span className="font-mono font-bold text-sm text-white tracking-widest">REPORT SYSTEM ISSUE</span>
                            </div>
                            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { label: 'COMPONENT', el: <select value={form.component} onChange={e => setForm(f => ({...f, component: e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white font-mono text-[10px] focus:outline-none focus:border-gold">{COMPONENTS.map(c => <option key={c}>{c}</option>)}</select> },
                                { label: 'SEVERITY', el: <select value={form.severity} onChange={e => setForm(f => ({...f, severity: e.target.value}))} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white font-mono text-[10px] focus:outline-none focus:border-gold"><option value="outage">OUTAGE</option><option value="degraded">DEGRADED</option><option value="maintenance">MAINTENANCE</option></select> },
                                { label: 'TITLE', el: <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Brief description..." className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white font-mono text-[10px] focus:outline-none focus:border-gold" /> },
                                { label: 'DETAILS (OPTIONAL)', el: <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={3} placeholder="Additional details..." className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white font-mono text-[10px] resize-none focus:outline-none focus:border-gold" /> },
                            ].map(({ label, el }) => (
                                <div key={label}><label className="text-[9px] font-mono text-slate-500 tracking-widest mb-1 block">{label}</label>{el}</div>
                            ))}
                            <button onClick={handleReport} className="w-full py-2 bg-red-700 hover:bg-red-600 text-white font-mono font-bold rounded text-sm transition-colors">
                                SUBMIT REPORT
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
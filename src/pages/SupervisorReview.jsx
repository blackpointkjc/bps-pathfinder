import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ClipboardList, Users, Radio, AlertTriangle, Clock, Search } from 'lucide-react';

const STATUS_COLOR = {
  'New':               'text-slate-400',
  'Pending Dispatch':  'text-yellow-400',
  'Dispatched':        'text-blue-400',
  'Enroute':           'text-blue-300',
  'On Scene':           'text-yellow-300',
  'Backup Requested':  'text-red-400 font-bold',
  'Report Taken':      'text-purple-400',
  'Cleared':           'text-green-400',
  'Cancelled':         'text-slate-500',
};

const PRIORITY_BADGE = {
  critical: 'bg-red-900 text-red-300 border-red-500',
  high:     'bg-orange-900 text-orange-300 border-orange-500',
  medium:   'bg-yellow-900/50 text-yellow-300 border-yellow-600',
  low:      'bg-slate-800 text-slate-400 border-slate-600',
};

const UNIT_STATUS_DOT = {
  'Available':      'bg-green-400',
  'On Scene':       'bg-yellow-400',
  'Enroute':       'bg-blue-400',
  'Dispatched':     'bg-blue-500',
  'Busy':           'bg-orange-400',
  'Out of Service': 'bg-red-400',
};

export default function SupervisorReview() {
  const [calls, setCalls]     = useState([]);
  const [units, setUnits]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [prioFilter, setPrio] = useState('all');
  const [noteModal, setNoteModal] = useState(null);
  const [noteText, setNoteText]   = useState('');
  const [user, setUser]           = useState(null);
  const [lastRefresh, setRefresh] = useState(new Date());

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    setLoading(true);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const [callData, unitData] = await Promise.all([
      base44.entities.DispatchCall.list('-time_received', 500),
      base44.entities.Unit.list(),
    ]);
    setCalls((callData || []).filter(c => c.time_received && new Date(c.time_received).getTime() >= oneHourAgo));
    setUnits(unitData || []);
    setRefresh(new Date());
    setLoading(false);
  };

  const addSupervisorNote = async () => {
    if (!noteText.trim() || !noteModal) return;
    await base44.entities.CallNote.create({
      call_id: noteModal.id,
      author_id: user?.id,
      author_name: `[SUPERVISOR] ${user?.full_name || 'Supervisor'}`,
      note: noteText.trim(),
      note_type: 'update',
    });
    setNoteModal(null);
    setNoteText('');
  };

  const filtered = calls.filter(c => {
    if (prioFilter !== 'all' && c.priority !== prioFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [c.incident, c.location, c.agency, c.call_id, c.status].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  // Stats
  const active      = calls.filter(c => !['Cleared', 'Cancelled', 'Closed'].includes(c.status)).length;
  const critical    = calls.filter(c => c.priority === 'critical').length;
  const backup      = calls.filter(c => c.status === 'Backup Requested').length;
  const avail       = units.filter(u => u.status === 'Available').length;

  const stats = [
    { label: 'ACTIVE CALLS',    value: active,   color: 'text-white',      icon: Radio },
    { label: 'CRITICAL',        value: critical, color: 'text-red-400',    icon: AlertTriangle },
    { label: 'BACKUP REQUESTED',value: backup,   color: 'text-red-300',    icon: AlertTriangle },
    { label: 'UNITS AVAILABLE', value: avail,    color: 'text-green-400',  icon: Users },
    { label: 'TOTAL UNITS',     value: units.length, color: 'text-slate-300', icon: Users },
    { label: 'CALLS THIS HOUR', value: calls.length, color: 'text-gold',   icon: Clock },
  ];

  const etTime = lastRefresh.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true });

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-slate-800 px-6 py-3 flex items-center gap-4">
        <ClipboardList className="w-5 h-5 text-gold flex-shrink-0" />
        <div>
          <h1 className="text-sm font-black font-mono tracking-widest">SUPERVISOR REVIEW</h1>
          <p className="text-[9px] text-slate-500 font-mono">Last refresh: {etTime} ET</p>
        </div>
        <div className="flex-1" />
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search calls..."
            className="pl-8 pr-4 h-8 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-gold w-52" />
        </div>
        <div className="flex gap-1">
          {['all', 'critical', 'high', 'medium', 'low'].map(p => (
            <button key={p} onClick={() => setPrio(p)}
              className={`px-2 h-7 text-[10px] font-mono rounded border transition-colors ${prioFilter === p ? 'bg-gold/20 text-gold border-gold/50' : 'text-slate-400 border-slate-700 hover:border-slate-500'}`}>
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={load} className="h-7 px-3 text-[10px] font-mono border border-slate-700 rounded text-slate-400 hover:text-white hover:border-slate-500 transition-colors flex-shrink-0">
          REFRESH
        </button>
      </div>

      {/* Stats row */}
      <div className="flex-none border-b border-slate-800 px-6 py-3 grid grid-cols-3 md:grid-cols-6 gap-3">
        {stats.map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-[9px] font-mono text-slate-500 tracking-widest">{label}</span>
            </div>
            <span className={`text-2xl font-black font-mono ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Main split */}
      <div className="flex-1 overflow-hidden flex gap-0">
        {/* Calls Table */}
        <div className="flex-1 overflow-auto border-r border-slate-800">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="w-5 h-5 border-2 border-slate-600 border-t-gold rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
                <tr>
                  {['TIME', 'PRIORITY', 'INCIDENT', 'LOCATION', 'AGENCY', 'STATUS', 'UNITS', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] text-slate-500 tracking-widest font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const t = c.time_received ? new Date(c.time_received).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true, hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <tr key={c.id} className={`border-b border-slate-900 hover:bg-slate-900/60 transition-colors ${i % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/30'} ${c.status === 'Backup Requested' ? 'bg-red-950/30' : ''}`}>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{t}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${PRIORITY_BADGE[c.priority] || PRIORITY_BADGE.medium}`}>
                          {(c.priority || 'med').slice(0,4).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-white font-bold max-w-[180px] truncate">{c.incident}</td>
                      <td className="px-3 py-2 text-slate-300 max-w-[180px] truncate">{c.location}</td>
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{c.agency || '—'}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${STATUS_COLOR[c.status] || 'text-slate-400'}`}>{c.status || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 max-w-[80px] truncate">{(c.assigned_units || []).join(', ') || '—'}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => { setNoteModal(c); setNoteText(''); }}
                          className="px-2 py-0.5 text-[9px] font-mono border border-slate-700 rounded text-slate-400 hover:text-gold hover:border-gold/50 transition-colors whitespace-nowrap">
                          + NOTE
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-600">No calls match filters</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Unit Status Panel */}
        <div className="w-60 flex-shrink-0 overflow-auto bg-slate-900/50">
          <div className="px-4 py-3 border-b border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 tracking-widest font-bold">UNIT STATUS BOARD</span>
          </div>
          <div className="divide-y divide-slate-800">
            {units.map(u => (
              <div key={u.id} className="px-4 py-2.5 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${UNIT_STATUS_DOT[u.status] || 'bg-slate-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono font-bold text-white truncate">{u.label}</p>
                  <p className="text-[9px] font-mono text-slate-500 truncate">{u.status}</p>
                </div>
              </div>
            ))}
            {units.length === 0 && (
              <div className="px-4 py-6 text-center text-slate-600 text-xs font-mono">No units configured</div>
            )}
          </div>
        </div>
      </div>

      {/* Add Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="font-mono font-bold text-gold tracking-widest text-sm">ADD SUPERVISOR NOTE</h2>
            <div className="bg-slate-800/60 rounded p-3 font-mono text-xs text-slate-300">
              <p className="font-bold text-white">{noteModal.incident}</p>
              <p className="text-slate-400">{noteModal.location}</p>
            </div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4}
              placeholder="Supervisor note..."
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-gold resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-sm font-mono text-slate-400 hover:text-white transition-colors">CANCEL</button>
              <button onClick={addSupervisorNote} disabled={!noteText.trim()}
                className="px-5 py-2 bg-gold/20 hover:bg-gold/30 text-gold text-sm font-mono font-bold rounded border border-gold/50 disabled:opacity-40 transition-colors">
                ADD NOTE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
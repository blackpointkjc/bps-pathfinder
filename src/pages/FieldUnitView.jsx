import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Radio, MapPin, AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react';

const STATUS_BTNS = [
  { value: 'Available',      label: 'AVAILABLE',       cls: 'bg-green-800 border-green-500 text-green-200 hover:bg-green-700' },
  { value: 'Dispatched',     label: 'DISPATCHED',      cls: 'bg-blue-800 border-blue-500 text-blue-200 hover:bg-blue-700' },
  { value: 'Enroute',       label: 'EN ROUTE',        cls: 'bg-blue-900 border-blue-400 text-blue-200 hover:bg-blue-800' },
  { value: 'On Scene',       label: 'ON SCENE',        cls: 'bg-yellow-800 border-yellow-500 text-yellow-200 hover:bg-yellow-700' },
  { value: 'Busy',           label: 'BUSY',            cls: 'bg-orange-900 border-orange-500 text-orange-200 hover:bg-orange-800' },
  { value: 'Out of Service', label: 'OUT OF SERVICE',  cls: 'bg-red-900 border-red-500 text-red-200 hover:bg-red-800' },
];

const PRIORITY_BADGE = {
  critical: 'bg-red-900 text-red-300 border-red-500',
  high:     'bg-orange-900 text-orange-300 border-orange-500',
  medium:   'bg-yellow-900 text-yellow-300 border-yellow-500',
  low:      'bg-slate-700 text-slate-300 border-slate-600',
};

export default function FieldUnitView() {
  const [user, setUser]           = useState(null);
  const [myUnit, setMyUnit]       = useState(null);
  const [assignedCalls, setCalls] = useState([]);
  const [allCalls, setAllCalls]   = useState([]);
  const [noteText, setNote]       = useState('');
  const [selectedCall, setSelected] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [noteAdded, setNoteAdded] = useState(false);
  const [clock, setClock]         = useState(new Date());

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const init = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const units = await base44.entities.Unit.filter({ user_id: me.id });
      if (units?.length) setMyUnit(units[0]);
      const calls = await base44.entities.DispatchCall.list('-time_received', 100);
      const all = calls || [];
      setAllCalls(all);
      const mine = all.filter(c =>
        c.assigned_units?.includes(units?.[0]?.unit_id) ||
        c.assigned_units?.includes(me.id) ||
        c.status === 'Dispatched' || c.status === 'Enroute' || c.status === 'On Scene'
      );
      setCalls(mine);
      if (mine.length) setSelected(mine[0]);
    };
    init().catch(() => {});
  }, []);

  const updateUnitStatus = async (status) => {
    setSaving(true);
    try {
      let unit = myUnit;
      // Auto-create a Unit record for this user if none exists yet
      if (!unit) {
        const unitId = `U-${user?.id?.slice(-6) || 'XXXXXX'}`;
        unit = await base44.entities.Unit.create({
          unit_id: unitId,
          label: `Unit ${user?.unit_number || user?.full_name?.split(' ')[0] || 'Field'}`,
          status,
          user_id: user?.id,
          last_update_at: new Date().toISOString(),
        });
      } else {
        await base44.entities.Unit.update(unit.id, { status, last_update_at: new Date().toISOString() });
      }
      setMyUnit({ ...unit, status });
    } catch (e) {
      console.error('[FieldUnit] status update failed:', e?.message);
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!noteText.trim() || !selectedCall) return;
    setSaving(true);
    await base44.entities.CallNote.create({
      call_id: selectedCall.id,
      author_id: user?.id,
      author_name: user?.full_name || 'Field Unit',
      note: `[FIELD] ${noteText.trim()}`,
      note_type: 'update',
    });
    setNote('');
    setNoteAdded(true);
    setTimeout(() => setNoteAdded(false), 2000);
    setSaving(false);
  };

  const requestBackup = async () => {
    if (!selectedCall || !user) return;
    await base44.entities.CallNote.create({
      call_id: selectedCall.id,
      author_id: user.id,
      author_name: user.full_name || 'Field Unit',
      note: `🚨 BACKUP REQUESTED by ${myUnit?.label || user.full_name} at ${clock.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`,
      note_type: 'hazard',
    });
    await updateUnitStatus('Busy');
  };

  const updateCallStatus = async (newStatus) => {
    if (!selectedCall) return;
    await base44.entities.DispatchCall.update(selectedCall.id, { status: newStatus });
    setSelected(c => ({ ...c, status: newStatus }));
  };

  const etClock = clock.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true });
  const etDate  = clock.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="min-h-full bg-slate-950 text-white flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex-none border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <Radio className="w-5 h-5 text-gold" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black font-mono tracking-widest text-gold">FIELD UNIT CONSOLE</h1>
          <p className="text-[9px] text-slate-500 font-mono truncate">{user?.full_name} {myUnit ? `· ${myUnit.label}` : ''}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-base font-mono font-bold text-white tabular-nums">{etClock}</div>
          <div className="text-[9px] font-mono text-slate-500">{etDate} ET</div>
        </div>
      </div>

      {/* Unit Status */}
      <div className="flex-none border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono text-slate-400 tracking-widest">MY STATUS</span>
          {myUnit && (
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${myUnit.status === 'Available' ? 'text-green-300 border-green-500 bg-green-900/40' : myUnit.status === 'On Scene' ? 'text-yellow-300 border-yellow-500 bg-yellow-900/40' : 'text-blue-300 border-blue-500 bg-blue-900/40'}`}>
              {myUnit.status || 'UNKNOWN'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {STATUS_BTNS.map(s => (
            <button key={s.value} onClick={() => updateUnitStatus(s.value)} disabled={saving}
              className={`py-2 text-[10px] font-mono font-bold rounded border transition-all ${myUnit?.status === s.value ? s.cls + ' ring-1 ring-white/30' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Assigned Calls */}
      <div className="flex-none border-b border-slate-800 px-4 py-3">
        <span className="text-[10px] font-mono text-slate-400 tracking-widest block mb-2">ASSIGNED CALLS ({assignedCalls.length})</span>
        {assignedCalls.length === 0 ? (
          <p className="text-slate-600 text-xs font-mono">No calls currently assigned</p>
        ) : (
          <div className="space-y-1.5">
            {assignedCalls.slice(0, 5).map(c => (
              <button key={c.id} onClick={() => setSelected(c)}
                className={`w-full text-left p-2.5 rounded border transition-all ${selectedCall?.id === c.id ? 'bg-gold/10 border-gold/40' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`}>
                <div className="flex items-center gap-2 justify-between">
                  <span className="font-mono text-xs font-bold text-white truncate">{c.incident}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_BADGE[c.priority] || PRIORITY_BADGE.medium}`}>{(c.priority || 'med').toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5 text-slate-500" />
                  <span className="text-[10px] font-mono text-slate-400 truncate">{c.location}</span>
                </div>
                <span className="text-[9px] font-mono text-slate-500">{c.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Call Detail */}
      {selectedCall && (
        <div className="flex-none border-b border-slate-800 px-4 py-3 space-y-3">
          <span className="text-[10px] font-mono text-slate-400 tracking-widest">ACTIVE CALL DETAIL</span>
          <div className="bg-slate-900 border border-slate-700 rounded p-3 space-y-2">
            <div className="flex items-center gap-2 justify-between flex-wrap">
              <span className="font-mono font-bold text-sm text-white">{selectedCall.incident}</span>
              <span className="text-[9px] font-mono text-slate-400 border border-slate-700 px-2 py-0.5 rounded">{selectedCall.status}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs font-mono text-slate-300">{selectedCall.location}{selectedCall.cross_street ? ` × ${selectedCall.cross_street}` : ''}</span>
            </div>
            {selectedCall.description && <p className="text-xs font-mono text-slate-400 leading-relaxed">{selectedCall.description}</p>}
            {selectedCall.agency && <p className="text-xs font-mono"><span className="text-slate-500">AGENCY: </span><span className="text-slate-300">{selectedCall.agency}</span></p>}
          </div>

          {/* Call Status Actions */}
          <div className="grid grid-cols-3 gap-1.5">
            {[['Enroute','Enroute','blue'], ['On Scene','On Scene','yellow'], ['Cleared','Cleared','green']].map(([label, status, color]) => (
              <button key={status} onClick={() => updateCallStatus(status)}
                className={`py-2 text-[10px] font-mono font-bold rounded border transition-colors
                  ${color === 'blue' ? 'bg-blue-900/50 border-blue-600 text-blue-300 hover:bg-blue-900' :
                    color === 'yellow' ? 'bg-yellow-900/50 border-yellow-600 text-yellow-300 hover:bg-yellow-900' :
                    'bg-green-900/50 border-green-600 text-green-300 hover:bg-green-900'}`}>
                {label.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Backup Button */}
          <button onClick={requestBackup}
            className="w-full py-3 bg-red-800 hover:bg-red-700 border border-red-500 rounded font-mono text-xs font-black text-red-200 tracking-widest flex items-center justify-center gap-2 transition-colors">
            <AlertTriangle className="w-4 h-4" /> 🚨 REQUEST BACKUP
          </button>
        </div>
      )}

      {/* Add Note */}
      <div className="flex-none px-4 py-3">
        <span className="text-[10px] font-mono text-slate-400 tracking-widest block mb-2">ADD FIELD NOTE</span>
        <div className="flex gap-2">
          <textarea value={noteText} onChange={e => setNote(e.target.value)}
            placeholder="Enter note or update..."
            rows={2}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-gold resize-none" />
          <button onClick={addNote} disabled={saving || !noteText.trim() || !selectedCall}
            className={`px-3 py-2 rounded border text-xs font-mono font-bold flex-shrink-0 transition-colors ${noteAdded ? 'bg-green-800 border-green-600 text-green-200' : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 disabled:opacity-40'}`}>
            {noteAdded ? <CheckCircle className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
          </button>
        </div>
        {!selectedCall && assignedCalls.length === 0 && (
          <p className="text-[10px] font-mono text-slate-600 mt-1">Select a call to add a note</p>
        )}
      </div>

      {/* All active calls (read only browse) */}
      <div className="flex-1 px-4 py-3 border-t border-slate-800">
        <span className="text-[10px] font-mono text-slate-400 tracking-widest block mb-2">ALL ACTIVE CALLS ({allCalls.length})</span>
        <div className="space-y-1">
          {allCalls.slice(0, 20).map(c => (
            <div key={c.id} onClick={() => setSelected(c)}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-800/60 transition-colors">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.priority === 'critical' ? 'bg-red-400' : c.priority === 'high' ? 'bg-orange-400' : 'bg-slate-500'}`} />
              <span className="text-[10px] font-mono text-slate-300 truncate flex-1">{c.incident}</span>
              <span className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">{c.location}</span>
              <span className="text-[9px] font-mono text-slate-600 flex-shrink-0">{c.agency}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MapPin, AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react';

const STATUS_BTNS = [
  { value: 'Enroute', label: 'EN ROUTE', cls: 'bg-blue-900/50 border-blue-600 text-blue-300 hover:bg-blue-900' },
  { value: 'On Scene', label: 'ON SCENE', cls: 'bg-yellow-900/50 border-yellow-600 text-yellow-300 hover:bg-yellow-900' },
  { value: 'Cleared', label: 'CLEARED', cls: 'bg-green-900/50 border-green-600 text-green-300 hover:bg-green-900' },
];

const PRIORITY_BADGE = {
  critical: 'bg-red-900 text-red-300 border-red-500',
  high: 'bg-orange-900 text-orange-300 border-orange-500',
  medium: 'bg-yellow-900 text-yellow-300 border-yellow-500',
  low: 'bg-slate-700 text-slate-300 border-slate-600',
};

export default function FieldCallActions({ call, onStatusChange }) {
  const [user, setUser] = useState(null);
  const [myUnit, setMyUnit] = useState(null);
  const [noteText, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteAdded, setNoteAdded] = useState(false);
  const [status, setStatus] = useState(call?.status);

  useEffect(() => {
    const init = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const units = await base44.entities.Unit.filter({ user_id: me.id });
        if (units?.length) setMyUnit(units[0]);
      } catch (e) {}
    };
    init();
  }, []);

  useEffect(() => { setStatus(call?.status); }, [call?.id, call?.status]);

  const updateCallStatus = async (newStatus) => {
    if (!call) return;
    setSaving(true);
    try {
      await base44.entities.DispatchCall.update(call.id, { status: newStatus });
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    } catch (e) {
      console.error('[FieldCall] status update failed:', e?.message);
    } finally { setSaving(false); }
  };

  const requestBackup = async () => {
    if (!call || !user) return;
    setSaving(true);
    try {
      await base44.entities.CallNote.create({
        call_id: call.id,
        author_id: user.id,
        author_name: user.full_name || 'Field Unit',
        note: `🚨 BACKUP REQUESTED by ${myUnit?.label || user.full_name} at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`,
        note_type: 'hazard',
      });
    } catch (e) {}
    setSaving(false);
  };

  const addNote = async () => {
    if (!noteText.trim() || !call) return;
    setSaving(true);
    try {
      await base44.entities.CallNote.create({
        call_id: call.id,
        author_id: user?.id,
        author_name: user?.full_name || 'Field Unit',
        note: `[FIELD] ${noteText.trim()}`,
        note_type: 'update',
      });
      setNote('');
      setNoteAdded(true);
      setTimeout(() => setNoteAdded(false), 2000);
    } catch (e) {}
    setSaving(false);
  };

  if (!call) return null;

  return (
    <div className="space-y-3">
      <div className="bg-slate-900 border border-slate-700 rounded p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono font-bold text-sm text-white truncate">{call.incident}</span>
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_BADGE[call.priority] || PRIORITY_BADGE.medium}`}>{(call.priority || 'med').toUpperCase()}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
          <span className="text-xs font-mono text-slate-300">{call.location}{call.cross_street ? ` × ${call.cross_street}` : ''}</span>
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
          <span>STATUS: <span className="text-slate-300">{status || call.status}</span></span>
          {call.agency && <span>AGENCY: <span className="text-slate-300">{call.agency}</span></span>}
        </div>
      </div>

      <div>
        <div className="text-[9px] font-mono text-slate-400 tracking-widest mb-1.5">UPDATE CALL STATUS</div>
        <div className="grid grid-cols-3 gap-1.5">
          {STATUS_BTNS.map(s => (
            <button key={s.value} onClick={() => updateCallStatus(s.value)} disabled={saving}
              className={`py-2 text-[10px] font-mono font-bold rounded border transition-colors ${status === s.value ? s.cls + ' ring-1 ring-white/30' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={requestBackup} disabled={saving}
        className="w-full py-2.5 bg-red-800 hover:bg-red-700 border border-red-500 rounded font-mono text-[11px] font-black text-red-200 tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
        <AlertTriangle className="w-4 h-4" /> REQUEST BACKUP
      </button>

      <div>
        <div className="text-[9px] font-mono text-slate-400 tracking-widest mb-1.5">ADD FIELD NOTE</div>
        <div className="flex gap-2">
          <textarea value={noteText} onChange={e => setNote(e.target.value)} placeholder="Enter note or update..." rows={2}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-gold resize-none" />
          <button onClick={addNote} disabled={saving || !noteText.trim()}
            className={`px-3 rounded border text-xs font-mono font-bold flex-shrink-0 transition-colors ${noteAdded ? 'bg-green-800 border-green-600 text-green-200' : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 disabled:opacity-40'}`}>
            {noteAdded ? <CheckCircle className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
import { Trash2, MapPin, Clock, Users } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatEasternDateTime } from '@/lib/easternTime';

const ROLE_BADGE = {
  primary: 'bg-blue-900/50 text-blue-200 border-blue-700/50',
  backup: 'bg-slate-700 text-slate-200 border-slate-600',
};

export default function DispatchLogEntry({ entry, index, onNotesChange, onRemove, readOnly = false }) {
  if (!entry) return null;
  const assigned = Array.isArray(entry.assigned_units) ? entry.assigned_units : [];
  return (
    <div className="rounded-lg border border-slate-700 bg-[#0d1825] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-blue-900/50 px-2 py-0.5 font-mono text-xs font-bold text-blue-200">
              {entry.call_number || 'NO CAD #'}
            </span>
            {entry.call_status && (
              <span className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                {entry.call_status}
              </span>
            )}
          </div>
          <div className="mt-1 font-bold text-slate-100">{entry.incident_type || 'Incident pending'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.location || 'Location pending'}</span>
            {entry.time_received && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatEasternDateTime(entry.time_received)}</span>
            )}
          </div>
        </div>
        {!readOnly && (
          <button type="button" onClick={() => onRemove(index)} className="flex h-8 w-8 items-center justify-center rounded text-red-400 hover:bg-red-950/40" aria-label="Remove call">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <Users className="h-3 w-3" />Assigned / Dispatched
        </div>
        {assigned.length === 0 ? (
          <span className="text-xs text-slate-500">No units assigned at time of log.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assigned.map((u, i) => (
              <span key={`${u.unit_id || i}-${i}`} className={`rounded border px-2 py-0.5 text-[11px] font-bold ${ROLE_BADGE[u.role] || 'bg-slate-800 text-slate-200 border-slate-600'}`}>
                {u.label || u.unit_id}
                {u.role ? ` · ${u.role}` : ''}
                {u.status ? ` · ${u.status}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        <Label className="text-xs text-slate-400">Dispatcher Notes</Label>
        <Textarea
          value={entry.notes || ''}
          onChange={(e) => onNotesChange(index, e.target.value)}
          readOnly={readOnly}
          rows={2}
          placeholder="Disposition, radio traffic, callbacks, notifications…"
          className="mt-1"
        />
      </div>
    </div>
  );
}
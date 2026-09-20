import { Checkbox } from '@/components/ui/checkbox';

const labelFor = officer => {
  const rank = String(officer?.rank || '').trim();
  const name = [officer?.first_name, officer?.last_name].filter(Boolean).join(' ').trim();
  const unit = String(officer?.unit_number || '').trim();
  return [rank, name, unit ? `Unit ${unit}` : ''].filter(Boolean).join(' · ') || officer?.email || 'Officer';
};

export default function AttachedOfficerSelector({ users = [], selectedIds = [], currentUserId = '', onChange, label = 'Attach Other Officers' }) {
  const selected = new Set((selectedIds || []).map(String));
  const officers = (users || [])
    .filter(user => user?.id && String(user.id) !== String(currentUserId || '') && !user?.termination_date && String(user?.employment_status || '').toLowerCase() !== 'terminated')
    .sort((a, b) => labelFor(a).localeCompare(labelFor(b)));

  const toggle = id => {
    const key = String(id);
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange?.([...next]);
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-3">
      <div className="text-sm font-semibold text-slate-100">{label}</div>
      <p className="mt-1 text-xs text-slate-400">Attached officers receive report credit when this report satisfies a shared DAR or incident obligation.</p>
      {officers.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No additional active officers are available.</p>
      ) : (
        <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
          {officers.map(officer => {
            const id = String(officer.id);
            return (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
                <Checkbox checked={selected.has(id)} onCheckedChange={() => toggle(id)} />
                <span className="min-w-0 truncate">{labelFor(officer)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

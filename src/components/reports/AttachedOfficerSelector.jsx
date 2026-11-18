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
        <>
          <div className="mt-2 text-xs font-semibold text-cyan-200">{selected.size} officer{selected.size === 1 ? '' : 's'} attached</div>
          <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
            {officers.map(officer => {
              const id = String(officer.id);
              const checked = selected.has(id);
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => toggle(id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition ${checked ? 'border-cyan-400 bg-cyan-950/60 text-cyan-50' : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-500'}`}
                >
                  <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                  <span className="min-w-0 flex-1 truncate">{labelFor(officer)}</span>
                  {checked && <span className="shrink-0 font-black text-cyan-300">ATTACHED</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

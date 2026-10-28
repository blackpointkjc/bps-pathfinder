import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';

function StatPill({ label, value }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
      {value} {label}
    </span>
  );
}

function ActiveBadge({ active }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
      active === false
        ? 'border-slate-600 bg-slate-800 text-slate-400'
        : 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
    }`}>
      {active === false ? 'Inactive' : 'Active'}
    </span>
  );
}

function RowActions({ record, onEdit, onToggleActive, onDelete, onAdd, addLabel }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onAdd && (
        <Button variant="outline" size="sm" onClick={() => onAdd(record)} className="h-8 whitespace-nowrap border-cyan-800 bg-cyan-950/40 px-2 text-[10px] font-bold text-cyan-200 hover:bg-cyan-900/50">
          <Plus className="mr-1 h-3 w-3" />{addLabel}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onToggleActive(record)} title={record.active === false ? 'Activate' : 'Deactivate'} className="h-8 w-8 p-0">
        {record.active === false ? <ToggleLeft className="h-4 w-4 text-slate-500" /> : <ToggleRight className="h-4 w-4 text-emerald-400" />}
      </Button>
      <Button variant="outline" size="sm" onClick={() => onEdit(record)} className="h-8 w-8 border-slate-700 p-0 text-slate-300 hover:bg-slate-800">
        <Pencil className="h-3 w-3" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => onDelete(record)} className="h-8 w-8 border-red-900 p-0 text-red-300 hover:bg-red-950/50">
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

// Region → division → substation tree with membership counts from real records.
export default function DivisionStructureTree({ regions = [], stats = {}, onEdit, onToggleActive, onDelete, onAddRegion, onAddDivision, onAddSubstation }) {
  const [collapsed, setCollapsed] = useState(new Set());

  const toggle = key => {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const values = (level, name) => stats[`${level}:${name}`] || { locations: 0, officers: 0 };

  if (!regions.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
        <p className="text-sm text-slate-400">No company structure yet. Add your first region (for example Virginia).</p>
        {onAddRegion && (
          <Button onClick={onAddRegion} className="mt-3 bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />Add Region
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {regions.map(region => {
        const regionKey = `region:${region.name}`;
        const regionOpen = !collapsed.has(regionKey);
        const regionStats = values('region', region.name);
        return (
          <div key={regionKey} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60">
            <div className="flex flex-col gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={() => toggle(regionKey)} className="shrink-0 text-slate-400 hover:text-white">
                  {regionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-black text-white">{region.name}</h3>
                    <Badge className="border border-blue-700 bg-blue-950/60 text-[10px] font-bold uppercase text-blue-200">Region</Badge>
                    <ActiveBadge active={region.record?.active} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatPill label="divisions" value={region.divisions.length} />
                    <StatPill label="locations" value={regionStats.locations} />
                    <StatPill label="personnel" value={regionStats.officers} />
                  </div>
                </div>
              </div>
              <RowActions
                record={region.record || { division_name: region.name }}
                onEdit={onEdit}
                onToggleActive={onToggleActive}
                onDelete={onDelete}
                onAdd={onAddDivision}
                addLabel="Division"
              />
            </div>

            {regionOpen && (
              <div className="space-y-2 p-2 sm:p-3">
                {region.divisions.length === 0 && (
                  <p className="px-2 py-3 text-xs text-slate-500">No divisions in {region.name} yet. Add Richmond or Tidewater.</p>
                )}
                {region.divisions.map(division => {
                  const divisionKey = `division:${region.name}:${division.name}`;
                  const divisionOpen = !collapsed.has(divisionKey);
                  const divisionStats = values('division', division.name);
                  return (
                    <div key={divisionKey} className="rounded-lg border border-slate-700 bg-slate-950/60">
                      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <button type="button" onClick={() => toggle(divisionKey)} className="shrink-0 text-slate-400 hover:text-white">
                            {divisionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate text-sm font-bold text-cyan-100">{division.name}</h4>
                              <Badge className="border border-cyan-800 bg-cyan-950/60 text-[10px] font-bold uppercase text-cyan-200">Division</Badge>
                              <ActiveBadge active={division.record?.active} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <StatPill label="substations" value={division.substations.length} />
                              <StatPill label="locations" value={divisionStats.locations} />
                              <StatPill label="personnel" value={divisionStats.officers} />
                            </div>
                          </div>
                        </div>
                        <RowActions
                          record={division.record || { division_name: division.name }}
                          onEdit={onEdit}
                          onToggleActive={onToggleActive}
                          onDelete={onDelete}
                          onAdd={onAddSubstation}
                          addLabel="Substation"
                        />
                      </div>

                      {divisionOpen && (
                        <div className="space-y-1.5 border-t border-slate-800 px-2 py-2">
                          {division.substations.length === 0 && (
                            <p className="px-2 py-2 text-xs text-slate-500">No substations in {division.name} yet.</p>
                          )}
                          {division.substations.map(substation => {
                            const substationStats = values('substation', substation.name);
                            return (
                              <div key={`substation:${division.name}:${substation.name}`} className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h5 className="truncate text-sm font-semibold text-amber-100">{substation.name}</h5>
                                    <Badge className="border border-amber-800 bg-amber-950/50 text-[10px] font-bold uppercase text-amber-200">Substation</Badge>
                                    <ActiveBadge active={substation.record?.active} />
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <StatPill label="locations" value={substationStats.locations} />
                                    <StatPill label="personnel" value={substationStats.officers} />
                                  </div>
                                </div>
                                <RowActions
                                  record={substation.record || { division_name: substation.name }}
                                  onEdit={onEdit}
                                  onToggleActive={onToggleActive}
                                  onDelete={onDelete}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
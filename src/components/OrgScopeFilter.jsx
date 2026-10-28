import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { listDirectoryDivisions } from '@/lib/appDirectory';
import { ALL_ORG, EMPTY_ORG_SCOPE, buildOrgTree } from '@/lib/orgStructure';

const SELECT_CLASS = 'h-9 w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 shadow-sm outline-none focus:border-cyan-500';

// Region → division → substation filter shared by every page that lists
// officers, locations, or operational records.
export default function OrgScopeFilter({ scope = EMPTY_ORG_SCOPE, onChange }) {
  const [divisions, setDivisions] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await listDirectoryDivisions('division_name', 1000);
        if (active && Array.isArray(rows) && rows.length) {
          setDivisions(rows);
          return;
        }
      } catch { /* fall through to a direct read */ }
      try {
        const rows = await base44.entities.Division.list('division_name', 1000);
        if (active) setDivisions(Array.isArray(rows) ? rows : []);
      } catch {
        if (active) setDivisions([]);
      }
    })();
    return () => { active = false; };
  }, []);

  const tree = useMemo(() => buildOrgTree(divisions), [divisions]);

  const regionOptions = useMemo(() => tree.map(region => region.name).filter(Boolean), [tree]);

  const divisionOptions = useMemo(() => {
    const source = scope.region && scope.region !== ALL_ORG
      ? tree.filter(region => region.name === scope.region)
      : tree;
    return source.flatMap(region => region.divisions.map(division => division.name)).filter(Boolean);
  }, [tree, scope.region]);

  const substationOptions = useMemo(() => {
    const regions = scope.region && scope.region !== ALL_ORG
      ? tree.filter(region => region.name === scope.region)
      : tree;
    return regions.flatMap(region => region.divisions
      .filter(division => !scope.division || scope.division === ALL_ORG || division.name === scope.division)
      .flatMap(division => division.substations.map(substation => substation.name)))
      .filter(Boolean);
  }, [tree, scope.region, scope.division]);

  const update = patch => onChange?.({ ...scope, ...patch });

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="min-w-0">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Region</span>
        <select
          value={scope.region || ALL_ORG}
          onChange={event => update({ region: event.target.value, division: ALL_ORG, substation: ALL_ORG })}
          className={SELECT_CLASS}
        >
          <option value={ALL_ORG}>All regions</option>
          {regionOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="min-w-0">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Division</span>
        <select
          value={scope.division || ALL_ORG}
          onChange={event => update({ division: event.target.value, substation: ALL_ORG })}
          className={SELECT_CLASS}
        >
          <option value={ALL_ORG}>All divisions</option>
          {divisionOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="min-w-0">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Substation</span>
        <select
          value={scope.substation || ALL_ORG}
          onChange={event => update({ substation: event.target.value })}
          className={SELECT_CLASS}
          disabled={substationOptions.length === 0}
        >
          <option value={ALL_ORG}>{substationOptions.length ? 'All substations' : 'No substations yet'}</option>
          {substationOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
  );
}
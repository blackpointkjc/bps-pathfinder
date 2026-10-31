import { useMemo } from 'react';
import { buildOrgTree } from '@/lib/orgStructure';

const selectorClass = 'h-10 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-500';

/** Company Structure: user/location division = region; subdivision = operating division. */
export default function OrgAssignmentFields({ divisions = [], value = {}, onChange, includeSubstation = false, disabled = false }) {
  const tree = useMemo(() => buildOrgTree((divisions || []).filter(row => row.active !== false)), [divisions]);
  const region = String(value.division || '');
  const division = String(value.subdivision || '');
  const substation = String(value.substation || '');
  const regions = tree.map(row => row.name).filter(Boolean);
  const regionRow = tree.find(row => row.name === region);
  const operatingDivisions = regionRow?.divisions.map(row => row.name) || [];
  const divisionRow = regionRow?.divisions.find(row => row.name === division);
  const substations = divisionRow?.substations.map(row => row.name) || [];
  const change = patch => onChange?.({ ...value, ...patch });
  const option = (name, choices) => name && !choices.includes(name) ? <option value={name}>{name} (current)</option> : null;

  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="min-w-0 space-y-1"><span className="block text-xs font-semibold text-slate-200">Region</span>
      <select aria-label="Officer or location region" className={selectorClass} value={region} disabled={disabled} onChange={event => change({ division: event.target.value, subdivision: '', substation: '' })}>
        <option value="">Select region</option>{option(region, regions)}
        {regions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    <label className="min-w-0 space-y-1"><span className="block text-xs font-semibold text-slate-200">Division / Operating Area</span>
      <select aria-label="Officer or location division" className={selectorClass} value={division} disabled={disabled || !region} onChange={event => change({ subdivision: event.target.value, substation: '' })}>
        <option value="">{region ? 'Select division' : 'Choose region first'}</option>{option(division, operatingDivisions)}
        {operatingDivisions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    {includeSubstation && <label className="min-w-0 space-y-1"><span className="block text-xs font-semibold text-slate-200">Substation</span>
      <select aria-label="Location substation" className={selectorClass} value={substation} disabled={disabled || !division} onChange={event => change({ substation: event.target.value })}>
        <option value="">{division ? 'No substation' : 'Choose division first'}</option>{option(substation, substations)}
        {substations.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>}
    {!regions.length && <p className="text-xs text-amber-300 sm:col-span-2 lg:col-span-3">No active regions are available. Add a region and division in Company Structure, then return here.</p>}
  </div>;
}

// Shared company structure helpers: Virginia (region) → Richmond / Tidewater
// (divisions) → substations. Every page that filters or displays organizational
// assignment uses these helpers so the hierarchy reads the same everywhere.

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

export const ORG_LEVELS = ['region', 'division', 'substation'];
export const ALL_ORG = 'all';
export const EMPTY_ORG_SCOPE = { region: ALL_ORG, division: ALL_ORG, substation: ALL_ORG };
export const ORG_SEPARATOR = ' › ';

export function indexDivisions(divisions = []) {
  const index = {};
  (divisions || []).forEach(record => {
    const name = text(record?.division_name);
    if (name) index[lower(name)] = record;
  });
  return index;
}

// A record is a region when it has no parent, a division when its parent is a
// region, and a substation when its parent is a division. Explicit
// division_level wins when it has been set.
export function divisionLevel(record, index = {}) {
  if (!record) return null;
  const explicit = lower(record.division_level);
  if (ORG_LEVELS.includes(explicit)) return explicit;
  if (record.is_subdivision !== true) return 'region';
  const parent = index[lower(record.parent_division)];
  if (parent && parent.is_subdivision !== true) return 'division';
  return 'substation';
}

export function divisionName(record) {
  return text(record?.subdivision) || text(record?.division_name);
}

function byName(a, b) {
  return text(a?.name || a?.division_name).localeCompare(text(b?.name || b?.division_name));
}

// Regions → divisions → substations. Records whose parent is missing are still
// shown (under their stated parent) so nothing silently disappears.
export function buildOrgTree(divisions = []) {
  const index = indexDivisions(divisions);
  const regions = (divisions || [])
    .filter(record => divisionLevel(record, index) === 'region')
    .map(record => ({
      name: text(record.division_name),
      record,
      divisions: [],
    }))
    .sort(byName);

  const regionByName = {};
  regions.forEach(region => { regionByName[lower(region.name)] = region; });

  const groupFor = parentName => {
    const key = lower(parentName);
    if (key && regionByName[key]) return regionByName[key];
    const label = text(parentName) || 'Unassigned region';
    if (regionByName[lower(label)]) return regionByName[lower(label)];
    const group = { name: label, record: null, divisions: [] };
    regions.push(group);
    regionByName[lower(label)] = group;
    return group;
  };

  (divisions || [])
    .filter(record => divisionLevel(record, index) === 'division')
    .forEach(record => {
      const group = groupFor(record.parent_division);
      group.divisions.push({ name: divisionName(record), record, substations: [] });
    });

  (divisions || [])
    .filter(record => divisionLevel(record, index) === 'substation')
    .forEach(record => {
      const parentName = lower(record.parent_division);
      const parent = regions
        .flatMap(region => region.divisions)
        .find(division => lower(division.name) === parentName);
      if (parent) {
        parent.substations.push({ name: divisionName(record), record });
      } else {
        groupFor(record.region || record.parent_division).divisions.push({
          name: text(record.parent_division) || divisionName(record),
          record: null,
          substations: [{ name: divisionName(record), record }],
        });
      }
    });

  regions.forEach(region => {
    region.divisions.sort(byName);
    region.divisions.forEach(division => division.substations.sort(byName));
  });

  return regions.sort(byName);
}

export function orgScopeIsEmpty(scope = {}) {
  return (!scope.region || scope.region === ALL_ORG)
    && (!scope.division || scope.division === ALL_ORG)
    && (!scope.substation || scope.substation === ALL_ORG);
}

// values: { division, subdivision, substation } from a user or location record.
export function matchesOrgScope(values = {}, scope = {}) {
  const region = text(scope.region) && scope.region !== ALL_ORG ? text(scope.region) : '';
  const division = text(scope.division) && scope.division !== ALL_ORG ? text(scope.division) : '';
  const substation = text(scope.substation) && scope.substation !== ALL_ORG ? text(scope.substation) : '';
  if (region && lower(values.division) !== lower(region)) return false;
  if (division && lower(values.subdivision) !== lower(division)) return false;
  if (substation && lower(values.substation) !== lower(substation)) return false;
  return true;
}

export function orgPathLabel(values = {}, separator = ORG_SEPARATOR) {
  return [text(values.division), text(values.subdivision), text(values.substation)]
    .filter(Boolean)
    .join(separator);
}

function assignedSiteNames(user = {}) {
  const raw = [
    user.assigned_location,
    ...(Array.isArray(user.assigned_locations) ? user.assigned_locations : []),
    ...(Array.isArray(user.assigned_sites) ? user.assigned_sites : []),
  ];
  return new Set(raw
    .filter(Boolean)
    .map(value => lower(String(value).split(':')[0]))
    .filter(Boolean));
}

// Officers carry region and division directly; their substation comes from the
// site they are assigned to, which is where the substation is recorded.
export function officerOrgContext(user = {}, locations = []) {
  const names = assignedSiteNames(user);
  const site = (locations || []).find(location => names.has(lower(location?.site_name)));
  const division = text(user.division) || text(site?.division);
  const subdivision = text(user.subdivision) || text(site?.subdivision);
  const substation = text(user.substation) || text(site?.substation);
  return { division, subdivision, substation, site_name: text(site?.site_name), path: orgPathLabel({ division, subdivision, substation }) };
}

// Role-aware personnel visibility for supervisor directories/rosters. Admin
// and Full Access retain company command access; unassigned supervisors do
// not acquire company-wide officer visibility through an empty field.
export function withinPersonnelOversightScope(viewer = {}, officer = {}) {
  const roles = new Set([viewer.role, ...(viewer.additional_roles || [])].map(lower));
  if (roles.has('admin') || roles.has('full_access')) return true;
  const platoon = text(viewer.oversight_platoon) || text(viewer.platoon);
  if (!['a','b'].includes(lower(platoon)) || lower(officer.platoon) !== lower(platoon)) return false;
  const senior = ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','lt','lt col'].includes(lower(viewer.rank));
  if (!lower(viewer.division) || !lower(viewer.subdivision)) return false;
  if (lower(viewer.division) !== lower(officer.division)
      || lower(viewer.subdivision) !== lower(officer.subdivision)) return false;
  if (senior) return true;
  return Boolean(lower(viewer.substation) && lower(viewer.substation) === lower(officer.substation));
}

export function withinSupervisorSiteScope(viewer = {}, site = {}) {
  const roles = new Set([viewer.role, ...(viewer.additional_roles || [])].map(lower));
  if (roles.has('admin') || roles.has('full_access')) return true;
  if (!['a','b'].includes(lower(viewer.oversight_platoon || viewer.platoon))) return false;
  if (!lower(viewer.division) || !lower(viewer.subdivision)) return false;
  if (lower(viewer.division) !== lower(site.division) || lower(viewer.subdivision) !== lower(site.subdivision)) return false;
  const senior = ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','lt','lt col'].includes(lower(viewer.rank));
  return senior || Boolean(lower(viewer.substation) && lower(viewer.substation) === lower(site.substation));
}

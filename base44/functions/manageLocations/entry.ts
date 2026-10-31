import { createClientFromRequest } from 'npm:@base44/sdk';
import { tomtomGeocode } from './tomtomGeocode.ts';

function rolesOf(user: any) {
  return new Set((user?.additional_roles || []).map((role: string) => String(role).toLowerCase()));
}

function finiteCoordinate(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function geocodeWithCensus(address: string) {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'BPS-Pathfinder/1.0' } });
    if (!response.ok) return null;
    const payload = await response.json();
    const match = payload?.result?.addressMatches?.[0];
    const latitude = finiteCoordinate(match?.coordinates?.y);
    const longitude = finiteCoordinate(match?.coordinates?.x);
    if (latitude === null || longitude === null) return null;
    return {
      latitude,
      longitude,
      formatted_address: match?.matchedAddress || address,
      provider: 'US Census Geocoder',
    };
  } catch {
    return null;
  }
}

async function geocodeWithPhoton(address: string) {
  try {
    const url = `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(address)}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'BPS-Pathfinder/1.0' } });
    if (!response.ok) return null;
    const payload = await response.json();
    const feature = payload?.features?.[0];
    const longitude = finiteCoordinate(feature?.geometry?.coordinates?.[0]);
    const latitude = finiteCoordinate(feature?.geometry?.coordinates?.[1]);
    if (latitude === null || longitude === null) return null;
    const properties = feature?.properties || {};
    const formatted = [
      properties.housenumber && properties.street ? `${properties.housenumber} ${properties.street}` : properties.street,
      properties.city || properties.county,
      properties.state,
      properties.postcode,
    ].filter(Boolean).join(', ');
    return {
      latitude,
      longitude,
      formatted_address: formatted || address,
      provider: 'Photon',
    };
  } catch {
    return null;
  }
}


// Stable balanced assignment, rather than random reassignments on every read.
// Tie-breaking is seeded by site ID/name for repeatable fair distribution;
// site assignments made manually are never overwritten by the auto-balancer.
const cleanOrg = (value:any) => String(value || '').trim().toLowerCase();
const siteSupervisorRanks = ['corporal','sergeant','first sergeant','lieutenant','captain','major','lt colonel','colonel'];
const officerRank = (value:any) => {
  const rank = cleanOrg(value).replace(/[.]/g, '').replace(/\s+/g, ' ');
  return rank === 'lieutenant colonel' ? 'lt colonel' : rank;
};
function stableSiteHash(value:string) {
  let hash=2166136261;
  for (const char of String(value)) hash=Math.imul(hash ^ char.charCodeAt(0),16777619);
  return hash >>> 0;
}
function eligibleSiteSupervisor(person:any, site:any) {
  const rank=officerRank(person?.rank);
  const roles = new Set((person?.additional_roles || []).map(cleanOrg));
  if (!person?.email || person.termination_date || cleanOrg(person.employment_status)==='terminated' || roles.has('client') || roles.has('student') || roles.has('pending')) return false;
  if (!siteSupervisorRanks.includes(rank)) return false;
  // Match the actual division / operating area, never another district.
  return !!cleanOrg(site.division) && !!cleanOrg(site.subdivision)
    && cleanOrg(person.division) === cleanOrg(site.division)
    && cleanOrg(person.subdivision) === cleanOrg(site.subdivision);
}
function assignSiteSupervisor(site:any, people:any[], loads:Map<string,number>) {
  const eligible=people.filter(person => eligibleSiteSupervisor(person,site));
  if (!eligible.length) return null;
  const local=site.substation
    ? eligible.filter(person => cleanOrg(person.substation) === cleanOrg(site.substation)) : [];
  // Prefer a qualified substation supervisor, then one in the same Division.
  const pool=local.length ? local : eligible;
  // Start at Corporal; distribute across qualified field supervisors before
  // escalating a site's permanent owner to senior company command.
  const fieldPool = pool.filter(person => siteSupervisorRanks.indexOf(officerRank(person.rank)) <= 2);
  const rankPool = fieldPool.length ? fieldPool : pool;
  const seed=stableSiteHash(String(site.id || site.site_name || 'site'));
  rankPool.sort((a,b)=>(loads.get(cleanOrg(a.email))||0)-(loads.get(cleanOrg(b.email))||0)
    || siteSupervisorRanks.indexOf(officerRank(a.rank))-siteSupervisorRanks.indexOf(officerRank(b.rank))
    || (stableSiteHash(String(a.id||a.email)+'|'+seed)-stableSiteHash(String(b.id||b.email)+'|'+seed)));
  const selected=rankPool[0];
  loads.set(cleanOrg(selected.email),(loads.get(cleanOrg(selected.email))||0)+1);
  return selected;
}
async function balancedSiteAssignments(base44:any, locations:any[], { updateExisting=false }={}) {
  const people=await base44.asServiceRole.entities.User.list('-last_name',1000);
  const loads=new Map<string,number>();
  const isManual=(site:any)=>Array.isArray(site.assigned_supervisors) && site.assigned_supervisors.length
    && site.site_supervisor_auto_assigned !== true;
  for (const site of locations) {
    if(site.active===false || site.is_special_event===true || !isManual(site)) continue;
    for(const email of site.assigned_supervisors) loads.set(cleanOrg(email),(loads.get(cleanOrg(email))||0)+1);
  }
  const candidates=locations.filter(site=>site.active!==false && site.is_special_event!==true
    && (!Array.isArray(site.assigned_supervisors) || site.assigned_supervisors.length===0 || (updateExisting && site.site_supervisor_auto_assigned===true)))
    .sort((a,b)=>stableSiteHash(String(a.id||a.site_name))-stableSiteHash(String(b.id||b.site_name)));
  let assigned=0, unchanged=0, unavailable=0;
  for (const site of candidates) {
    const person=assignSiteSupervisor(site,people,loads);
    if (!person) { unavailable++; continue; }
    const previous=Array.isArray(site.assigned_supervisors)?site.assigned_supervisors:[];
    if(previous.length===1 && cleanOrg(previous[0])===cleanOrg(person.email)) {unchanged++;continue;}
    await base44.asServiceRole.entities.Location.update(site.id,{assigned_supervisors:[person.email],site_supervisor_auto_assigned:true});
    assigned++;
  }
  return {assigned,unchanged,unavailable,eligible_sites:candidates.length};
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const roles = rolesOf(user);
    const authorized = (
      user.role === 'admin' ||
      roles.has('full_access') ||
      roles.has('support') ||
      roles.has('support_staff')
    );
    if (!authorized) {
      return Response.json({ error: 'Location management access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list').toLowerCase();

    if (action === 'rebalance_supervisors') {
      if (user.role !== 'admin' && !roles.has('full_access')) return Response.json({error:'Administrator approval required to rebalance site supervisors.'},{status:403});
      const locations=await base44.asServiceRole.entities.Location.list('site_name',1000);
      const result=await balancedSiteAssignments(base44,locations,{updateExisting:true});
      return Response.json({success:true,...result});
    }

    if (action === 'list') {
      const locations = await base44.asServiceRole.entities.Location.list('site_name', 1000);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const result = [];
      for (const location of locations || []) {
        let current = location;
        if (location.active && location.contract_end_date) {
          const end = new Date(location.contract_end_date);
          if (!Number.isNaN(end.getTime())) {
            end.setHours(12, 0, 0, 0);
            if (today.getTime() >= end.getTime()) {
              await base44.asServiceRole.entities.Location.update(location.id, { active: false });
              current = { ...location, active: false };
            }
          }
        }
        result.push(current);
      }
      return Response.json({ success: true, locations: result });
    }

    if (action === 'geocode') {
      const address = String(body.address || body.data?.address || '').trim();
      if (!address) {
        return Response.json({ success: false, error: 'Address is required to find coordinates' });
      }
      const candidates = [
        address,
        /\b(VA|Virginia)\b/i.test(address) ? address : `${address}, Virginia`,
        /\bRichmond\b/i.test(address) ? address : `${address}, Richmond, Virginia`,
      ].filter((value, index, values) => value && values.indexOf(value) === index);
      let result = null;
      for (const candidate of candidates) {
        result = await tomtomGeocode(candidate) || await geocodeWithCensus(candidate) || await geocodeWithPhoton(candidate);
        if (result) break;
      }
      if (!result) {
        // Geocoding is a lookup result, not a missing API route. Return HTTP 200 so
        // the Base44 client can surface this useful message instead of replacing it
        // with the generic Axios "Request failed with status code 404" error.
        return Response.json({
          success: false,
          error: 'Address could not be matched. Include the street number, street name, city, state, and ZIP code, or enter the coordinates manually.'
        });
      }
      return Response.json({ success: true, ...result });
    }

    if (action === 'create') {
      if (!body.data?.site_name) {
        return Response.json({ error: 'Site name is required' }, { status: 400 });
      }
      const createData = { ...body.data };
      if (!String(createData.address || '').trim() && createData.is_special_event === true) {
        createData.address = 'Special Event / Variable Location';
      }
      if (!String(createData.address || '').trim()) {
        return Response.json({ error: 'Address is required for a fixed location' }, { status: 400 });
      }
      const suppliedSupervisors = Array.isArray(createData.assigned_supervisors) ? createData.assigned_supervisors.filter(Boolean) : [];
      createData.site_supervisor_auto_assigned = suppliedSupervisors.length === 0;
      const location = await base44.asServiceRole.entities.Location.create(createData);
      if (suppliedSupervisors.length === 0 && createData.division && createData.subdivision) {
        const existing = await base44.asServiceRole.entities.Location.list('site_name',1000);
        await balancedSiteAssignments(base44, existing, {updateExisting:false}).catch(error => console.error('Site created; automatic supervisor selection unavailable',error));
      }
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Location',
        entity_id: location.id,
        action: 'create',
        actor_id: user.id,
        actor_name: user.full_name || user.email || 'Administrator',
        after_value: JSON.stringify(createData),
        field_changed: 'location_and_auto_dispatch_configuration',
        timestamp: new Date().toISOString(),
        description: 'Location created. Property monitoring and automatic-dispatch settings were recorded with the original configuration.',
      }).catch(() => null);
      return Response.json({ success: true, location });
    }

    if (action === 'update') {
      if (!body.id || !body.data) {
        return Response.json({ error: 'Location id and update data are required' }, { status: 400 });
      }
      const before = await base44.asServiceRole.entities.Location.get(body.id);
      const updateData = { ...body.data };
      const supplied = Object.prototype.hasOwnProperty.call(updateData,'assigned_supervisors')
        && Array.isArray(updateData.assigned_supervisors);
      if (supplied) {
        const nextSupervisors=updateData.assigned_supervisors.filter(Boolean).map(cleanOrg);
        const previousSupervisors=Array.isArray(before?.assigned_supervisors) ? before.assigned_supervisors.filter(Boolean).map(cleanOrg) : [];
        const changed=JSON.stringify(nextSupervisors)!==JSON.stringify(previousSupervisors);
        updateData.site_supervisor_auto_assigned = nextSupervisors.length === 0 || (!changed && before?.site_supervisor_auto_assigned === true);
      }
      const activatingLive = updateData.auto_dispatch_enabled === true
        && updateData.auto_dispatch_mode === 'live'
        && (before?.auto_dispatch_mode !== 'live' || before?.auto_dispatch_enabled !== true);
      if (activatingLive) {
        if (user.role !== 'admin') {
          return Response.json({ error: 'Administrator approval is required to activate live automatic dispatch' }, { status: 403 });
        }
        updateData.auto_dispatch_live_approved_at = new Date().toISOString();
        updateData.auto_dispatch_live_approved_by = user.id;
      }
      if (updateData.auto_dispatch_mode && updateData.auto_dispatch_mode !== 'live') {
        updateData.auto_dispatch_live_approved_at = null;
        updateData.auto_dispatch_live_approved_by = '';
      }
      await base44.asServiceRole.entities.Location.update(body.id, updateData);
      // Reassign only explicitly automatic or unassigned sites. Manual site
      // owners must remain untouched when someone edits billing or geofencing.
      if (updateData.site_supervisor_auto_assigned === true
          || (before?.site_supervisor_auto_assigned === true
              && ['division','subdivision','substation'].some(key => updateData[key]!==undefined && updateData[key]!==before[key]))) {
        const currentSites=await base44.asServiceRole.entities.Location.list('site_name',1000);
        await balancedSiteAssignments(base44,currentSites,{updateExisting:true}).catch(error => console.error('Location saved; supervisor rebalance needs retry',error));
      }
      const location = await base44.asServiceRole.entities.Location.get(body.id);
      const protectedFields = [
        'auto_dispatch_enabled', 'auto_dispatch_mode', 'auto_dispatch_live_approved_at',
        'auto_dispatch_live_approved_by', 'auto_dispatch_response_radius_miles',
        'auto_dispatch_required_units', 'auto_dispatch_backup_required',
        'auto_dispatch_required_qualifications', 'auto_dispatch_required_equipment',
        'auto_dispatch_required_ranks', 'auto_dispatch_acknowledgement_seconds',
        'auto_dispatch_escalation_seconds', 'auto_dispatch_recheck_seconds',
        'property_safety_warnings', 'property_access_instructions',
      ];
      const changedFields = Object.keys(updateData).filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(location?.[key]));
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Location',
        entity_id: body.id,
        action: 'update',
        actor_id: user.id,
        actor_name: user.full_name || user.email || 'Administrator',
        before_value: JSON.stringify(Object.fromEntries(changedFields.map(key => [key, before?.[key]]))),
        after_value: JSON.stringify(Object.fromEntries(changedFields.map(key => [key, location?.[key]]))),
        field_changed: changedFields.join(',').slice(0, 500),
        timestamp: new Date().toISOString(),
        description: changedFields.some(key => protectedFields.includes(key))
          ? activatingLive
            ? 'Live property automatic dispatch explicitly approved and activated by an administrator.'
            : 'Property automatic-dispatch configuration updated.'
          : 'Location configuration updated.',
      }).catch(() => null);
      return Response.json({ success: true, location });
    }

    if (action === 'delete') {
      if (!body.id) {
        return Response.json({ error: 'Location id is required' }, { status: 400 });
      }
      await base44.asServiceRole.entities.Location.delete(body.id);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unsupported location action' }, { status: 400 });
  } catch (error: any) {
    console.error('manageLocations failed', error);
    return Response.json({ error: error?.message || 'Unable to manage locations' }, { status: 500 });
  }
});

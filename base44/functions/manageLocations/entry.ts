import { createClientFromRequest } from 'npm:@base44/sdk';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const roles = rolesOf(user);
    const authorized = !!user && (
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
        return Response.json({ error: 'Address is required to find coordinates' }, { status: 400 });
      }
      const result = await geocodeWithCensus(address) || await geocodeWithPhoton(address);
      if (!result) {
        return Response.json({
          error: 'Address could not be matched. Add the city, state, and ZIP code or enter coordinates manually.'
        }, { status: 404 });
      }
      return Response.json({ success: true, ...result });
    }

    if (action === 'create') {
      if (!body.data?.site_name) {
        return Response.json({ error: 'Site name is required' }, { status: 400 });
      }
      const location = await base44.asServiceRole.entities.Location.create(body.data);
      await base44.asServiceRole.entities.AuditLog.create({
        entity_type: 'Location',
        entity_id: location.id,
        action: 'create',
        actor_id: user.id,
        actor_name: user.full_name || user.email || 'Administrator',
        after_value: JSON.stringify(body.data),
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
  } catch (error) {
    console.error('manageLocations failed', error);
    return Response.json({ error: error?.message || 'Unable to manage locations' }, { status: 500 });
  }
});

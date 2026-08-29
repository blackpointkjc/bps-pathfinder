import { createClientFromRequest } from 'npm:@base44/sdk';

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const heartbeatOnly = body.heartbeat_only === true;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude);
    if (!heartbeatOnly && !hasGps) {
      return Response.json({ error: 'Valid latitude and longitude are required' }, { status: 400 });
    }

    const receivedAt = Date.now();
    const now = new Date(receivedAt).toISOString();
    const officerEmail = String(user.email || body.officer_email || '').trim().toLowerCase();
    if (!officerEmail) return Response.json({ error: 'Officer email is required' }, { status: 400 });
    const trackingSessionKey = String(body.time_entry_id || body.clock_in_time || `login-session:${now}`);

    const records = await base44.asServiceRole.entities.ActiveOfficer.filter(
      { officer_email: officerEmail },
      '-last_update',
      100,
    );

    if (body.end_session === true) {
      const ended = [];
      for (const record of records || []) {
        ended.push(await base44.asServiceRole.entities.ActiveOfficer.update(record.id, {
          session_active: false,
          status: 'Out of Service',
          last_update: now,
          gps_updated_at: null,
          latitude: null,
          longitude: null,
          heading: null,
          speed: 0,
          accuracy: null,
          current_call_info: '',
        }).catch(() => null));
      }
      return Response.json({ success: true, session_ended: true, records_updated: ended.filter(Boolean).length });
    }

    const primary = records?.[0] || null;
    const requestedFixAt = new Date(body.device_fix_at || now).getTime();
    const deviceFixAt = Number.isFinite(requestedFixAt) && requestedFixAt <= receivedAt + 30000
      ? requestedFixAt
      : receivedAt;
    const existingFixAt = new Date(primary?.gps_updated_at || 0).getTime();
    const acceptsGps = hasGps
      && deviceFixAt >= receivedAt - 2 * 60 * 1000
      && (!Number.isFinite(existingFixAt) || deviceFixAt >= existingFixAt);

    const liveData: Record<string, unknown> = {
      officer_email: officerEmail,
      officer_name: String(user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || body.officer_name || officerEmail),
      unit_number: String(body.unit_number || user.unit_number || ''),
      current_location: String(body.current_location || user.current_location || user.assigned_location || 'Signed In'),
      clock_in_time: String(body.clock_in_time || now),
      tracking_session_key: trackingSessionKey,
      last_update: now,
      user_role: String(body.user_role || user.role || 'user'),
      session_active: true,
      show_lights: body.show_lights === true,
      current_call_info: String(body.current_call_info || user.current_call_info || ''),
    };
    if (body.reset_gps === true && !acceptsGps) {
      // A newly established app session must never inherit a recent coordinate
      // from the prior browser/login session. Keep the user signed in, but mark
      // GPS pending until this session publishes its own fresh device fix.
      liveData.gps_updated_at = null;
      liveData.latitude = null;
      liveData.longitude = null;
      liveData.heading = null;
      liveData.speed = 0;
      liveData.accuracy = null;
    } else if (acceptsGps) {
      const acceptedAccuracy = finiteNumber(body.accuracy, Number.POSITIVE_INFINITY);
      liveData.gps_updated_at = new Date(deviceFixAt).toISOString();
      liveData.latitude = latitude;
      liveData.longitude = longitude;
      liveData.heading = finiteNumber(body.heading);
      liveData.speed = finiteNumber(body.speed);
      liveData.accuracy = acceptedAccuracy;
      // Never let a later Wi-Fi/IP estimate overwrite the officer's last precise
      // tactical coordinate. Coarse fixes remain available for diagnostics only.
      if (Number.isFinite(acceptedAccuracy) && acceptedAccuracy <= 100) {
        liveData.reliable_latitude = latitude;
        liveData.reliable_longitude = longitude;
        liveData.reliable_accuracy = acceptedAccuracy;
        liveData.reliable_gps_updated_at = new Date(deviceFixAt).toISOString();
        liveData.reliable_session_key = trackingSessionKey;
      }
    }

    // Location heartbeats must never own CAD status. Only set status when the
    // caller explicitly supplies one (initial session creation) or when creating
    // a new record. When updating an existing record, do NOT include status —
    // a heartbeat that reads primary.status before updateOfficerStatus writes
    // and then writes after it creates a race that flips the officer back to
    // the old status (e.g., Out of Service) on the board.
    if (body.status) {
      liveData.status = String(body.status);
    } else if (!primary) {
      liveData.status = String(user.status || 'Signed In');
    }
    const activeOfficer = primary
      ? await base44.asServiceRole.entities.ActiveOfficer.update(primary.id, liveData)
      : await base44.asServiceRole.entities.ActiveOfficer.create(liveData);

    const duplicateIds = (records || []).slice(1).map((record: any) => record.id).filter(Boolean);
    if (duplicateIds.length) {
      await Promise.all(duplicateIds.map((id: string) =>
        base44.asServiceRole.entities.ActiveOfficer.delete(id).catch(() => null)
      ));
    }

    // Persist movement history in the authenticated backend so browser
    // background throttling and client-side RLS cannot silently stop the trail.
    // One row per officer per minute is sufficient for the map and prevents
    // multiple tabs/devices from producing a duplicate history stream.
    let historyRecorded = false;
    if (acceptsGps) {
      const latestHistory = await base44.asServiceRole.entities.LocationHistory.filter(
        { officer_email: officerEmail },
        '-timestamp',
        1,
      ).catch(() => []);
      const latestAt = new Date(latestHistory?.[0]?.timestamp || latestHistory?.[0]?.created_date || 0).getTime();
      if (!Number.isFinite(latestAt) || deviceFixAt - latestAt >= 55000) {
        await base44.asServiceRole.entities.LocationHistory.create({
          time_entry_id: String(body.time_entry_id || body.clock_in_time || `login-session:${activeOfficer.clock_in_time || now}`),
          officer_email: officerEmail,
          officer_name: String(liveData.officer_name),
          location: String(liveData.current_location),
          latitude,
          longitude,
          timestamp: new Date(deviceFixAt).toISOString(),
          accuracy: finiteNumber(body.accuracy),
        });
        historyRecorded = true;
      }
    }

    console.log(`[logLocation] activeOfficer=${activeOfficer.id} user=${user.id} heartbeat=${heartbeatOnly} gps_received=${hasGps} gps_accepted=${acceptsGps} history=${historyRecorded}`);
    return Response.json({
      success: true,
      active_officer: activeOfficer,
      latitude: acceptsGps ? latitude : null,
      longitude: acceptsGps ? longitude : null,
      gps_accepted: acceptsGps,
      gps_updated_at: acceptsGps ? new Date(deviceFixAt).toISOString() : activeOfficer.gps_updated_at || null,
      last_updated: now,
      history_recorded: historyRecorded,
    });
  } catch (error) {
    console.error('Error logging location:', error);
    return Response.json({ error: error?.message || 'Unable to update live location' }, { status: 500 });
  }
});
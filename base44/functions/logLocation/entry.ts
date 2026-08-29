import { createClientFromRequest } from 'npm:@base44/sdk';

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasCoordinates(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}

function distanceMeters(lat1: unknown, lng1: unknown, lat2: unknown, lng2: unknown) {
  if (!hasCoordinates(lat1, lng1) || !hasCoordinates(lat2, lng2)) return Infinity;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(Number(lat2) - Number(lat1));
  const dLng = toRadians(Number(lng2) - Number(lng1));
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(Number(lat1))) * Math.cos(toRadians(Number(lat2)))
    * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    }

    const acceptedAccuracy = acceptsGps ? finiteNumber(body.accuracy, 999999) : 999999;
    let acceptedForPosition = false;
    let candidateOnly = false;
    if (acceptsGps) {
      const precise = acceptedAccuracy <= 100;
      const sameReliableSession = primary?.reliable_session_key === trackingSessionKey
        && hasCoordinates(primary?.reliable_latitude, primary?.reliable_longitude);
      const jumpFromReliable = sameReliableSession
        ? distanceMeters(primary.reliable_latitude, primary.reliable_longitude, latitude, longitude)
        : 0;
      const candidateAgeMs = receivedAt - new Date(primary?.gps_candidate_updated_at || 0).getTime();
      const corroboratesCandidate = precise
        && primary?.gps_candidate_session_key === trackingSessionKey
        && candidateAgeMs >= 0
        && candidateAgeMs <= 5 * 60 * 1000
        && distanceMeters(primary?.gps_candidate_latitude, primary?.gps_candidate_longitude, latitude, longitude) <= 350;

      // A single browser/device jump must not move a tactical marker. Ordinary
      // movement remains immediate within 500m; larger moves are promoted after
      // a second nearby fix confirms the new cluster. This prevents a second tab,
      // VPN/network estimate, or provider glitch from relocating an officer.
      candidateOnly = precise && sameReliableSession && jumpFromReliable > 500 && !corroboratesCandidate;
      acceptedForPosition = !candidateOnly;

      if (candidateOnly) {
        liveData.gps_candidate_latitude = latitude;
        liveData.gps_candidate_longitude = longitude;
        liveData.gps_candidate_accuracy = acceptedAccuracy;
        liveData.gps_candidate_updated_at = new Date(deviceFixAt).toISOString();
        liveData.gps_candidate_session_key = trackingSessionKey;
        liveData.gps_candidate_count = 1;
      } else {
        liveData.gps_updated_at = new Date(deviceFixAt).toISOString();
        liveData.latitude = latitude;
        liveData.longitude = longitude;
        liveData.heading = finiteNumber(body.heading);
        liveData.speed = finiteNumber(body.speed);
        liveData.accuracy = acceptedAccuracy;
        liveData.gps_session_key = trackingSessionKey;
        liveData.gps_candidate_latitude = null;
        liveData.gps_candidate_longitude = null;
        liveData.gps_candidate_accuracy = null;
        liveData.gps_candidate_updated_at = null;
        liveData.gps_candidate_session_key = '';
        liveData.gps_candidate_count = 0;

        // Never let a later Wi-Fi/IP estimate overwrite the officer's last precise
        // tactical coordinate. Coarse fixes remain available for diagnostics only.
        if (precise) {
          liveData.reliable_latitude = latitude;
          liveData.reliable_longitude = longitude;
          liveData.reliable_accuracy = acceptedAccuracy;
          liveData.reliable_gps_updated_at = new Date(deviceFixAt).toISOString();
          liveData.reliable_session_key = trackingSessionKey;
        }
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
    if (acceptedForPosition && acceptedAccuracy <= 5000) {
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
      latitude: acceptedForPosition ? latitude : null,
      longitude: acceptedForPosition ? longitude : null,
      gps_accepted: acceptedForPosition,
      gps_candidate_only: candidateOnly,
      gps_updated_at: acceptedForPosition ? new Date(deviceFixAt).toISOString() : activeOfficer.gps_updated_at || null,
      last_updated: now,
      history_recorded: historyRecorded,
    });
  } catch (error) {
    console.error('Error logging location:', error);
    return Response.json({ error: error?.message || 'Unable to update live location' }, { status: 500 });
  }
});
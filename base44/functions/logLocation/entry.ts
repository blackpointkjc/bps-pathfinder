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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isTransientHistoryError = (error: any) => /rate limit|too many requests|\b429\b|timed out|timeout|server selection|temporar|connection/i.test(String(error?.message || error));

async function withHistoryRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientHistoryError(error) || attempt === 2) break;
      await delay(300 * (attempt + 1));
    }
  }
  throw lastError || new Error('Movement history write failed');
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
          // Preserve the final accepted coordinate as LAST KNOWN. Clearing these
          // fields on logout/force-sign-out made maps fall all the way back to the
          // shift clock-in point even when a much newer usable GPS fix existed.
          // session_active=false is what prevents this coordinate being treated as live.
          heading: null,
          speed: 0,
          current_call_info: '',
        }).catch(() => null));
      }
      return Response.json({ success: true, session_ended: true, records_updated: ended.filter(Boolean).length });
    }

    // A GPS/heartbeat request that was already queued in the browser can arrive
    // after clock-out/logout retired the session. Never allow that trailing
    // request to reactivate an officer who is already Out of Service.
    if (String(user.status || '').trim().toLowerCase() === 'out of service') {
      const retired = [];
      for (const record of records || []) {
        if (record.session_active === false && String(record.status || '').toLowerCase() === 'out of service') continue;
        retired.push(await base44.asServiceRole.entities.ActiveOfficer.update(record.id, {
          session_active: false,
          status: 'Out of Service',
          last_update: now,
          heading: null,
          speed: 0,
          current_call_info: '',
        }).catch(() => null));
      }
      return Response.json({ success: true, ignored_after_duty_end: true, active_officer: null, records_retired: retired.filter(Boolean).length });
    }

    const primary = records?.[0] || null;
    const requestedFixAt = new Date(body.device_fix_at || now).getTime();
    const deviceFixAt = Number.isFinite(requestedFixAt) && requestedFixAt <= receivedAt + 30000
      ? requestedFixAt
      : receivedAt;
    const existingFixAt = new Date(primary?.gps_updated_at || 0).getTime();
    const gpsSource = String(body.gps_source || 'browser_geolocation');
    const candidateAccuracy = hasGps ? finiteNumber(body.accuracy, 999999) : 999999;
    const sessionChanged = Boolean(primary?.tracking_session_key)
      && String(primary.tracking_session_key) !== trackingSessionKey;
    const sameSessionPosition = Boolean(primary)
      && !sessionChanged
      && primary?.gps_session_key === trackingSessionKey
      && hasCoordinates(primary?.latitude, primary?.longitude)
      && Number.isFinite(existingFixAt)
      && existingFixAt > 0;
    const jumpDistance = sameSessionPosition
      ? distanceMeters(primary?.latitude, primary?.longitude, latitude, longitude)
      : 0;
    const jumpElapsedSeconds = sameSessionPosition
      ? Math.max(1, (deviceFixAt - existingFixAt) / 1000)
      : Infinity;
    const impossibleBrowserJump = gpsSource !== 'external_serial'
      && sameSessionPosition
      && jumpDistance > 5000
      && jumpDistance / jumpElapsedSeconds > 70;
    const grosslyImpreciseFix = gpsSource === 'external_serial'
      ? candidateAccuracy > 1000
      : candidateAccuracy > 2000;
    const acceptsGps = hasGps
      && deviceFixAt >= receivedAt - 2 * 60 * 1000
      && (!Number.isFinite(existingFixAt) || sessionChanged || deviceFixAt >= existingFixAt)
      && !grosslyImpreciseFix
      && !impossibleBrowserJump;

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
    if ((body.reset_gps === true || sessionChanged) && !acceptsGps) {
      // A newly established app/clock session must never inherit coordinates from
      // a prior session. This was the cause of officers appearing miles away at
      // the start of a new shift while the map displayed the old GPS timestamp.
      liveData.gps_updated_at = null;
      liveData.latitude = null;
      liveData.longitude = null;
      liveData.heading = null;
      liveData.speed = 0;
      liveData.accuracy = null;
      liveData.gps_source = '';
      liveData.gps_session_key = '';
    }
    if (sessionChanged) {
      // Reliable/last-known position is session-scoped too. Clear the previous
      // session's tactical fix even when the first new-session fix is only coarse.
      liveData.reliable_latitude = null;
      liveData.reliable_longitude = null;
      liveData.reliable_accuracy = null;
      liveData.reliable_gps_updated_at = null;
      liveData.reliable_gps_source = '';
      liveData.reliable_session_key = '';
      liveData.gps_candidate_latitude = null;
      liveData.gps_candidate_longitude = null;
      liveData.gps_candidate_accuracy = null;
      liveData.gps_candidate_updated_at = null;
      liveData.gps_candidate_session_key = '';
      liveData.gps_candidate_count = 0;
    }

    const acceptedAccuracy = acceptsGps ? candidateAccuracy : 999999;
    let acceptedForPosition = false;
    if (acceptsGps) {
      const precise = acceptedAccuracy <= 100;

      // Promote every fresh, accurate device fix immediately. The freshness gate
      // (deviceFixAt within the last 2 minutes and newer than the stored fix) plus
      // the accuracy gate already filter stale fixes, VPN/network estimates, and
      // provider glitches. A previous "jump guard" held any fix >500m from the last
      // reliable position as a candidate until a second fix landed within 350m —
      // but at normal driving speeds the next 15-second push lands farther than
      // 350m away, so the candidate was never corroborated and the officer's marker
      // froze at the old position for the entire drive. Real movement must update
      // the live marker right away.
      acceptedForPosition = true;
      liveData.gps_updated_at = new Date(deviceFixAt).toISOString();
      liveData.latitude = latitude;
      liveData.longitude = longitude;
      liveData.heading = finiteNumber(body.heading);
      liveData.speed = finiteNumber(body.speed);
      liveData.accuracy = acceptedAccuracy;
      liveData.gps_session_key = trackingSessionKey;
      liveData.gps_source = gpsSource;
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
        liveData.reliable_gps_source = gpsSource;
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
    //
    // History must follow the SAME acceptance rule as the live marker. The live
    // map intentionally accepts coarse device/network coordinates when that is
    // all the browser can provide, so history cannot silently reject them with a
    // separate 5,000m accuracy ceiling. Accuracy is stored for downstream views
    // that need to distinguish precise from coarse points.
    //
    // A transient history read/write must also not turn a successful live GPS
    // update into a 500 response after ActiveOfficer was already updated. Retry
    // the history operation independently; the next 15-second GPS push remains a
    // natural recovery opportunity if the data service is temporarily unavailable.
    let historyRecorded = false;
    let historyError = '';
    if (acceptedForPosition && hasCoordinates(latitude, longitude)) {
      try {
        const latestHistory = await withHistoryRetry(() => base44.asServiceRole.entities.LocationHistory.filter(
          { officer_email: officerEmail },
          '-timestamp',
          1,
        ));
        const latestAt = new Date(latestHistory?.[0]?.timestamp || latestHistory?.[0]?.created_date || 0).getTime();
        if (!Number.isFinite(latestAt) || deviceFixAt - latestAt >= 55000) {
          await withHistoryRetry(() => base44.asServiceRole.entities.LocationHistory.create({
            time_entry_id: String(body.time_entry_id || body.clock_in_time || `login-session:${activeOfficer.clock_in_time || now}`),
            officer_email: officerEmail,
            officer_name: String(liveData.officer_name),
            location: String(liveData.current_location),
            latitude,
            longitude,
            timestamp: new Date(deviceFixAt).toISOString(),
            accuracy: acceptedAccuracy,
          }));
          historyRecorded = true;
        }
      } catch (error) {
        historyError = String(error?.message || error || 'Movement history write failed');
        console.warn(`[logLocation] movement history delayed for ${officerEmail}: ${historyError}`);
      }
    }

    console.log(`[logLocation] activeOfficer=${activeOfficer.id} user=${user.id} heartbeat=${heartbeatOnly} gps_received=${hasGps} gps_accepted=${acceptsGps} source=${gpsSource} accuracy=${candidateAccuracy} session_changed=${sessionChanged} jump_m=${Math.round(jumpDistance)} grossly_imprecise=${grosslyImpreciseFix} impossible_jump=${impossibleBrowserJump} history=${historyRecorded} history_error=${Boolean(historyError)}`);
    return Response.json({
      success: true,
      active_officer: activeOfficer,
      latitude: acceptedForPosition ? latitude : null,
      longitude: acceptedForPosition ? longitude : null,
      gps_accepted: acceptedForPosition,
      gps_candidate_only: false,
      gps_rejected_reason: grosslyImpreciseFix ? 'accuracy_too_low' : impossibleBrowserJump ? 'impossible_jump' : null,
      gps_updated_at: acceptedForPosition ? new Date(deviceFixAt).toISOString() : activeOfficer.gps_updated_at || null,
      last_updated: now,
      history_recorded: historyRecorded,
      history_error: historyError || null,
    });
  } catch (error) {
    console.error('Error logging location:', error);
    return Response.json({ error: error?.message || 'Unable to update live location' }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk';
import { isLiveLocationHidden, clearedLivePosition } from './privacy.ts';

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedSpeedMph(value: unknown) {
  const speed = Math.max(0, finiteNumber(value));
  return speed >= 5 ? speed : 0;
}

function hasCoordinates(latitude: unknown, longitude: unknown) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined || latitude === '' || longitude === '') return false;
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
// Never immediately retry throttled or timed-out writes: a timed-out create may
// already have committed. The next scheduled ping checks history before writing.
const isTransientHistoryError = (error: any) => {
  const message = String(error?.message || error);
  return !/rate limit|too many requests|\b429\b|timed out|timeout/i.test(message) && /temporar|connection/i.test(message);
};

async function withHistoryRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (!isTransientHistoryError(error) || attempt === 1) break;
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

    const liveLocationHidden = await isLiveLocationHidden(base44, user);
    const body = await req.json().catch(() => ({}));
    const heartbeatOnly = body.heartbeat_only === true;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const hasGps = !heartbeatOnly && hasCoordinates(body.latitude, body.longitude);
    if (!heartbeatOnly && !hasGps && body.end_session !== true) {
      return Response.json({ error: 'Valid latitude and longitude are required' }, { status: 400 });
    }

    const receivedAt = Date.now();
    const now = new Date(receivedAt).toISOString();
    const officerEmail = String(user.email || body.officer_email || '').trim().toLowerCase();
    if (!officerEmail) return Response.json({ error: 'Officer email is required' }, { status: 400 });
    // One officer can be signed in on more than one device at once. Use the
    // TimeEntry id when clocked in, otherwise a stable account session key so a
    // phone and laptop do not repeatedly invalidate each other's GPS session.
    const trackingSessionKey = String(body.tracking_session_key || `account-session:${user.id || officerEmail}`);

    const records = await base44.asServiceRole.entities.ActiveOfficer.filter(
      { officer_email: officerEmail },
      '-last_update',
      100,
    );

    if (body.end_session === true) {
      const ended = [];
      for (const record of records || []) {
        ended.push(await base44.asServiceRole.entities.ActiveOfficer.update(record.id, {
          // Ending the browser/app GPS session is not a duty-status transition.
          // Preserve the officer's last CAD status; Clock Out owns OOS.
          session_active: false,
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

    // Duty status and app-session tracking are separate concerns. Going Out of
    // Service (clock-out, supervisor action, or the officer's own toggle) does
    // not end the signed-in app session, so it must not stop GPS publishing or
    // the one-minute movement history either — the documented tracking scope
    // covers every authenticated session regardless of duty role or clock-in
    // status, and ends only when the app session itself ends (sign-out, or the
    // auth token failing). The record's status is pinned to the officer's real
    // duty status below, so no board ever shows an Out of Service officer as
    // available and no queued request can resurrect a stale Available flag.
    const dutyOutOfService = String(user.status || '').trim().toLowerCase() === 'out of service';

    const primary = records?.[0] || null;
    const requestedFixAt = new Date(body.device_fix_at || now).getTime();
    const deviceFixAt = Number.isFinite(requestedFixAt) && requestedFixAt <= receivedAt + 30000
      ? requestedFixAt
      : receivedAt;
    const existingFixAt = new Date(primary?.gps_updated_at || 0).getTime();
    const gpsSource = String(body.gps_source || 'browser_geolocation');
    const candidateAccuracy = hasGps ? finiteNumber(body.accuracy, 999999) : 999999;
    const deviceId = String(body.device_id || 'legacy-device');
    const existingDeviceId = String(primary?.gps_device_id || '');
    const existingAccuracy = finiteNumber(primary?.accuracy, 999999);
    const existingSource = String(primary?.gps_source || '');
    const existingFresh = Boolean(primary)
      && hasCoordinates(primary?.latitude, primary?.longitude)
      && Number.isFinite(existingFixAt)
      && existingFixAt > 0
      && receivedAt - existingFixAt <= 90 * 1000;
    const sameGpsDevice = !existingDeviceId || existingDeviceId === deviceId;
    const externalCandidate = gpsSource === 'external_serial';
    const externalExisting = existingSource === 'external_serial';
    const candidateClearlyBetter = candidateAccuracy + 15 < existingAccuracy;
    const candidateOwnsBestSource = !existingFresh
      || sameGpsDevice
      || (externalCandidate && !externalExisting)
      || (!externalExisting && candidateClearlyBetter);
    const sessionChanged = Boolean(primary?.tracking_session_key)
      && String(primary.tracking_session_key) !== trackingSessionKey;
    const sameSessionPosition = Boolean(primary)
      && !sessionChanged
      && primary?.gps_session_key === trackingSessionKey
      && (!existingDeviceId || existingDeviceId === deviceId)
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
    const grosslyImpreciseFix = candidateAccuracy > 100;
    const acceptsGps = hasGps
      && deviceFixAt >= receivedAt - 2 * 60 * 1000
      && (!Number.isFinite(existingFixAt) || sessionChanged || deviceFixAt >= existingFixAt || (candidateClearlyBetter && existingFixAt - deviceFixAt <= 30000))
      && !grosslyImpreciseFix
      && !impossibleBrowserJump
      && candidateOwnsBestSource;

    const directoryName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    const canonicalOfficerName = directoryName || String(user.full_name || body.officer_name || officerEmail).trim();
    const liveData: Record<string, unknown> = {
      officer_email: officerEmail,
      officer_name: canonicalOfficerName,
      first_name: String(user.first_name || ''),
      last_name: String(user.last_name || ''),
      rank: String(user.rank || ''),
      profile_photo_url: String(user.profile_photo_url || ''),
      unit_number: String(body.unit_number || user.unit_number || ''),
      current_location: String(body.current_location || user.current_location || user.assigned_location || 'Signed In'),
      clock_in_time: String(body.clock_in_time || now),
      tracking_session_key: trackingSessionKey,
      last_update: now,
      user_role: String(body.user_role || user.role || 'user'),
      session_active: true,
      show_lights: false,
      current_call_id: String(body.current_call_id || user.current_call_id || ''),
      current_call_info: String(body.current_call_info || user.current_call_info || ''),
    };
    if (body.reset_gps === true && !acceptsGps) {
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
      liveData.gps_device_id = '';
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
      liveData.speed = normalizedSpeedMph(body.speed);
      liveData.accuracy = acceptedAccuracy;
      liveData.gps_session_key = trackingSessionKey;
      liveData.gps_source = gpsSource;
      liveData.gps_device_id = deviceId;
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
    // caller explicitly supplies one (initial session creation), when creating
    // a new record, or when the officer's authoritative duty status is Out of
    // Service (pin it so tracking writes can never resurrect a stale Available
    // flag). When updating an existing record, do NOT include status —
    // a heartbeat that reads primary.status before updateOfficerStatus writes
    // and then writes after it creates a race that flips the officer back to
    // the old status on the board.
    if (dutyOutOfService) {
      liveData.status = 'Out of Service';
    } else if (body.status) {
      liveData.status = String(body.status);
    } else if (!primary) {
      liveData.status = String(user.status || 'Signed In');
    }
    // Private GPS still reaches the history stream below, never the public live entity.
    liveData.live_location_hidden = liveLocationHidden;
    if (liveLocationHidden) Object.assign(liveData, clearedLivePosition);
    const activeOfficer = primary
      ? await base44.asServiceRole.entities.ActiveOfficer.update(primary.id, liveData)
      : await base44.asServiceRole.entities.ActiveOfficer.create(liveData);

    // A toggle can arrive while this request is in flight. Recheck after the write.
    const hiddenAfterWrite = await isLiveLocationHidden(base44, user);
    if (hiddenAfterWrite) {
      await base44.asServiceRole.entities.ActiveOfficer.update(activeOfficer.id, clearedLivePosition);
      Object.assign(activeOfficer, clearedLivePosition);
    }
    const duplicateIds = (records || []).slice(1).map((record: any) => record.id).filter(Boolean);
    if (duplicateIds.length) {
      await Promise.all(duplicateIds.map((id: string) =>
        base44.asServiceRole.entities.ActiveOfficer.delete(id).catch(() => null)
      ));
    }

    // Automatically place an assigned officer On Scene when the accepted live GPS
    // fix is within 50 feet (15.24m) of the call. This runs on the backend location
    // write, so arrival does not depend on the dispatch page being open/foreground.
    const autoSceneTransitions: Array<{ call_id:string; distance_meters:number }> = [];
    const officerOperationalStatus = String(primary?.status || user.status || '').trim().toLowerCase();
    const shouldCheckArrival = acceptedForPosition
      && acceptedAccuracy <= 100
      && ['dispatched','enroute','en route'].includes(officerOperationalStatus);
    if (shouldCheckArrival) {
      const officerAssignments = await base44.asServiceRole.entities.CallAssignment
        .filter({ unit_id: user.id }, '-assigned_at', 100)
        .catch(() => []);
      const activeAssignments = (officerAssignments || []).filter((assignment:any) =>
        !['cleared','cancelled','canceled','on_scene'].includes(String(assignment.status || '').trim().toLowerCase())
      );
      for (const assignment of activeAssignments) {
        const call = await base44.asServiceRole.entities.DispatchCall.get(assignment.call_id).catch(() => null);
        if (!call || ['cleared','cancelled','canceled','closed','resolved','completed'].includes(String(call.status || '').trim().toLowerCase())) continue;
        if (!hasCoordinates(call.latitude, call.longitude)) continue;
        const arrivalDistance = distanceMeters(latitude, longitude, call.latitude, call.longitude);
        if (!Number.isFinite(arrivalDistance) || arrivalDistance > 15.24) continue;

        const arrivalAt = new Date(deviceFixAt).toISOString();
        await base44.asServiceRole.entities.CallAssignment.update(assignment.id, {
          status: 'on_scene',
          accepted_at: assignment.accepted_at || assignment.assigned_at || arrivalAt,
        }).catch(() => null);
        await base44.asServiceRole.entities.DispatchCall.update(call.id, {
          status: 'On Scene',
          time_on_scene: call.time_on_scene || arrivalAt,
        }).catch(() => null);
        const callInfo = `${call.incident || 'Call for service'} · ${call.location || ''}`.slice(0, 500);
        await base44.asServiceRole.entities.User.update(user.id, {
          status: 'On Scene',
          current_call_id: call.id,
          current_call_info: callInfo,
          status_since: arrivalAt,
          last_updated: now,
        }).catch(() => null);
        await base44.asServiceRole.entities.ActiveOfficer.update(activeOfficer.id, {
          status: 'On Scene',
          current_call_info: callInfo,
          last_update: now,
        }).catch(() => null);
        const unitRows = await base44.asServiceRole.entities.Unit.filter({ user_id: user.id }, '-last_update_at', 20).catch(() => []);
        await Promise.all((unitRows || []).map((unit:any) => base44.asServiceRole.entities.Unit.update(unit.id, {
          status: 'On Scene',
          assigned_call_ids: Array.from(new Set([...(unit.assigned_call_ids || []).map(String), String(call.id)])),
          last_update_at: now,
        }).catch(() => null)));
        const cadNumber = call.agency_cad_number || call.bps_reference || call.call_id || call.id;
        const officerName = user.unit_number ? `Unit ${user.unit_number}` : ([user.rank, user.last_name].filter(Boolean).join(' ') || user.full_name || officerEmail);
        await base44.asServiceRole.entities.CallStatusLog.create({
          call_id: call.id,
          incident_type: call.incident || '',
          location: call.location || '',
          old_status: call.status || '',
          new_status: 'On Scene',
          unit_id: user.id,
          unit_name: officerName,
          notes: `Automatically marked On Scene at ${Math.round(arrivalDistance)}m from the call using accepted ${gpsSource} GPS.`,
          latitude: hiddenAfterWrite ? null : latitude,
          longitude: hiddenAfterWrite ? null : longitude,
          event_key: `call:${call.id}:unit:${user.id}:auto-on-scene:${arrivalAt}`,
          event_type: 'unit_on_scene',
          announcement_text: `${officerName} automatically marked on scene. CAD number ${cadNumber}.`,
          announcement_priority: call.priority === 'critical' ? 'critical' : call.priority === 'high' ? 'high' : 'normal',
          cad_number: String(cadNumber),
          triggering_action: 'logLocation.autoArrival50ft',
          audio_enabled: true,
          sensitive: false,
        }).catch(() => null);
        autoSceneTransitions.push({ call_id: String(call.id), distance_meters: Math.round(arrivalDistance * 10) / 10 });
      }
    }

    // Persist movement history in the authenticated backend so browser
    // background throttling and client-side RLS cannot silently stop the trail.
    // One history stream per officer across tabs/devices: every 30 seconds
    // with an external receiver or movement, every 60 seconds for idle browser GPS.
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
    const shouldRecordHistory = body.record_history !== false;
    if (shouldRecordHistory && acceptedForPosition && hasCoordinates(latitude, longitude)) {
      try {
        const historySessionId = String(body.time_entry_id || body.clock_in_time || `login-session:${activeOfficer.clock_in_time || now}`);
        const latestHistory = await withHistoryRetry(() => base44.asServiceRole.entities.LocationHistory.filter(
          { officer_email: officerEmail },
          '-timestamp',
          1,
        ));
        const latestAt = new Date(latestHistory?.[0]?.timestamp || latestHistory?.[0]?.created_date || 0).getTime();
        const latestIsUsable = Number.isFinite(latestAt) && latestAt <= receivedAt + 30000;
        const speedMph = normalizedSpeedMph(body.speed);
        const movedMeters = latestHistory?.[0]
          ? distanceMeters(latestHistory[0].latitude, latestHistory[0].longitude, latitude, longitude)
          : 0;
        const historyIntervalMs = externalCandidate || speedMph >= 5 || movedMeters >= 18 ? 30000 : 60000;
        if (!latestIsUsable || deviceFixAt - latestAt >= historyIntervalMs) {
          await withHistoryRetry(() => base44.asServiceRole.entities.LocationHistory.create({
            time_entry_id: historySessionId,
            officer_email: officerEmail,
            officer_name: String(liveData.officer_name),
            location: String(liveData.current_location),
            latitude,
            longitude,
            timestamp: new Date(deviceFixAt).toISOString(),
            accuracy: acceptedAccuracy,
            speed: normalizedSpeedMph(body.speed),
            heading: finiteNumber(body.heading),
            gps_source: gpsSource,
          }));
          historyRecorded = true;
        }
      } catch (error: any) {
        historyError = String(error?.message || error || 'Movement history write failed');
        console.warn(`[logLocation] movement history delayed for ${officerEmail}: ${historyError}`);
      }
    }

    console.log(`[logLocation] activeOfficer=${activeOfficer.id} user=${user.id} heartbeat=${heartbeatOnly} gps_received=${hasGps} gps_accepted=${acceptsGps} source=${gpsSource} device=${deviceId} best_source=${candidateOwnsBestSource} accuracy=${candidateAccuracy} existing_accuracy=${existingAccuracy} session_changed=${sessionChanged} jump_m=${Math.round(jumpDistance)} grossly_imprecise=${grosslyImpreciseFix} impossible_jump=${impossibleBrowserJump} history_requested=${shouldRecordHistory} history=${historyRecorded} history_error=${Boolean(historyError)}`);
    return Response.json({
      success: true,
      active_officer: activeOfficer,
      latitude: acceptedForPosition ? latitude : null,
      longitude: acceptedForPosition ? longitude : null,
      gps_accepted: acceptedForPosition,
      live_location_hidden: hiddenAfterWrite,
      gps_candidate_only: false,
      gps_rejected_reason: grosslyImpreciseFix ? 'accuracy_too_low' : impossibleBrowserJump ? 'impossible_jump' : (!candidateOwnsBestSource && hasGps ? 'better_device_fix_active' : null),
      gps_updated_at: acceptedForPosition ? new Date(deviceFixAt).toISOString() : activeOfficer.gps_updated_at || null,
      last_updated: now,
      history_recorded: historyRecorded,
      history_error: historyError || null,
      auto_on_scene: autoSceneTransitions,
    });
  } catch (error: any) {
    console.error('Error logging location:', error);
    return Response.json({ error: error?.message || 'Unable to update live location' }, { status: 500 });
  }
});
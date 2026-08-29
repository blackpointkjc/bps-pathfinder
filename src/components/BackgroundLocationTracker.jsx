import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { requestBestLiveLocation, requestFreshLiveLocation, startLiveLocationTracking, subscribeLiveLocation } from '@/lib/liveLocationService';
import { publishOfficerLocation } from '@/lib/officerLocationHub';
import { isInternalMember } from '@/lib/directoryUtils';

// Calculate distance between two GPS coordinates in meters
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isPointInsideBoundary(lat, lng, rawPolygon = []) {
  const polygon = rawPolygon
    .map(point => Array.isArray(point) ? { lat: Number(point[0]), lng: Number(point[1]) } : { lat: Number(point?.lat), lng: Number(point?.lng) })
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (polygon.length < 3) return null;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.lng > lng) !== (pj.lng > lng)) &&
      (lat < ((pj.lat - pi.lat) * (lng - pi.lng)) / ((pj.lng - pi.lng) || Number.EPSILON) + pi.lat);
    if (intersects) inside = !inside;
  }
  return inside;
}

export default function BackgroundLocationTracker({ user }) {
  const lastSaveRef = useRef(0);
  const lastLivePushRef = useRef(0);
  const lastGeofenceCheckRef = useRef(0);
  const activeOfficerRecordRef = useRef(null);
  const uploadChainRef = useRef(Promise.resolve());
  const lastPositionRef = useRef(null);
  const sessionStartedRef = useRef(new Date().toISOString());
  const queryClient = useQueryClient();

  const { data: activeEntry } = useQuery({
    queryKey: ['bgTrackerActiveEntry', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      try {
        const entries = await base44.entities.TimeEntry.filter(
          { officer_email: user.email },
          '-clock_in',
          100
        );
        return entries.find(e => !e.clock_out) || null;
      } catch (e) {
        console.error('Error fetching active time entry:', e);
        return null;
      }
    },
    enabled: !!user?.email,
    refetchInterval: 30000,
  });

  // Get locations for geofencing
  const { data: locations } = useQuery({
    queryKey: ['locationsForGeofence'],
    queryFn: async () => {
      try {
        return await base44.entities.Location.list();
      } catch (e) {
        console.error('Error fetching locations:', e);
        return [];
      }
    },
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Signed-in tracking rule: GPS publishing and one-minute movement history run
  // whenever the officer is logged into the app. An open TimeEntry adds site/shift
  // context, but it does not control whether live navigation tracking is active.
  const shouldTrack = !!user?.email && isInternalMember(user);
  const shouldPublish = shouldTrack;

  // Mutation to create geofence alert
  const createGeofenceAlertMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.functions.invoke('manageGeofenceAlerts', { action: 'outside', ...data });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofenceAlerts'] });
    },
  });

  // All session establishment, GPS updates, and heartbeats pass through this
  // one serialized uploader. It prevents a heartbeat and GPS fix from racing each
  // other and guarantees the backend sees location events in order.
  const persistLiveState = (data) => {
    const request = uploadChainRef.current
      .catch(() => null)
      .then(async () => {
        const payload = await publishOfficerLocation(data);
        if (payload.active_officer?.id) activeOfficerRecordRef.current = payload.active_officer.id;
        return payload.active_officer;
      });
    uploadChainRef.current = request;
    return request;
  };

  // Establish the live session through the same backend upsert used by GPS/heartbeat.
  // Do not directly create/delete ActiveOfficer rows here: that raced with logLocation
  // and produced duplicate live rows for the same officer, allowing status boards to
  // briefly resolve the wrong/stale record. Do not clear the server's last coordinate
  // on mount: opening another page/tab must not erase a valid fix from an active device.
  useEffect(() => {
    if (!shouldPublish || !user?.email) return;

    const establishSession = async () => {
      try {
        await persistLiveState({
          heartbeat_only: true,
          officer_email: user.email,
          officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          unit_number: user.unit_number || '',
          current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
          clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
          user_role: user?.role || 'user',
          session_active: true,
        });
        queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });
      } catch (error) {
        console.error('Error establishing live user location record:', error);
      }
    };

    establishSession();
  }, [shouldPublish, user?.email, activeEntry?.id, activeEntry?.location]);

  useEffect(() => {
    if (!shouldTrack) return undefined;

    const saveLocation = async (fix) => {
      const now = Date.now();
      const lat = Number(fix.latitude);
      const lng = Number(fix.longitude);
      const accuracy = Number(fix.accuracy);
      const fixTimestamp = Number(fix.timestamp) || Date.now();
      // A cached browser result is not a live officer location. Keep the signed-in
      // heartbeat active, but wait for a genuinely current device fix before
      // updating gps_updated_at or the movement trail.
      if (Date.now() - fixTimestamp > 2 * 60 * 1000) {
        window.dispatchEvent(new CustomEvent('bps-location-quality', {
          detail: { state: 'stale', ageMs: Date.now() - fixTimestamp },
        }));
        return;
      }
      // Keep every valid browser/device coordinate in the single live-location
      // stream. Desktop browsers and indoor phones often report Wi-Fi-assisted
      // accuracy above 100m; rejecting those fixes made officers vanish entirely.
      // Accuracy remains attached to the fix so precision-sensitive features such
      // as geofencing/automatic dispatch can apply their own tighter rules.
      if (!Number.isFinite(accuracy)) {
        window.dispatchEvent(new CustomEvent('bps-location-quality', {
          detail: { state: 'low_accuracy', accuracy: null },
        }));
      } else if (accuracy > 100) {
        window.dispatchEvent(new CustomEvent('bps-location-quality', {
          detail: { state: 'low_accuracy', accuracy },
        }));
      } else {
        window.dispatchEvent(new CustomEvent('bps-location-quality', {
          detail: { state: 'live', accuracy },
        }));
      }

      lastPositionRef.current = fix;

      if (!shouldPublish) return;

      try {
        // One canonical push every 15 seconds is fast enough for the live map and
        // avoids multiplying API traffic across every signed-in device.
        if (now - lastLivePushRef.current < 15000) return;
        lastLivePushRef.current = now;

        // Always update ActiveOfficer for the app-wide authoritative live position.
        await persistLiveState({
          officer_email: user.email,
          officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          unit_number: user.unit_number || '',
          current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
          clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
          time_entry_id: activeEntry?.id || '',
          last_update: new Date().toISOString(),
          device_fix_at: new Date(fixTimestamp).toISOString(),
          latitude: lat,
          longitude: lng,
          heading: Number.isFinite(Number(fix.heading)) ? Number(fix.heading) : 0,
          speed: Number.isFinite(Number(fix.speed)) ? Number(fix.speed) : 0,
          accuracy: accuracy,
          user_role: user?.role || 'user',
          session_active: true,
        });
        
        // Invalidate active officers query to refresh map
        queryClient.invalidateQueries({ queryKey: ['activeOfficers'] });
        queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });

        // Check geofence every 30 seconds (only when clocked in at a site)
        if (activeEntry && now - lastGeofenceCheckRef.current >= 30000 && locations) {
          lastGeofenceCheckRef.current = now;

          // Find the location for this officer's active site - match by site name
          const siteName = activeEntry.location?.split(' - ')[0]?.split(':')[0]?.trim();
          const siteLocation = locations.find(loc => 
            loc.site_name === siteName || 
            loc.site_name.includes(siteName) || 
            siteName?.includes(loc.site_name)
          );

          if (siteLocation?.geofence_enabled && siteLocation.latitude && siteLocation.longitude) {
            const distance = getDistanceFromLatLonInMeters(
              lat, lng,
              siteLocation.latitude,
              siteLocation.longitude
            );
            const sharedPolygon = siteLocation.geofence_polygon || [];
            const polygonInside = isPointInsideBoundary(lat, lng, sharedPolygon);
            const radius = siteLocation.geofence_radius_meters || 100;
            const outsideGeofence = polygonInside === null ? distance > radius : !polygonInside;

            // Only create alert if GPS accuracy is reasonable (under 200m) and officer is outside
            // the custom property polygon (or the radius fallback when no polygon exists).
            if (accuracy <= 200 && outsideGeofence) {
              try {
                await createGeofenceAlertMutation.mutateAsync({
                  officer_email: user.email,
                  officer_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
                  location: siteLocation.site_name,
                  alert_type: 'outside_zone',
                  latitude: lat,
                  longitude: lng,
                  distance_from_site: Math.round(distance),
                });
                console.warn(`Geofence alert: Officer outside ${sharedPolygon.length >= 3 ? 'custom boundary' : `${radius}m radius`} at ${siteLocation.site_name}`);
              } catch (e) {
                console.error('Failed to create geofence alert:', e);
              }
            } else if (accuracy <= 200 && !outsideGeofence) {
              // Returning to the approved boundary resolves any outstanding alert
              // for this officer/site automatically. Supervisors still retain the
              // resolved item in history for review.
              try {
                await base44.functions.invoke('manageGeofenceAlerts', {
                  action: 'resolve_mine',
                  location: siteLocation.site_name,
                  reason: 'Automatically resolved when officer returned inside the approved geofence.',
                });
                queryClient.invalidateQueries({ queryKey: ['geofenceAlerts'] });
              } catch (e) {
                console.warn('Unable to auto-resolve geofence alert:', e?.message);
              }
            }
          }
        }


      } catch (error) {
        console.error('Failed to save location:', error);
      }
    };

    const reportLocationError = (error) => {
      const state = error?.code === 1
        ? 'permission_denied'
        : error?.code === 3
          ? 'timeout'
          : 'unavailable';
      window.dispatchEvent(new CustomEvent('bps-location-quality', {
        detail: { state, message: error?.message || 'The browser could not obtain a location.' },
      }));
      console.warn('Geolocation unavailable:', error?.message || error);
    };

    // The singleton live-location service is the only owner of browser GPS.
    // Every map, clock, report, distress control, and navigation view consumes
    // this same stream instead of opening competing watchPosition handles.
    const unsubscribe = subscribeLiveLocation(saveLocation);
    const releaseTracking = startLiveLocationTracking({ onError: reportLocationError });
    requestBestLiveLocation({ timeoutMs: 15000, targetAccuracyMeters: 75 }).catch(() => requestFreshLiveLocation({ timeoutMs: 15000 }).catch(() => null));

    return () => {
      unsubscribe();
      releaseTracking();
    };
  }, [shouldTrack, shouldPublish, activeEntry, user, locations]);

  // Independent signed-in heartbeat. Live GPS is refreshed every 15 seconds even
  // when watchPosition is quiet; movement history remains one-minute.
  useEffect(() => {
    if (!shouldTrack || !user?.email) return undefined;

    const heartbeat = async () => {
      const fix = lastPositionRef.current;
      try {
        if (Date.now() - lastLivePushRef.current >= 15000) {
          await persistLiveState({
            officer_email: user.email,
            officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
            unit_number: user.unit_number || '',
            current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
            clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
            time_entry_id: activeEntry?.id || '',
            ...(fix && Date.now() - Number(fix.timestamp || 0) <= 2 * 60 * 1000 ? {
              latitude: fix.latitude,
              longitude: fix.longitude,
              heading: Number.isFinite(Number(fix.heading)) ? Number(fix.heading) : 0,
              speed: Number.isFinite(Number(fix.speed)) ? Number(fix.speed) : 0,
              accuracy: fix.accuracy,
              device_fix_at: new Date(Number(fix.timestamp)).toISOString(),
            } : { heartbeat_only: true }),
            user_role: user?.role || 'user',
            session_active: true,
          });
          lastLivePushRef.current = Date.now();
        }
        if (fix && Date.now() - lastSaveRef.current >= 55000) {
          // logLocation now owns the durable one-minute LocationHistory write.
          // Keep this timestamp only to refresh history consumers without
          // creating a competing client-side row.
          lastSaveRef.current = Date.now();
          queryClient.invalidateQueries({ queryKey: ['locationHistory'] });
        }
        queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });
      } catch (error) {
        console.warn('Location heartbeat failed:', error?.message);
      }
    };

    heartbeat();
    const heartbeatId = window.setInterval(heartbeat, 30000);
    return () => window.clearInterval(heartbeatId);
  }, [shouldTrack, user?.email, user?.role, user?.status, user?.assigned_location, activeEntry?.id, activeEntry?.location, activeEntry?.clock_in]);

  // Keep tracking state awareness internal; never invoke the browser's
  // native close-tab confirmation UI.
  useEffect(() => {
    if (!shouldTrack) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.warn('⚠️ Tab is now hidden. Location tracking continues but may be less reliable.');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [shouldTrack]);

  // Add pagehide event for iOS/mobile browsers
  useEffect(() => {
    if (!shouldTrack) return;

    const handlePageHide = (e) => {
      if (e.persisted) {
        console.warn('Page cached - location tracking may be interrupted');
      }
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [shouldTrack]);

  return null;
}
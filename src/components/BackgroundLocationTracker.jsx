import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { publishLiveLocation } from '@/lib/liveLocationService';
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
  const watchIdRef = useRef(null);
  const activeOfficerRecordRef = useRef(null);
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

  // Persist every accepted GPS fix through one authenticated backend upsert.
  // This avoids client RLS/duplicate-row races and makes ActiveOfficer the single
  // authoritative source consumed by both live maps.
  const updateActiveOfficerMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('logLocation', data);
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      if (payload.active_officer?.id) activeOfficerRecordRef.current = payload.active_officer.id;
      return payload.active_officer;
    },
    onError: (error) => {
      console.error('Live location upload failed:', error?.message || error);
    },
  });

  // Establish exactly one live session record while the officer is signed in.
  useEffect(() => {
    if (!shouldPublish) return;

    const getActiveOfficerRecord = async () => {
      try {
        const records = await base44.entities.ActiveOfficer.filter({ officer_email: user.email });
        const sessionData = {
          officer_email: user.email,
          officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
          clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
          last_update: new Date().toISOString(),
          status: user?.status || 'Signed In',
          user_role: user?.role || 'user',
          session_active: true,
        };
        // Never revive a previous session's coordinates by refreshing its heartbeat.
        // Start every login/clock-context session with a clean row; the first accepted
        // device GPS fix will populate coordinates through logLocation.
        await Promise.all(records.map(record => base44.entities.ActiveOfficer.delete(record.id).catch(() => null)));
        const created = await base44.entities.ActiveOfficer.create(sessionData);
        activeOfficerRecordRef.current = created.id;
        queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });
      } catch (error) {
        console.error('Error establishing live user location record:', error);
      }
    };

    getActiveOfficerRecord();
  }, [shouldPublish, user?.email, activeEntry?.id]);

  useEffect(() => {
    if (!shouldTrack) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      console.error('Geolocation not supported');
      return;
    }

    const saveLocation = async (position) => {
      const now = Date.now();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const normalizedFix = {
        latitude: lat,
        longitude: lng,
        accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed ? position.coords.speed * 2.237 : 0,
        timestamp: position.timestamp || Date.now(),
      };
      // Never present a Wi-Fi/IP estimate as an exact live officer position.
      // Field navigation requires a device fix within 100 meters; poorer readings
      // remain pending until Android/browser precise-location access produces GPS.
      if (!Number.isFinite(accuracy) || accuracy > 100) {
        window.dispatchEvent(new CustomEvent('bps-location-quality', {
          detail: { state: 'low_accuracy', accuracy: Number.isFinite(accuracy) ? accuracy : null },
        }));
        console.warn(`Location accuracy too low for live map: ${Number.isFinite(accuracy) ? accuracy.toFixed(0) : 'unknown'}m`);
        return;
      }

      lastPositionRef.current = normalizedFix;
      publishLiveLocation(normalizedFix);
      window.dispatchEvent(new CustomEvent('bps-location-quality', {
        detail: { state: 'live', accuracy },
      }));

      if (!shouldPublish) return;

      try {
        // Limit server writes to one live GPS update every 5 seconds. Browser GPS can
        // emit multiple fixes per second, which previously contributed to API throttling.
        if (now - lastLivePushRef.current < 5000) return;
        lastLivePushRef.current = now;

        // Always update ActiveOfficer for the app-wide authoritative live position.
        await updateActiveOfficerMutation.mutateAsync({
          officer_email: user.email,
          officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          unit_number: user.unit_number || '',
          current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
          clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
          last_update: new Date().toISOString(),
          gps_updated_at: new Date().toISOString(),
          latitude: lat,
          longitude: lng,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : 0,
          speed: position.coords.speed ? position.coords.speed * 2.237 : 0,
          accuracy: accuracy,
          status: user?.status || 'Signed In',
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

    const gpsOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
    };

    // Keep the passive stream, but also request a genuinely fresh device fix every
    // five seconds. Some Windows/tablet browsers leave watchPosition pinned to a
    // cached Wi-Fi coordinate even while the officer is moving.
    watchIdRef.current = navigator.geolocation.watchPosition(
      saveLocation,
      (error) => console.error('Geolocation watch error:', error),
      gpsOptions,
    );
    let freshRequestPending = false;
    const requestFreshPosition = () => {
      if (freshRequestPending) return;
      freshRequestPending = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          freshRequestPending = false;
          saveLocation(position);
        },
        (error) => {
          freshRequestPending = false;
          console.warn('Fresh GPS request unavailable:', error?.message || error);
        },
        { ...gpsOptions, timeout: 4500 },
      );
    };
    requestFreshPosition();
    const freshPositionId = window.setInterval(requestFreshPosition, 5000);

    return () => {
      window.clearInterval(freshPositionId);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [shouldTrack, shouldPublish, activeEntry, user, locations]);

  // Independent signed-in heartbeat. Live GPS is refreshed every 15 seconds even
  // when watchPosition is quiet; movement history remains one-minute.
  useEffect(() => {
    if (!shouldTrack || !user?.email) return undefined;

    const heartbeat = async () => {
      const nowIso = new Date().toISOString();
      const fix = lastPositionRef.current;
      try {
        if (Date.now() - lastLivePushRef.current >= 10000) {
          const response = await base44.functions.invoke('logLocation', {
            officer_email: user.email,
            officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
            unit_number: user.unit_number || '',
            current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
            clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
            ...(fix ? {
              latitude: fix.latitude,
              longitude: fix.longitude,
              heading: Number.isFinite(Number(fix.heading)) ? Number(fix.heading) : 0,
              speed: Number.isFinite(Number(fix.speed)) ? Number(fix.speed) : 0,
              accuracy: fix.accuracy,
            } : { heartbeat_only: true }),
            status: user?.status || 'Signed In',
            user_role: user?.role || 'user',
            session_active: true,
          });
          const payload = response?.data || response || {};
          if (payload.error) throw new Error(payload.error);
          if (payload.active_officer?.id) activeOfficerRecordRef.current = payload.active_officer.id;
          lastLivePushRef.current = Date.now();
        }
        if (fix && Date.now() - lastSaveRef.current >= 55000) {
          await base44.entities.LocationHistory.create({
            time_entry_id: activeEntry?.id || `login-session:${sessionStartedRef.current}`,
            officer_email: user.email,
            officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
            location: activeEntry?.location || user?.current_location || user?.assigned_location || `Signed In · ${user?.role || 'user'}`,
            latitude: fix.latitude,
            longitude: fix.longitude,
            timestamp: nowIso,
            accuracy: fix.accuracy,
          });
          lastSaveRef.current = Date.now();
          queryClient.invalidateQueries({ queryKey: ['locationHistory'] });
        }
        queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });
      } catch (error) {
        console.warn('Location heartbeat failed:', error?.message);
      }
    };

    heartbeat();
    const heartbeatId = window.setInterval(heartbeat, 15000);
    return () => window.clearInterval(heartbeatId);
  }, [shouldTrack, user?.email, user?.role, user?.status, user?.assigned_location, activeEntry?.id, activeEntry?.location, activeEntry?.clock_in]);

  // Signed-in officers are tracked and receive the close warning.
  useEffect(() => {
    if (!shouldTrack) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '⚠️ Closing this tab will stop live location tracking. Are you sure you want to close?';
      return e.returnValue;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.warn('⚠️ Tab is now hidden. Location tracking continues but may be less reliable.');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
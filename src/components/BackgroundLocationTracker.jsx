import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { publishLiveLocation } from '@/lib/liveLocationService';

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
          '-created_date',
          10
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

  // One authoritative GPS feed for EVERY authenticated Pathfinder user. Duty status
  // is context only; being signed into the app is what activates location tracking.
  const shouldTrack = !!user?.email;
  const shouldPublish = !!user?.email;

  // Mutation to create geofence alert
  const createGeofenceAlertMutation = useMutation({
    mutationFn: (data) => base44.entities.GeofenceAlert.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofenceAlerts'] });
    },
  });

  // Mutation to save location history
  const saveLocationHistoryMutation = useMutation({
    mutationFn: (data) => base44.entities.LocationHistory.create(data),
  });

  // Mutation to update or create ActiveOfficer record
  const updateActiveOfficerMutation = useMutation({
    mutationFn: async (data) => {
      if (activeOfficerRecordRef.current) {
        return await base44.entities.ActiveOfficer.update(activeOfficerRecordRef.current, data);
      } else {
        const newRecord = await base44.entities.ActiveOfficer.create(data);
        activeOfficerRecordRef.current = newRecord.id;
        return newRecord;
      }
    },
  });

  // Delete ActiveOfficer record when clocking out
  const deleteActiveOfficerMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.ActiveOfficer.delete(id);
    },
  });

  // Establish exactly one live-session record immediately on sign-in, even before
  // the first GPS fix. This lets Admin Location Tracker show "signed in / GPS pending".
  useEffect(() => {
    if (!shouldPublish) return;

    const getActiveOfficerRecord = async () => {
      try {
        const records = await base44.entities.ActiveOfficer.filter({ officer_email: user.email });
        const newest = records.length > 0
          ? [...records].sort((a, b) => new Date(b.last_update || b.updated_date || b.created_date || 0).getTime() - new Date(a.last_update || a.updated_date || a.created_date || 0).getTime())[0]
          : null;
        const sessionData = {
          officer_email: user.email,
          officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
          clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
          last_update: new Date().toISOString(),
          status: user?.status || 'Signed In',
          user_role: user?.role || 'user',
          session_active: true,
          latitude: null,
          longitude: null,
          accuracy: null,
        };
        if (newest) {
          activeOfficerRecordRef.current = newest.id;
          await base44.entities.ActiveOfficer.update(newest.id, sessionData);
          await Promise.all(records.filter(record => record.id !== newest.id).map(record => base44.entities.ActiveOfficer.delete(record.id).catch(() => null)));
        } else {
          const created = await base44.entities.ActiveOfficer.create(sessionData);
          activeOfficerRecordRef.current = created.id;
        }
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
      lastPositionRef.current = normalizedFix;
      publishLiveLocation(normalizedFix);

      // Reject extremely inaccurate location readings (over 500 meters)
      if (accuracy > 500) {
        console.warn(`GPS accuracy too low: ${accuracy.toFixed(0)}m - waiting for better signal`);
        return;
      }

      if (!shouldPublish) return;

      try {
        // Limit server writes to one live GPS update every 5 seconds. Browser GPS can
        // emit multiple fixes per second, which previously contributed to API throttling.
        if (now - lastLivePushRef.current < 5000) return;
        lastLivePushRef.current = now;

        // Always update ActiveOfficer for the app-wide authoritative live position.
        updateActiveOfficerMutation.mutate({
          officer_email: user.email,
          officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          unit_number: user.unit_number || '',
          current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
          clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
          last_update: new Date().toISOString(),
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
            const sharedPolygon = (siteLocation.geofence_polygon?.length >= 3
              ? siteLocation.geofence_polygon
              : siteLocation.property_monitoring_polygon) || [];
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
            }
          }
        }


      } catch (error) {
        console.error('Failed to save location:', error);
      }
    };

    // Use watchPosition for continuous tracking with maximum accuracy settings
    watchIdRef.current = navigator.geolocation.watchPosition(
      saveLocation,
      (error) => console.error('Geolocation error:', error),
      {
        enableHighAccuracy: true, // Force GPS, not cell tower
        timeout: 30000,
        maximumAge: 2000, // Permit only a very recent fix; never reuse old city-level cache
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [shouldTrack, shouldPublish, activeEntry, user, locations]);

  // Independent one-minute heartbeat. This runs even when the device is stationary
  // and watchPosition does not emit a new event. It keeps the signed-in session fresh
  // and writes one historical breadcrumb per minute from the latest valid GPS fix.
  useEffect(() => {
    if (!shouldTrack || !user?.email) return undefined;

    const heartbeat = async () => {
      const nowIso = new Date().toISOString();
      const fix = lastPositionRef.current;
      try {
        if (activeOfficerRecordRef.current) {
          await base44.entities.ActiveOfficer.update(activeOfficerRecordRef.current, {
            officer_email: user.email,
            officer_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
            current_location: activeEntry?.location || user?.current_location || user?.assigned_location || 'Signed In',
            clock_in_time: activeEntry?.clock_in || sessionStartedRef.current,
            last_update: nowIso,
            ...(fix ? { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy } : {}),
            status: user?.status || 'Signed In',
            user_role: user?.role || 'user',
            session_active: true,
          });
        }
        if (fix && Date.now() - lastSaveRef.current >= 55000) {
          await base44.entities.LocationHistory.create({
            time_entry_id: activeEntry?.id || '',
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
    const heartbeatId = window.setInterval(heartbeat, 60000);
    return () => window.clearInterval(heartbeatId);
  }, [shouldTrack, user?.email, user?.role, user?.status, user?.assigned_location, activeEntry?.id, activeEntry?.location, activeEntry?.clock_in]);

  // All signed-in users are tracked, but only clocked-in users get a close warning.
  useEffect(() => {
    if (!shouldTrack || !activeEntry) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '⚠️ WARNING: You are currently clocked in. Closing this tab will stop location tracking. Are you sure you want to close?';
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
  }, [shouldTrack, activeEntry]);

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
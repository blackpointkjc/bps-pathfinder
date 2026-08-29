import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, MapPin, Clock, Activity, Users, History, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Circle, MapContainer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isInternalMember } from '@/lib/directoryUtils';
import { listOfficerDirectory } from '@/lib/appDirectory';
import { getOfficerLocationHistory, getOfficerLocationSnapshot, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import PathfinderTileLayer, { MapThemeToggle, usePathfinderMapTheme } from '@/components/map/PathfinderTileLayer';

const LOGO_URL = "/black-point-shield.webp";

// Use one app-wide live-location window. A signed-in officer stays visible for up to
// 15 minutes after the latest session/GPS heartbeat, matching the system health
// check and preventing a brief browser/GPS pause from making the unit disappear.
const LIVE_SESSION_FRESH_MS = 15 * 60 * 1000;

const isOperationallyVisibleUser = isInternalMember;

const hasCoordinateValue = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
const hasValidCoordinates = item => hasCoordinateValue(item?.latitude)
  && hasCoordinateValue(item?.longitude)
  && Math.abs(Number(item.latitude)) <= 90
  && Math.abs(Number(item.longitude)) <= 180
  && !(Number(item.latitude) === 0 && Number(item.longitude) === 0);

// Custom marker icons
const clockInIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iNDUiIHZpZXdCb3g9IjAgMCAzMCA0NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTUgMEMxMCAwIDAgNSAwIDE1YzAgMTAgMTUgMzAgMTUgMzBzMTUtMjAgMTUtMzBjMC0xMC0xMC0xNS0xNS0xNXoiIGZpbGw9IiMyMmMzNWUiLz48Y2lyY2xlIGN4PSIxNSIgY3k9IjE1IiByPSI4IiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -45]
});

const clockOutIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iNDUiIHZpZXdCb3g9IjAgMCAzMCA0NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTUgMEMxMCAwIDAgNSAwIDE1YzAgMTAgMTUgMzAgMTUgMzBzMTUtMjAgMTUtMzBjMC0xMC0xMC0xNS0xNS0xNXoiIGZpbGw9IiNlZjQ0NDQiLz48Y2lyY2xlIGN4PSIxNSIgY3k9IjE1IiByPSI4IiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==',
  iconSize: [30, 45],
  iconAnchor: [15, 45],
  popupAnchor: [0, -45]
});

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapReadyHandler() {
  const map = useMap();
  useEffect(() => {
    // Leaflet caches the container size at init. When the map mounts inside a
    // flex layout that is still computing its dimensions (very common here, where
    // the card appears after officer data loads), it measures 0×0 and renders a
    // blank/gray map with no tile requests. Force a re-measure on the next frame
    // and watch the container for later size changes.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const ro = new ResizeObserver(() => map.invalidateSize());
    if (map.getContainer()) ro.observe(map.getContainer());
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

function MapUpdater({ officers, historicalPath, clockInLocation, clockOutLocation }) {
  const map = useMap();
  
  useEffect(() => {
    if (historicalPath && historicalPath.length > 0) {
      const bounds = [];
      
      // Add clock-in location
      if (clockInLocation && hasValidCoordinates(clockInLocation)) {
        bounds.push([Number(clockInLocation.latitude), Number(clockInLocation.longitude)]);
      }
      
      // Add only valid path points; Leaflet will throw when a null coordinate reaches project().
      historicalPath.forEach(h => {
        if (hasValidCoordinates(h)) {
          bounds.push([Number(h.latitude), Number(h.longitude)]);
        }
      });
      
      // Add clock-out location
      if (clockOutLocation && hasValidCoordinates(clockOutLocation)) {
        bounds.push([Number(clockOutLocation.latitude), Number(clockOutLocation.longitude)]);
      }
      
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    } else if (officers && officers.length > 0) {
      const validOfficers = officers.filter(hasValidCoordinates);
      if (validOfficers.length > 0) {
        const bounds = validOfficers.map(o => [Number(o.latitude), Number(o.longitude)]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
  }, [officers, historicalPath, clockInLocation, clockOutLocation, map]);
  
  return null;
}

export default function AdminLocationTracker() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('live');
  const [selectedOfficerEmail, setSelectedOfficerEmail] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [checkingLocations, setCheckingLocations] = useState(false);
  const [locationCheckResults, setLocationCheckResults] = useState(null);
  const [lastAutoCheck, setLastAutoCheck] = useState(null);
  const [locationCheckError, setLocationCheckError] = useState('');
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [deviceLocationState, setDeviceLocationState] = useState(null);
  const [mapTheme, setMapTheme] = usePathfinderMapTheme();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasAccess = user?.role === 'admin';

  const { data: allUsers = [], error: officerDirectoryError } = useQuery({
    queryKey: ['officerDirectory', 'adminLocationTracker'],
    queryFn: () => listOfficerDirectory('last_name', 1000, true),
    enabled: hasAccess,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: activeOfficerPayload = {} } = useQuery({
    queryKey: ['activeOfficerLocations'],
    queryFn: async () => {
      return getOfficerLocationSnapshot({ locationOnly: true });
    },
    // ActiveOfficer subscriptions refresh immediately when data changes. Keep a
    // 30-second safety poll instead of repeatedly hitting the backend.
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
    enabled: hasAccess && !!allUsers,
  });

  const activeOfficerLocations = activeOfficerPayload.units || [];
  useEffect(() => {
    if (!hasAccess) return undefined;
    const unsubscribe = subscribeOfficerLocationChanges(() => {
      queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });
    });
    return unsubscribe;
  }, [hasAccess, queryClient]);

  useEffect(() => {
    const handleLocationQuality = (event) => setDeviceLocationState(event?.detail || null);
    const handleMapFailure = () => setMapUnavailable(true);
    const handleMapLoaded = () => setMapUnavailable(false);
    window.addEventListener('bps-location-quality', handleLocationQuality);
    window.addEventListener('bps-map-tiles-failed', handleMapFailure);
    window.addEventListener('bps-map-tiles-loaded', handleMapLoaded);
    return () => {
      window.removeEventListener('bps-location-quality', handleLocationQuality);
      window.removeEventListener('bps-map-tiles-failed', handleMapFailure);
      window.removeEventListener('bps-map-tiles-loaded', handleMapLoaded);
    };
  }, []);

  const newestLocationByEmail = React.useMemo(() => {
    const map = new Map();
    for (const row of activeOfficerLocations || []) {
      const email = String(row.officer_email || '').toLowerCase();
      if (!email) continue;
      const stamp = new Date(row.last_update || row.updated_date || row.created_date || 0).getTime();
      const existing = map.get(email);
      const existingStamp = existing ? new Date(existing.last_update || existing.updated_date || existing.created_date || 0).getTime() : -Infinity;
      if (!existing || stamp > existingStamp) map.set(email, row);
    }
    return map;
  }, [activeOfficerLocations]);

  // The live feed is restricted server-side to signed-in officers with a fresh
  // ActiveOfficer ping. This client-side freshness check is
  // only a final display safeguard.
  const currentlyActiveOfficers = React.useMemo(() => {
    const now = Date.now();
    return [...newestLocationByEmail.values()].filter(locationData => {
      const stamp = new Date(locationData.last_update || locationData.updated_date || locationData.created_date || 0).getTime();
      return Number.isFinite(stamp) && now - stamp <= LIVE_SESSION_FRESH_MS;
    }).map(locationData => {
      const profile = allUsers?.find(u => String(u.email || '').toLowerCase() === String(locationData.officer_email || '').toLowerCase());
      if (!isOperationallyVisibleUser(profile)) return null;
      return {
        ...locationData,
        id: locationData.id,
        current_location: locationData.current_location || profile?.assigned_location || 'Signed In',
        clock_in_time: locationData.clock_in_time,
        user_role: locationData.user_role || profile?.role || 'user',
        user_status: locationData.status || profile?.status || 'Signed In',
        gps_pending: !hasValidCoordinates(locationData),
      };
    }).filter(Boolean);
  }, [newestLocationByEmail, allUsers]);

  // Historical movement is session-based, not shift-based. Any authenticated user
  // can be reviewed for any date, including admins and users who never clocked in.
  const { data: locationHistory } = useQuery({
    queryKey: ['locationHistory', selectedOfficerEmail, selectedDate],
    queryFn: async () => {
      if (!selectedOfficerEmail || !selectedDate) return [];
      const allHistory = await getOfficerLocationHistory(selectedOfficerEmail);
      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(`${selectedDate}T23:59:59.999`);
      return (allHistory || []).filter(h => {
        const timestamp = new Date(h.timestamp);
        return timestamp >= start && timestamp <= end && hasValidCoordinates(h);
      }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },
    enabled: hasAccess && viewMode === 'history' && !!selectedOfficerEmail && !!selectedDate,
    refetchInterval: viewMode === 'history' ? 60000 : false,
  });

  const selectedSessionSummary = React.useMemo(() => {
    if (!locationHistory?.length) return null;
    return {
      first: locationHistory[0],
      last: locationHistory[locationHistory.length - 1],
      firstTime: locationHistory[0]?.timestamp,
      lastTime: locationHistory[locationHistory.length - 1]?.timestamp,
    };
  }, [locationHistory]);

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => String(u.email || '').toLowerCase() === String(email || '').toLowerCase());
    if (officer?.last_name) return [officer.rank, officer.last_name].filter(Boolean).join(' ');
    return officer?.unit_number ? `Unit ${officer.unit_number}` : 'Officer';
  };

  const performLocationCheck = async () => {
    try {
      setCheckingLocations(true);
      const freshPayload = await getOfficerLocationSnapshot({ locationOnly: true });
      const freshLocations = freshPayload.units || [];
      const freshClockedInWithoutSession = freshPayload.clocked_in_without_session || [];
      const freshUsers = allUsers || [];
      const latestByEmail = new Map();
      for (const row of freshLocations) {
        const key = String(row.officer_email || '').toLowerCase();
        if (!key || latestByEmail.has(key)) continue;
        latestByEmail.set(key, row);
      }
      const results = { total: 0, withLocation: [], withoutLocation: [], staleLocation: [], timestamp: new Date().toISOString() };
      const now = Date.now();
      for (const locationData of latestByEmail.values()) {
        const profile = freshUsers.find(u => String(u.email || '').toLowerCase() === String(locationData.officer_email || '').toLowerCase());
        if (!isOperationallyVisibleUser(profile)) continue;
        const gpsStamp = new Date(locationData.gps_updated_at || locationData.last_gps_updated_at || 0).getTime();
        const gpsAgeMs = Number.isFinite(gpsStamp) ? now - gpsStamp : Infinity;
        const name = profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : (profile.full_name || profile.email);
        const hasFreshGps = hasValidCoordinates(locationData)
          && gpsAgeMs <= LIVE_SESSION_FRESH_MS;
        const hadGps = Number.isFinite(gpsStamp) && gpsStamp > 0;
        const item = {
          name,
          email: profile.email,
          location: locationData.current_location || 'Signed in - GPS pending',
          role: profile.rank || profile.role || 'officer',
          lastUpdate: hadGps ? new Date(gpsStamp).toISOString() : null,
          minutesSinceUpdate: hadGps ? Math.max(0, Math.floor(gpsAgeMs / 60000)) : null,
          trackingState: hasFreshGps ? 'Live' : hadGps ? 'Last known' : 'Signed in - GPS unavailable',
        };
        results.total += 1;
        if (hasFreshGps) results.withLocation.push(item);
        else if (hadGps) results.staleLocation.push(item);
        else results.withoutLocation.push(item);
      }

      // A person who is still clocked in but no longer has a fresh Pathfinder
      // session is a tracking exception and must appear under No Location rather
      // than disappearing from the check entirely.
      for (const row of freshClockedInWithoutSession) {
        const profile = freshUsers.find(u => String(u.email || '').toLowerCase() === String(row.officer_email || '').toLowerCase());
        if (profile && !isOperationallyVisibleUser(profile)) continue;
        results.total += 1;
        results.withoutLocation.push({
          name: row.officer_name || (profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '') || row.officer_email,
          email: row.officer_email,
          location: row.current_location || 'Clocked in',
          role: row.rank || profile?.rank || profile?.role || 'officer',
          lastUpdate: null,
          minutesSinceUpdate: null,
          trackingState: 'CLOCKED IN • LOGGED OUT / NO ACTIVE SESSION',
          clockInTime: row.clock_in_time || null,
        });
      }
      setLocationCheckResults(results);
      setLastAutoCheck(new Date());
      queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });
      return results;
    } catch (error) {
      console.error("❌ Error checking locations:", error);
      throw error;
    } finally {
      setCheckingLocations(false);
    }
  };

  const handleCheckAllLocations = async () => {
    setLocationCheckError('');
    setDeviceLocationState({ state: 'requesting', message: 'Requesting a fresh location from this device…' });
    try {
      // Register before dispatching so a fast device fix cannot be missed. The
      // request waits long enough for a phone/tablet/Windows GPS radio to wake,
      // then checks every signed-in officer from the authoritative backend feed.
      await new Promise(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.removeEventListener('bps-location-quality', handleResult);
          window.clearTimeout(timeoutId);
          resolve();
        };
        const handleResult = event => {
          if (['live', 'permission_denied', 'unavailable', 'timeout', 'low_accuracy', 'stale'].includes(event?.detail?.state)) finish();
        };
        const timeoutId = window.setTimeout(finish, 16000);
        window.addEventListener('bps-location-quality', handleResult);
        window.dispatchEvent(new CustomEvent('bps-request-location'));
      });
      await performLocationCheck();
    } catch (error) {
      setLocationCheckError(error?.message || 'Failed to check user locations. Please try again.');
    }
  };

  useEffect(() => {
    if (viewMode === 'live' && hasAccess && allUsers) {
      const initialTimer = setTimeout(() => performLocationCheck(), 1500);
      const interval = setInterval(() => performLocationCheck(), 60000);
      return () => {
        clearTimeout(initialTimer);
        clearInterval(interval);
      };
    }
  }, [viewMode, hasAccess, allUsers]);  

  const officersWithLocation = (currentlyActiveOfficers?.filter(hasValidCoordinates) || []).map(o => ({
    ...o,
    gps_low_accuracy: Number.isFinite(Number(o.accuracy)) && Number(o.accuracy) > 150,
  }));
  const officersWithLastKnown = (currentlyActiveOfficers || [])
    .filter(o => !hasValidCoordinates(o)
      && hasCoordinateValue(o.last_known_latitude)
      && hasCoordinateValue(o.last_known_longitude)
      && !(Number(o.last_known_latitude) === 0 && Number(o.last_known_longitude) === 0))
    .map(o => {
      const gpsAt = new Date(o.last_gps_updated_at || o.gps_updated_at || 0).getTime();
      const accuracy = Number(o.last_known_accuracy);
      const hasFreshCoarseFix = Number.isFinite(gpsAt)
        && Date.now() - gpsAt <= 2 * 60 * 1000
        && Number.isFinite(accuracy)
        && accuracy > 100;
      return {
        ...o,
        latitude: Number(o.last_known_latitude),
        longitude: Number(o.last_known_longitude),
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        gps_low_accuracy: hasFreshCoarseFix,
        gps_stale: !hasFreshCoarseFix,
      };
    });
  const officersWithCoarseLocation = (currentlyActiveOfficers || [])
    .filter(o => !hasValidCoordinates(o)
      && !(hasCoordinateValue(o.last_known_latitude) && hasCoordinateValue(o.last_known_longitude))
      && hasCoordinateValue(o.coarse_latitude)
      && hasCoordinateValue(o.coarse_longitude)
      && !(Number(o.coarse_latitude) === 0 && Number(o.coarse_longitude) === 0))
    .map(o => ({
      ...o,
      latitude: Number(o.coarse_latitude),
      longitude: Number(o.coarse_longitude),
      accuracy: Number.isFinite(Number(o.coarse_accuracy)) ? Number(o.coarse_accuracy) : null,
      gps_low_accuracy: true,
      gps_stale: false,
    }));
  const officersForMap = [...officersWithLocation, ...officersWithLastKnown, ...officersWithCoarseLocation];
  const filteredOfficersForDropdown = allUsers?.filter(u => !!u.email && isOperationallyVisibleUser(u)).sort((a, b) => {
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email;
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email;
    return nameA.localeCompare(nameB);
  }) || [];

  if (!hasAccess) { // Updated to use hasAccess
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 pb-24 sm:p-4 md:p-8">
      <div className="mx-auto max-w-[1400px] space-y-5 sm:space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <img src={LOGO_URL} alt="Black Point Protection" className="w-16 h-16 object-contain" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-8 h-8 text-green-600" />
              User Location Tracker
            </h1>
            <p className="text-slate-600">Live GPS and one-minute movement history while officers are signed into the app</p>
            {lastAutoCheck && (
              <p className="text-xs text-slate-500 mt-1">
                Last live check: {format(lastAutoCheck, 'h:mm:ss a')} • Signed-in GPS heartbeat: every 15 seconds
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2"><MapThemeToggle theme={mapTheme} onChange={setMapTheme} /><Button
            onClick={handleCheckAllLocations}
            disabled={checkingLocations}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {checkingLocations ? (
              <>
                <Activity className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4 mr-2" />
                Check All Locations Now
              </>
            )}
          </Button></div>
        </div>

        {deviceLocationState && ['permission_denied', 'unavailable', 'timeout', 'low_accuracy', 'stale'].includes(deviceLocationState.state) && (
          <Alert className="border-amber-400 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-950">
              {deviceLocationState.state === 'permission_denied'
                ? 'Location permission is blocked on this device. Allow precise location for Pathfinder in the browser site settings, then select Check All Locations Now.'
                : deviceLocationState.state === 'low_accuracy'
                  ? `This device reported an imprecise location${deviceLocationState.accuracy ? ` (about ${Math.round(deviceLocationState.accuracy)} meters)` : ''}. Enable precise location or GPS and try again.`
                  : deviceLocationState.state === 'stale'
                    ? 'The browser returned a cached location. Pathfinder is retrying automatically for a current device fix.'
                    : 'This device could not provide a current GPS location. Turn on device location services and try again.'}
            </AlertDescription>
          </Alert>
        )}

        {(officerDirectoryError || locationCheckError) && (
          <Alert className="border-red-300 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-900">
              {officerDirectoryError
                ? `Unable to load the Officer directory: ${officerDirectoryError.message}. Refresh this page to retry.`
                : locationCheckError}
            </AlertDescription>
          </Alert>
        )}

        {locationCheckResults && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Location Check Results - {format(new Date(locationCheckResults.timestamp), 'h:mm:ss a')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-900">Tracking Active</span>
                  </div>
                  <p className="text-3xl font-bold text-green-900">{locationCheckResults.withLocation.length}</p>
                  <p className="text-sm text-green-700">Officers with current GPS</p>
                </div>

                <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span className="font-semibold text-amber-900">Stale Location</span>
                  </div>
                  <p className="text-3xl font-bold text-amber-900">{locationCheckResults.staleLocation.length}</p>
                  <p className="text-sm text-amber-700">GPS not updating</p>
                </div>

                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="font-semibold text-red-900">No Location</span>
                  </div>
                  <p className="text-3xl font-bold text-red-900">{locationCheckResults.withoutLocation.length}</p>
                  <p className="text-sm text-red-700">GPS unavailable</p>
                </div>
              </div>

              {locationCheckResults.withLocation.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Signed-In Users with Active GPS
                  </h3>
                  <div className="space-y-2">
                    {locationCheckResults.withLocation.map((officer, idx) => (
                      <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-green-900">{officer.name}</p>
                          <p className="text-sm text-green-700">{officer.location}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-green-600">Last Update</p>
                          <p className="text-sm font-medium text-green-900">
                            {officer.lastUpdate ? format(new Date(officer.lastUpdate), 'h:mm:ss a') : 'N/A'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {locationCheckResults.staleLocation.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Officers with Last-Known Tracking
                  </h3>
                  <Alert className="bg-amber-50 border-amber-300 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-900">
                      These officers have a previous tracker record, but it is not currently live. Their last-known time and location remain available for review.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    {locationCheckResults.staleLocation.map((officer, idx) => (
                      <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-amber-900">{officer.name}</p>
                          <p className="text-sm text-amber-700">{officer.location}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-amber-600">Last Update</p>
                          <p className="text-sm font-medium text-amber-900">
                            {officer.minutesSinceUpdate === null ? 'No recorded update' : `${officer.minutesSinceUpdate} min ago`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {locationCheckResults.withoutLocation.length > 0 && (
                <div>
                  <h3 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Officers Without Live GPS
                  </h3>
                  <Alert className="bg-red-50 border-red-300 mb-3">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-900">
                      These officers have no tracker record or have a current session without a usable GPS fix. Check device location permission and Pathfinder sign-in.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    {locationCheckResults.withoutLocation.map((officer, idx) => (
                      <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-red-900">{officer.name}</p>
                          <p className="text-sm text-red-700">{officer.location}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-red-600">Tracking Status</p>
                          <p className="text-sm font-medium text-red-900">{officer.trackingState} • {String(officer.role || 'officer').toUpperCase()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Tracking Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:gap-4">
              <Button
                variant={viewMode === 'live' ? 'default' : 'outline'}
                onClick={() => setViewMode('live')}
                className="flex items-center gap-2"
              >
                <Activity className="w-4 h-4" />
                Live Tracking
              </Button>
              <Button
                variant={viewMode === 'history' ? 'default' : 'outline'}
                onClick={() => setViewMode('history')}
                className="flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                Historical Movement
              </Button>
            </div>

            {viewMode === 'history' && (
              <div className="mt-6 grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="officer_select">Select User</Label>
                  <Select value={selectedOfficerEmail} onValueChange={setSelectedOfficerEmail}>
                    <SelectTrigger id="officer_select">
                      <SelectValue placeholder="Choose a user..." />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-60 overflow-y-auto z-50">
                      {filteredOfficersForDropdown.map((officer) => (
                        <SelectItem key={officer.email} value={officer.email}>
                          {officer.first_name && officer.last_name 
                            ? `${officer.first_name} ${officer.last_name}` 
                            : officer.full_name || officer.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date_select">Select Date</Label>
                  <Input
                    id="date_select"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {viewMode === 'live' && (
          <>
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="border-none shadow-lg bg-gradient-to-br from-green-600 to-green-700">
                <CardHeader>
                  <CardTitle className="text-slate-900 text-sm font-medium flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-900" />
                    Users Signed In Now
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold text-slate-900">{currentlyActiveOfficers?.length || 0}</div>
                  <p className="text-xs text-slate-900 mt-1">Active app sessions</p>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    GPS Tracking Active
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold text-slate-900">{officersForMap.length}</div>
                  <p className="text-xs text-slate-500 mt-1">Live, low-accuracy, or last-known location data</p>
                </CardContent>
              </Card>

              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-600" />
                    Update Frequency
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">Live</div>
                   <p className="text-xs text-slate-500 mt-1">Instant entity updates · 15 sec safety refresh · history every 60 sec</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-none shadow-xl">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-green-600" />
                    Live and Last-Known Map - Signed-In Users
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {mapUnavailable && (
                    <Alert className="m-4 border-amber-400 bg-amber-50">
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                      <AlertDescription className="text-amber-950">
                        The map background could not load from either map provider. Officer GPS data remains available below; check the network connection and refresh to retry.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="relative h-[360px] w-full sm:h-[500px] lg:h-[600px]">
                    <MapContainer
                      center={[37.5407, -77.4360]}
                      zoom={12}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <MapReadyHandler />
                      <PathfinderTileLayer theme={mapTheme} />
                      <MapUpdater officers={officersForMap} historicalPath={null} />
                      {officersForMap.map((officer) => (
                        <React.Fragment key={`${officer.id}-${Number(officer.latitude).toFixed(6)}-${Number(officer.longitude).toFixed(6)}-${officer.last_update || ''}`}>
                        {officer.gps_low_accuracy && Number.isFinite(Number(officer.accuracy)) && <Circle center={[Number(officer.latitude), Number(officer.longitude)]} radius={Math.max(25, Number(officer.accuracy))} pathOptions={{ color:'#f59e0b', weight:1.5, fillOpacity:.08, dashArray:'6 6' }} />}
                        <CircleMarker
                          center={[Number(officer.latitude), Number(officer.longitude)]}
                          radius={officer.gps_stale ? 7 : 9}
                          pathOptions={{
                            color: '#ffffff',
                            weight: 2,
                            fillColor: officer.gps_stale ? '#94a3b8' : officer.gps_low_accuracy ? '#f59e0b' : '#2563eb',
                            fillOpacity: officer.gps_stale ? 0.55 : 0.95,
                          }}
                        >
                          <Popup autoPan={false}>
                            <div className="p-2">
                              <p className="font-bold text-slate-900">{getOfficerName(officer.officer_email)}</p>
                              <p className="text-sm text-slate-600">{officer.current_location}</p>
                              <p className="text-xs text-slate-500">
                                Session/shift started: {officer.clock_in_time ? format(new Date(officer.clock_in_time), 'h:mm a') : 'N/A'}
                              </p>
                              <p className={`text-xs ${officer.gps_stale || officer.gps_low_accuracy ? 'font-bold text-amber-700' : 'text-green-600'}`}>
                                {officer.gps_stale ? 'LAST KNOWN GPS' : officer.gps_low_accuracy ? `LOW ACCURACY GPS${officer.accuracy ? ` ±${Math.round(Number(officer.accuracy))}m` : ''}` : 'LIVE GPS'}: {(officer.gps_updated_at || officer.last_gps_updated_at)
                                  ? format(new Date(officer.gps_updated_at || officer.last_gps_updated_at), 'h:mm:ss a')
                                  : 'No GPS data'}
                              </p>
                              {(officer.gps_stale || officer.gps_low_accuracy) && (
                                <p className="mt-1 text-[10px] font-bold text-red-700">Not eligible for automatic dispatch until fresh, precise GPS returns.</p>
                              )}
                            </div>
                          </Popup>
                        </CircleMarker>
                        </React.Fragment>
                      ))}
                    </MapContainer>
                    {officersForMap.length === 0 && (
                      <div className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-lg border border-amber-300 bg-white/95 px-4 py-2 text-center text-xs font-bold text-slate-800 shadow-lg">
                        Street map is online. Waiting for a valid officer location fix.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentlyActiveOfficers?.map((officer) => (
                <Card key={officer.id} className="border-none shadow-xl hover:shadow-2xl transition-shadow">
                  <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {getOfficerName(officer.officer_email).charAt(0)}
                          </span>
                        </div>
                        <span className="text-slate-900">{getOfficerName(officer.officer_email)}</span>
                      </div>
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" title="Active" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500">Current Location</p>
                        <p className="text-sm font-semibold text-slate-900">{officer.current_location}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500">Session / Shift Started</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {officer.clock_in_time ? format(new Date(officer.clock_in_time), 'h:mm a') : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Activity className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500">Last Update</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {officer.last_update ? format(new Date(officer.last_update), 'h:mm:ss a') : 'No GPS data'}
                        </p>
                      </div>
                    </div>
                    {officer.latitude && officer.longitude && (
                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-xs text-slate-500 font-mono">
                          GPS: {officer.latitude.toFixed(6)}, {officer.longitude.toFixed(6)}
                        </p>
                        <a
                          href={`https://www.google.com/maps?q=${officer.latitude},${officer.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View on Google Maps →
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {!currentlyActiveOfficers?.length && (
              <Card className="border-none shadow-lg">
                <CardContent className="p-12 text-center">
                  <Activity className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500">No signed-in users are currently reporting a session heartbeat</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {viewMode === 'history' && selectedOfficerEmail && locationHistory?.length > 0 && selectedSessionSummary && (
          <Card className="border-none shadow-xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                Movement History for {getOfficerName(selectedOfficerEmail)} on {format(new Date(selectedDate + 'T00:00:00'), 'MMMM d, yyyy')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-4 bg-blue-50 border-b">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">First Ping</p>
                    <p className="text-lg font-bold text-blue-900">
                      {format(new Date(selectedSessionSummary.firstTime), 'h:mm a')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">Last Ping</p>
                    <p className="text-lg font-bold text-blue-900">
                      {format(new Date(selectedSessionSummary.lastTime), 'h:mm a')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">Location Points</p>
                    <p className="text-lg font-bold text-blue-900">
                      {locationHistory?.length || 0} recorded
                    </p>
                  </div>
                </div>
              </div>
              
              {locationHistory && locationHistory.length > 0 ? (
                <>
                  {mapUnavailable && (
                    <Alert className="m-4 border-amber-400 bg-amber-50">
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                      <AlertDescription className="text-amber-950">
                        The historical map background could not load. Recorded GPS points and timestamps remain available.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="h-[360px] w-full sm:h-[500px] lg:h-[600px]">
                  <MapContainer
                    center={[37.5407, -77.4360]}
                    zoom={12}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <MapReadyHandler />
                    <PathfinderTileLayer theme={mapTheme} />
                    <MapUpdater 
                      officers={[]} 
                      historicalPath={locationHistory}
                      clockInLocation={locationHistory[0]}
                      clockOutLocation={locationHistory[locationHistory.length - 1]}
                    />
                    
                    {/* Draw the path line */}
                    <Polyline
                      positions={locationHistory.map(h => [Number(h.latitude), Number(h.longitude)])}
                      color="#3b82f6"
                      weight={4}
                      opacity={0.8}
                    />

                    {/* Every one-minute historical ping is visible and individually inspectable. */}
                    {locationHistory.map((ping, index) => (
                      <CircleMarker
                        key={`${ping.id || ping.timestamp}-${index}`}
                        center={[Number(ping.latitude), Number(ping.longitude)]}
                        radius={5}
                        pathOptions={{ color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2 }}
                      >
                        <Popup autoPan={false}>
                          <div className="p-2">
                            <p className="font-bold text-slate-900">PING #{index + 1}</p>
                            <p className="text-sm font-semibold">{format(new Date(ping.timestamp), 'h:mm:ss a')}</p>
                            <p className="text-xs text-slate-600 mt-1">{ping.location || 'Signed In'}</p>
                            <p className="text-xs text-slate-500">GPS ±{Math.round(Number(ping.accuracy || 0))}m</p>
                            <p className="text-xs text-slate-500 font-mono">{Number(ping.latitude).toFixed(6)}, {Number(ping.longitude).toFixed(6)}</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                    
                    {/* First ping marker (green) */}
                    <Marker 
                      position={[Number(locationHistory[0].latitude), Number(locationHistory[0].longitude)]}
                      icon={clockInIcon}
                    >
                      <Popup autoPan={false}>
                        <div className="p-2">
                          <p className="font-bold text-green-700 text-lg">🟢 FIRST PING</p>
                          <p className="text-sm font-semibold">{format(new Date(selectedSessionSummary.firstTime), 'h:mm:ss a')}</p>
                          <p className="text-xs text-slate-600 mt-1">{selectedSessionSummary.first?.location || 'Signed In'}</p>
                          <p className="text-xs text-slate-500">
                            {locationHistory[0].latitude.toFixed(6)}, {locationHistory[0].longitude.toFixed(6)}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                    
                    {/* Clock Out marker (red) - only if different from clock in */}
                    {locationHistory.length > 1 && (
                      <Marker 
                        position={[
                          Number(locationHistory[locationHistory.length - 1].latitude), 
                          Number(locationHistory[locationHistory.length - 1].longitude)
                        ]}
                        icon={clockOutIcon}
                      >
                        <Popup autoPan={false}>
                          <div className="p-2">
                            <p className="font-bold text-red-700 text-lg">🔴 LATEST PING</p>
                            <p className="text-sm font-semibold">{format(new Date(selectedSessionSummary.lastTime), 'h:mm:ss a')}</p>
                            <p className="text-xs text-slate-600 mt-1">{selectedSessionSummary.last?.location || 'Signed In'}</p>
                            <p className="text-xs text-slate-500">
                              {locationHistory[locationHistory.length - 1].latitude.toFixed(6)}, 
                              {locationHistory[locationHistory.length - 1].longitude.toFixed(6)}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    )}
                  </MapContainer>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center">
                  <History className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500">No location points recorded for this user on this date</p>
                  <p className="text-xs text-slate-400 mt-2">The user may not have signed in, may have denied location permission, or may have had the app fully closed.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {viewMode === 'history' && selectedOfficerEmail && (!locationHistory || locationHistory.length === 0) && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <History className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No GPS history found for {getOfficerName(selectedOfficerEmail)} on {format(new Date(selectedDate + 'T00:00:00'), 'MMMM d, yyyy')}</p>
              <p className="text-xs text-slate-400 mt-2">History is recorded once per minute while the user is signed into Pathfinder and location permission is available.</p>
            </CardContent>
          </Card>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Live Tracking:</strong> Shows operational signed-in users such as admins, supervisors, dispatchers, support staff, and officers. Client, student, and pending accounts are intentionally hidden from this operational display even though session tracking remains internal. GPS uses the single app-wide location service.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Check All Locations Now:</strong> Checks all recent signed-in session records and separates users with current GPS, users signed in with GPS unavailable, and recently stale sessions.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Historical Tracking:</strong> Select any user and date to view the one-minute movement trail recorded while they were signed in. The green marker is the first recorded ping and the red marker is the latest recorded ping for that date.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Tracking Scope:</strong> Location tracking is active for every authenticated app session, regardless of duty role or clock-in status, and ends when the app session is no longer active. Location history is recorded at one-minute intervals when GPS permission is available.
          </p>
        </div>
      </div>
    </div>
  );
}
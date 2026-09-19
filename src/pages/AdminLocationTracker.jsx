import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, MapPin, Clock, Activity, Users, History, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Circle, MapContainer, Popup, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isInternalMember } from '@/lib/directoryUtils';
import { listOfficerDirectory } from '@/lib/appDirectory';
import { getOfficerLocationSnapshot, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import PathfinderTileLayer, { MapThemeToggle, usePathfinderMapTheme } from '@/components/map/PathfinderTileLayer';

import GPSAuditReport from '@/components/GPSAuditReport';
import { auditDay, auditTime, buildAuditModel } from '@/lib/locationAudit';


// Use one app-wide live-location window. A signed-in officer stays visible for up to
// 15 minutes after the latest session/GPS heartbeat, matching the system health
// check and preventing a brief browser/GPS pause from making the unit disappear.
// Dispatch distance/ETA uses the backend's two-minute GPS freshness window.
// Keep the admin map label aligned with that rule so an old but geographically
// close point is never described as current GPS.
const LIVE_GPS_FRESH_MS = 5 * 60 * 1000;

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

function HistoricalOfficerMap({ data, officerName, theme }) {
  const model = React.useMemo(() => buildAuditModel(data.history || []), [data.history]);
  if (!model.points.length) return <p className="rounded-lg border border-slate-600 p-4">No usable GPS positions recorded for {officerName} on {data.date}. Any other recorded pings remain in the report below.</p>;
  return <Card className="my-4 overflow-hidden">
    <CardHeader><CardTitle>{officerName} · Historical Movement</CardTitle><p className="text-sm text-slate-500">{data.date} · {model.points.length} mapped pings · Eastern Time. Select a point for its recorded time and location.</p></CardHeader>
    <CardContent className="p-0"><div className="h-[420px] w-full sm:h-[540px]">
      <MapContainer key={data.date + officerName} center={[Number(model.points[0].latitude), Number(model.points[0].longitude)]} zoom={14} style={{height:'100%',width:'100%'}}>
        <MapReadyHandler /><PathfinderTileLayer theme={theme} /><MapUpdater officers={[]} historicalPath={model.points} />
        {model.segments.filter(segment=>segment.length>1).map((segment,index)=><Polyline key={index} positions={segment.map(point=>[Number(point.latitude),Number(point.longitude)])} pathOptions={{color:'#4f46e5',weight:4}} />)}
        {model.points.map((point,index)=><CircleMarker key={point.id || index} center={[Number(point.latitude),Number(point.longitude)]} radius={index===0 || index===model.points.length-1 ? 8 : 4} pathOptions={{color:'white',weight:1,fillColor:index===0?'#16a34a':index===model.points.length-1?'#dc2626':'#4f46e5',fillOpacity:.9}}>
          <Tooltip>{officerName} · {auditTime(point.timestamp)} ET · {Number.isFinite(Number(point.speed)) ? `${Math.round(Number(point.speed))} MPH` : 'Speed n/a'}</Tooltip>
          <Popup><strong>{officerName}</strong><p>{index===0?'Start · ':index===model.points.length-1?'End · ':''}{auditTime(point.timestamp)} ET</p><p>{point.location || 'Address not recorded'}</p><p>{Number(point.latitude).toFixed(6)}, {Number(point.longitude).toFixed(6)}</p><p>Speed: {Number.isFinite(Number(point.speed)) ? `${Math.round(Number(point.speed))} MPH` : 'Not recorded'}</p><p>Heading: {Number.isFinite(Number(point.heading)) ? `${Math.round(Number(point.heading))}°` : 'Not recorded'}</p><p>Accuracy: {point.accuracy == null ? 'Not recorded' : `±${Math.round(Number(point.accuracy))}m`}</p></Popup>
        </CircleMarker>)}
      </MapContainer>
    </div></CardContent>
  </Card>;
}

function MapUpdater({ officers, historicalPath, clockInLocation, clockOutLocation }) {
  const map = useMap();
  const didInitialRosterFitRef = React.useRef(false);
  const rosterKeyRef = React.useRef('');

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
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: false });
      }
    } else if (officers && officers.length > 0) {
      const validOfficers = officers.filter(hasValidCoordinates);
      if (validOfficers.length > 0) {
        const rosterKey = validOfficers
          .map(o => String(o.id || o.officer_email || 'unit'))
          .sort()
          .join('|');
        const liveOfficers = validOfficers.filter(o => o.session_active === true && o.gps_stale !== true);

        if (!didInitialRosterFitRef.current || rosterKeyRef.current !== rosterKey) {
          const bounds = validOfficers.map(o => [Number(o.latitude), Number(o.longitude)]);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: false });
          didInitialRosterFitRef.current = true;
          rosterKeyRef.current = rosterKey;
        } else if (liveOfficers.length === 1) {
          const unit = liveOfficers[0];
          map.panTo([Number(unit.latitude), Number(unit.longitude)], { animate: false, noMoveStart: true });
        }
      }
    }
  }, [officers, historicalPath, clockInLocation, clockOutLocation, map]);
  
  return null;
}

export default function AdminLocationTracker({ embedded = false }) {
  const backToLocations = () => {
    setViewMode('live');
    document.querySelector('main.mobile-field-content')?.scrollTo({top:0,behavior:'auto'});
  };
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('live');
  const [selectedOfficerEmail, setSelectedOfficerEmail] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => auditDay());
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
    queryFn: () => listOfficerDirectory('last_name', 1000),
    enabled: hasAccess,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });

  const { data: activeOfficerPayload = {}, error: activeOfficerError, isLoading: activeOfficerLoading, refetch: refetchActiveOfficerLocations } = useQuery({
    queryKey: ['activeOfficerLocations'],
    queryFn: async () => {
      return getOfficerLocationSnapshot({ locationOnly: true, includeLastKnown: true, force: true });
    },
    // Realtime events are primary. This low-frequency poll is only a recovery path
    // for browsers that temporarily lose their subscription connection.
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    enabled: hasAccess && !!allUsers,
  });

  const activeOfficerLocations = activeOfficerPayload.units || [];
  useEffect(() => {
    if (!hasAccess) return undefined;
    let refreshTimer;
    const refreshNow = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refetchActiveOfficerLocations({ cancelRefetch: true });
      }, 150);
    };
    const unsubscribe = subscribeOfficerLocationChanges(refreshNow);
    window.addEventListener('bps-live-location-persisted', refreshNow);
    window.addEventListener('bps-operational-resume', refreshNow);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener('bps-live-location-persisted', refreshNow);
      window.removeEventListener('bps-operational-resume', refreshNow);
      unsubscribe();
    };
  }, [hasAccess, refetchActiveOfficerLocations]);

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
  const trackedOfficers = React.useMemo(() => {
    return [...newestLocationByEmail.values()].map(locationData => {
      const profile = allUsers?.find(u => String(u.email || '').toLowerCase() === String(locationData.officer_email || '').toLowerCase());
      if (profile && !isOperationallyVisibleUser(profile)) return null;
      const rawLocation = String(locationData.current_location || '').trim();
      const locationIsPlaceholder = !rawLocation || ['signed in', 'clocked in', 'online', 'available'].includes(rawLocation.toLowerCase());
      const hasGps = hasValidCoordinates(locationData);
      const coordinateLabel = hasGps
        ? `GPS ${Number(locationData.latitude).toFixed(6)}, ${Number(locationData.longitude).toFixed(6)}`
        : '';
      const sessionActive = locationData.session_active === true;
      return {
        ...locationData,
        id: locationData.id,
        current_location: !locationIsPlaceholder
          ? rawLocation
          : (coordinateLabel || profile?.assigned_location || (sessionActive ? 'Location pending' : 'Last known location unavailable')),
        clock_in_time: sessionActive ? locationData.clock_in_time : null,
        user_role: locationData.user_role || profile?.role || 'user',
        user_status: sessionActive ? (locationData.status || profile?.status || 'Available') : 'Offline',
        gps_pending: sessionActive && !hasGps,
      };
    }).filter(Boolean);
  }, [newestLocationByEmail, allUsers]);

  const activeTrackedOfficers = React.useMemo(
    () => (trackedOfficers || []).filter(officer => officer.session_active === true),
    [trackedOfficers]
  );

  const { data: auditData, isLoading: auditLoading, error: auditError, refetch: retryAudit } = useQuery({
    queryKey: ['locationAuditReport', selectedOfficerEmail, selectedDate],
    queryFn: async () => {
      const response = await base44.functions.invoke('getLocationAuditReport', { officer_email: selectedOfficerEmail, date: selectedDate });
      const payload = response?.data?.data || response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      if (!Array.isArray(payload.history)) throw new Error("The GPS report response was incomplete. Please retry.");
      return payload;
    },
    enabled: hasAccess && viewMode === 'history' && !!selectedOfficerEmail && !!selectedDate,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: selectedDate === auditDay() ? 60000 : false,
  });

  useEffect(() => {
    if (!hasAccess || viewMode !== 'history' || !selectedOfficerEmail || !selectedDate) return undefined;
    let refreshTimer;
    const queueAuditRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => retryAudit(), 500);
    };
    const unsubscribers = [];
    for (const entity of [base44.entities.LocationHistory, base44.entities.GeofenceAlert, base44.entities.TimeEntry]) {
      try {
        const unsubscribe = entity.subscribe(queueAuditRefresh);
        if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
      } catch {
        // The recovery poll still keeps today's report current if a
        // browser temporarily cannot establish an entity subscription.
      }
    }
    return () => {
      window.clearTimeout(refreshTimer);
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [hasAccess, viewMode, selectedOfficerEmail, selectedDate, retryAudit]);

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => String(u.email || '').toLowerCase() === String(email || '').toLowerCase());
    if (officer?.last_name) return [officer.rank, officer.last_name].filter(Boolean).join(' ');
    return officer?.full_name || newestLocationByEmail.get(String(email || '').toLowerCase())?.officer_name || email || 'Officer';
  };

  const performLocationCheck = async () => {
    try {
      setCheckingLocations(true);
      const freshPayload = await getOfficerLocationSnapshot({ locationOnly: true, includeLastKnown: true });
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
        // Admin map responses may include an offline ActiveOfficer row only so
        // last-known GPS can still be inspected. Offline rows are historical
        // context, not current tracking exceptions, and must never appear under
        // "Officers Without Live GPS."
        if (locationData.session_active !== true) continue;
        const profile = freshUsers.find(u => String(u.email || '').toLowerCase() === String(locationData.officer_email || '').toLowerCase());
        if (profile && !isOperationallyVisibleUser(profile)) continue;
        const gpsStamp = new Date(locationData.gps_updated_at || locationData.last_gps_updated_at || 0).getTime();
        const gpsAgeMs = Number.isFinite(gpsStamp) ? now - gpsStamp : Infinity;
        const name = profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : (profile?.full_name || locationData.officer_name || locationData.officer_email);
        const hasFreshGps = locationData.session_active === true && hasValidCoordinates(locationData)
          && gpsAgeMs <= LIVE_GPS_FRESH_MS;
        const hadGps = Number.isFinite(gpsStamp) && gpsStamp > 0;
        const item = {
          name,
          email: profile?.email || locationData.officer_email,
          location: locationData.current_location || 'Signed in - GPS pending',
          role: profile?.rank || profile?.role || 'officer',
          lastUpdate: hadGps ? new Date(gpsStamp).toISOString() : null,
          minutesSinceUpdate: hadGps ? Math.max(0, Math.floor(gpsAgeMs / 60000)) : null,
          trackingState: hasFreshGps ? 'Live' : hadGps ? 'Signed in - GPS stale' : 'Signed in - GPS unavailable',
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
      const interval = setInterval(() => performLocationCheck(), 5 * 60 * 1000);
      return () => {
        clearTimeout(initialTimer);
        clearInterval(interval);
      };
    }
  }, [viewMode, hasAccess, allUsers]);  

  // Each officer's marker must follow their most recent device reading. A
  // precise fix from 30 minutes ago is not "where they are now" if a newer
  // (even coarse) fix exists — pick the newest valid coordinate and let the
  // accuracy circle communicate the uncertainty.
  const toLocTs = v => { const t = new Date(v || 0).getTime(); return Number.isFinite(t) ? t : 0; };
  const officersForMap = (trackedOfficers || [])
    .map(o => {
      const valid = (latitude, longitude) => hasValidCoordinates({ latitude, longitude });
      const candidates = [];
      if (valid(o.latitude, o.longitude)) candidates.push({ lat: Number(o.latitude), lng: Number(o.longitude), acc: Number(o.accuracy), ts: toLocTs(o.gps_updated_at), low: false, source: o.gps_source || 'browser_geolocation' });
      if (valid(o.last_known_latitude, o.last_known_longitude)) candidates.push({ lat: Number(o.last_known_latitude), lng: Number(o.last_known_longitude), acc: Number(o.last_known_accuracy), ts: toLocTs(o.last_gps_updated_at || o.gps_updated_at), low: false, source: o.last_known_gps_source || o.gps_source || '' });
      if (valid(o.coarse_latitude, o.coarse_longitude)) candidates.push({ lat: Number(o.coarse_latitude), lng: Number(o.coarse_longitude), acc: Number(o.coarse_accuracy), ts: toLocTs(o.coarse_gps_updated_at || o.gps_updated_at), low: true, source: o.gps_source || 'browser_geolocation' });
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.ts - a.ts);
      const best = candidates[0];
      const fallbackPosition = ['shift_clock_in', 'site_fallback'].includes(best.source);
      return {
        ...o,
        latitude: best.lat,
        longitude: best.lng,
        accuracy: Number.isFinite(best.acc) ? best.acc : null,
        gps_timestamp: best.ts || null,
        gps_display_source: best.source || '',
        gps_fallback: fallbackPosition,
        gps_low_accuracy: !fallbackPosition && (best.low || (Number.isFinite(best.acc) && best.acc > 100)),
        gps_stale: fallbackPosition || o.session_active === false || !best.ts || Date.now() - best.ts > LIVE_GPS_FRESH_MS,
      };
    })
    .filter(Boolean);
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
    <div className={embedded ? "bps-command-page min-h-0 bg-[#080d16] p-2 pb-4 text-white" : "bps-command-page min-h-screen bg-[#080d16] p-3 pb-24 text-white sm:p-4 md:p-8"}>
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        {viewMode === 'history' && <div className="mb-3"><Button variant="outline" onClick={backToLocations}>← Live tracker</Button></div>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">

          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-400">Location & Dispatch</div>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-black text-white sm:text-2xl">
              <Activity className="h-5 w-5 text-emerald-400" />
              User Location Tracker
            </h1>
            <p className="mt-1 text-xs text-slate-400">Live GPS, officer presence, historical movement, and location health in one workspace.</p>
            {lastAutoCheck && (
              <p className="text-xs text-slate-500 mt-1">
                Last live check: {format(lastAutoCheck, 'h:mm:ss a')} • GPS saved about once per minute
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
          <Alert className="border-amber-400/70 bg-amber-950/80 text-amber-50 shadow-lg">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <AlertDescription className="font-semibold leading-5 text-amber-50">
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
          <details className="rounded-xl border border-slate-700 bg-[#0a1623] shadow-lg">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs font-black text-white">
              <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300" />LOCATION HEALTH · {format(new Date(locationCheckResults.timestamp), 'h:mm:ss a')}</span>
              <span className="flex flex-wrap gap-1.5 text-[9px]">
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">{locationCheckResults.withLocation.length} LIVE</span>
                <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">{locationCheckResults.staleLocation.length} STALE</span>
                <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-200">{locationCheckResults.withoutLocation.length} NO GPS</span>
              </span>
            </summary>
            <div className="border-t border-slate-700 p-4">
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
            </div>
          </details>
        )}

        <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-[#0a1623] p-2 sm:flex-row sm:items-center">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={viewMode === 'live' ? 'default' : 'outline'}
              onClick={() => setViewMode('live')}
              className="h-9 gap-2"
            >
              <Activity className="h-4 w-4" />
              Live Tracking
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'history' ? 'default' : 'outline'}
              onClick={() => setViewMode('history')}
              className="h-9 gap-2"
            >
              <History className="h-4 w-4" />
              Historical Movement
            </Button>
          </div>

            {viewMode === 'history' && (
              <div className="grid flex-1 gap-2 md:grid-cols-2">
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
        </div>

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
                  <div className="text-4xl font-black text-emerald-200">{activeTrackedOfficers.length}</div>
                  <p className="text-xs text-slate-900 mt-1">Active app sessions</p>
                </CardContent>
              </Card>

              <Card className="border border-slate-700 bg-[#0d1927] text-slate-100 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    GPS Tracking Active
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-black text-white">{officersForMap.length}</div>
                  <p className="text-xs text-slate-500 mt-1">Live, low-accuracy, or last-known location data</p>
                </CardContent>
              </Card>

              <Card className="border border-slate-700 bg-[#0d1927] text-slate-100 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-600" />
                    Update Frequency
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-emerald-300">LIVE</div>
                   <p className="mt-1 text-xs text-slate-500">Realtime map refresh · moving GPS about every 7 sec · speed/heading saved in movement history</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border border-emerald-500/25 bg-[#0d1927] text-slate-100 shadow-xl">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-green-600" />
                    Officer Locations · Live and Last Known
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
                  {activeOfficerError && <Alert className="m-4" variant="destructive"><AlertDescription>Officer locations could not load. {activeOfficerError.message}</AlertDescription></Alert>}
                  <p className="px-4 py-3 text-sm text-slate-500">{activeOfficerLoading ? 'Loading officer locations…' : `${officersForMap.length} officers on map. Blue: recent GPS. Gray: last known; the officer may be offline.`}</p>
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
                          <Tooltip permanent direction="top">{getOfficerName(officer.officer_email)}{officer.gps_stale ? " · Last known" : ` · ${Math.round(Number(officer.speed || 0))} MPH`}</Tooltip>
                          <Popup autoPan={false} className="bps-location-popup">
                            <div className="min-w-[270px] max-w-[340px] rounded-xl bg-[#08111d] p-4 text-white shadow-2xl">
                              <p className="text-base font-black text-white">{getOfficerName(officer.officer_email)}</p>
                              <p className="mt-2 text-sm font-semibold leading-5 text-slate-100">{officer.current_location}</p>
                              <p className="mt-3 text-xs font-semibold text-slate-300">
                                Session/shift started: {officer.clock_in_time ? format(new Date(officer.clock_in_time), 'h:mm a') : 'N/A'}
                              </p>
                              <p className={`mt-3 text-xs font-black ${officer.gps_stale || officer.gps_low_accuracy ? 'text-amber-300' : 'text-emerald-300'}`}>
                                {officer.gps_display_source === 'site_fallback'
                                  ? 'CONFIGURED SITE POSITION'
                                  : officer.gps_display_source === 'shift_clock_in'
                                    ? 'SHIFT CLOCK-IN POSITION'
                                    : officer.gps_stale
                                      ? 'LAST KNOWN GPS'
                                      : officer.gps_low_accuracy
                                        ? `LOW ACCURACY GPS${officer.accuracy ? ` ±${Math.round(Number(officer.accuracy))}m` : ''}`
                                        : 'LIVE GPS'}: {officer.gps_timestamp
                                  ? format(new Date(officer.gps_timestamp), 'h:mm:ss a')
                                  : 'No GPS data'}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-black text-cyan-100">{Math.round(Number(officer.speed || 0))} MPH</span>
                                {Number.isFinite(Number(officer.heading)) && <span className="rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1 text-[10px] font-black text-slate-300">{Math.round(Number(officer.heading))}°</span>}
                              </div>
                              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-cyan-300">
                                Source: {officer.gps_display_source === 'external_serial'
                                  ? 'External USB / NMEA GPS'
                                  : officer.gps_display_source === 'shift_clock_in'
                                    ? 'Verified shift clock-in position'
                                    : officer.gps_display_source === 'site_fallback'
                                      ? 'Configured site position'
                                      : officer.gps_display_source
                                        ? 'Windows / Browser Location'
                                        : 'Unknown'}
                              </p>
                              {(officer.gps_stale || officer.gps_low_accuracy) && (
                                <p className="mt-2 text-xs font-bold leading-5 text-amber-100">
                                  {officer.gps_display_source === 'site_fallback'
                                    ? 'Device GPS is pending. This marker is the configured property position, not the officer’s exact live position.'
                                    : officer.gps_display_source === 'shift_clock_in'
                                      ? 'Device GPS is pending. This marker is the verified shift clock-in position, not a current GPS fix.'
                                      : officer.gps_stale && officer.session_active === false
                                        ? 'Officer is offline or the live session heartbeat is no longer current. This marker is retained last-known location data.'
                                        : officer.gps_stale
                                          ? 'The live session is waiting for a fresh device GPS fix. This marker shows the best retained location until GPS recovers.'
                                          : 'The current fix is outside the 100m precision target. Pathfinder will replace it automatically when a more precise fix arrives.'}
                                </p>
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
              {activeTrackedOfficers.map((officer) => (
                <Card key={officer.id} className="border border-emerald-500/25 bg-[#0d1927] text-slate-100 shadow-lg transition hover:border-emerald-400/50">
                  <CardHeader className="border-b border-emerald-500/20 bg-emerald-950/20 py-3">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {getOfficerName(officer.officer_email).charAt(0)}
                          </span>
                        </div>
                        <span className="text-white">{getOfficerName(officer.officer_email)}</span>
                      </div>
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" title="Active" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Current Location</p>
                        <p className="text-sm font-semibold text-slate-100">{officer.current_location}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Session / Shift Started</p>
                        <p className="text-sm font-semibold text-slate-100">
                          {officer.clock_in_time ? format(new Date(officer.clock_in_time), 'h:mm a') : 'Active session'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-[#08131f] p-2">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Speed</p>
                        <p className="text-xl font-black text-cyan-200">{Math.round(Number(officer.speed || 0))} <span className="text-[10px] text-cyan-400">MPH</span></p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Last Update</p>
                        <p className="text-sm font-semibold text-slate-100">
                          {officer.last_update ? format(new Date(officer.last_update), 'h:mm:ss a') : 'No GPS data'}
                        </p>
                      </div>
                    </div>
                    {officer.latitude && officer.longitude && (
                      <div className="border-t border-slate-700 pt-2">
                        <p className="font-mono text-[11px] text-cyan-300">
                          GPS {Number(officer.latitude).toFixed(6)}, {Number(officer.longitude).toFixed(6)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {!activeTrackedOfficers.length && (
              <Card className="border border-slate-700 bg-[#0d1927] text-slate-100 shadow-lg">
                <CardContent className="p-12 text-center">
                  <Activity className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-400">No officers currently have an active Pathfinder session.</p>
                  <p className="mt-1 text-xs text-slate-600">Last-known offline positions remain available on the map and in Historical Movement.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {viewMode === 'history' && selectedOfficerEmail && (
          auditLoading ? <div role="status" className="p-8 text-center">Loading complete GPS audit report…</div>
          : auditError ? <div role="alert" className="rounded-lg border border-red-600 p-4">
            <p>Unable to load officer history: {auditError.message}</p>
            <Button onClick={() => retryAudit()} className="mt-3">Retry report</Button>
          </div>
          : auditData ? <><HistoricalOfficerMap data={auditData} officerName={getOfficerName(selectedOfficerEmail)} theme={mapTheme} /><GPSAuditReport onBack={backToLocations} key={selectedOfficerEmail + selectedDate} data={auditData} officerName={getOfficerName(selectedOfficerEmail)} /></>
          : null
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Live Tracking:</strong> Shows operational users with recent GPS and retains their available last-known positions when offline. Gray markers are historical positions, not live fixes. Client, student, and pending accounts are intentionally hidden from this operational display even though session tracking remains internal. GPS uses the single app-wide location service.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Check All Locations Now:</strong> Checks all recent signed-in session records and separates users with current GPS, users signed in with GPS unavailable, and recently stale sessions.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Historical Tracking:</strong> Select a user and Eastern Time date to view the complete GPS audit trail, route map, time entries, geofence alerts, estimated stops, and ping log. Use Print / Save PDF to print the same report.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Tracking Scope:</strong> Location tracking is active for every authenticated internal app session and ends when the app session is no longer active. Moving units publish live position about every 7 seconds; historical movement records speed and heading about every 20 seconds while moving and about once per minute while stationary.
          </p>
        </div>
      </div>
    </div>
  );
}
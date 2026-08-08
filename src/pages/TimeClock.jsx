import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, MapPin, CheckCircle, XCircle, Navigation, AlertCircle, Calendar as CalendarIcon, AlertTriangle, Printer } from "lucide-react";
import { generateTimeClockPrint } from "../components/TimeClockPrintView";
import { format, subWeeks, startOfWeek, endOfWeek, subDays, isAfter } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { subscribeLiveLocation, waitForLiveLocation } from '@/lib/liveLocationService';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 17);
  }, [center, map]);
  return null;
}

function pointInsidePolygon(lat, lng, rawPolygon = []) {
  const polygon = rawPolygon.map(p => Array.isArray(p) ? { lat: Number(p[0]), lng: Number(p[1]) } : { lat: Number(p?.lat), lng: Number(p?.lng) }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (polygon.length < 3) return null;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const hit = ((a.lng > lng) !== (b.lng > lng)) && (lat < ((b.lat - a.lat) * (lng - a.lng)) / ((b.lng - a.lng) || Number.EPSILON) + a.lat);
    if (hit) inside = !inside;
  }
  return inside;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function verifyAgainstLocationBoundary(location, lat, lng) {
  if (!location) return { ok: false, message: 'Location not found.' };
  if (location.is_special_event) return { ok: true };
  const polygon = location.geofence_polygon || [];
  const inside = pointInsidePolygon(lat, lng, polygon);
  if (inside !== null) return { ok: inside, message: inside ? '' : `You are outside the approved property boundary for ${location.site_name}.` };
  if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return { ok: false, message: `${location.site_name} does not have a valid geofence configured. Contact an administrator.` };
  const distance = distanceMeters(lat, lng, Number(location.latitude), Number(location.longitude));
  const radius = Number(location.geofence_radius_meters || 100);
  return { ok: distance <= radius, distance, message: distance <= radius ? '' : `You are outside the approved ${radius} meter geofence for ${location.site_name}.` };
}

export default function TimeClock() {
  const [selectedLocation, setSelectedLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [geoError, setGeoError] = useState(null);
  const [verifyingLocation, setVerifyingLocation] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [startDate, setStartDate] = useState(format(subWeeks(new Date(), 2), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [clockInCoords, setClockInCoords] = useState(null);
  const [currentLocationCoords, setCurrentLocationCoords] = useState(null);
  const queryClient = useQueryClient();

  // NEW STATE VARIABLES
  const [switchingSite, setSwitchingSite] = useState(false);
  const [selectedNewSite, setSelectedNewSite] = useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const { data: locations } = useQuery({
    queryKey: ['activeLocations'],
    queryFn: async () => {
      const allLocations = await base44.entities.Location.list('site_name');
      return allLocations.filter(loc => loc.active);
    },
    enabled: !!user, // ADDED enabled property
  });

  const { data: mySchedule } = useQuery({
    queryKey: ['mySchedule', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const today = format(new Date(), 'yyyy-MM-dd');
      return await base44.entities.Schedule.filter({
        officer_email: user.email,
        shift_date: today
      });
    },
    enabled: !!user,
  });

  const { data: activeEntry, isLoading } = useQuery({
    queryKey: ['activeTimeEntry'],
    queryFn: async () => {
      if (!user?.email) return null;
      const entries = await base44.entities.TimeEntry.list('-created_date');
      const userEntries = entries.filter(e => e.officer_email === user.email);
      return userEntries.find(e => !e.clock_out) || null;
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: recentEntries } = useQuery({
    queryKey: ['recentTimeEntries', user?.email, startDate, endDate, selectedLocation],
    queryFn: async () => {
      if (!user?.email) return [];
      const entries = await base44.entities.TimeEntry.list('-created_date');
      const userEntries = entries.filter(e => e.officer_email === user.email);
      
      let filteredEntries = userEntries.filter(entry => {
        if (!entry.clock_out) return false;
        const entryDate = entry.clock_in.split('T')[0];
        return entryDate >= startDate && entryDate <= endDate;
      });

      if (selectedLocation) {
        filteredEntries = filteredEntries.filter(entry => entry.location.includes(selectedLocation));
      }

      return filteredEntries;
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const saveLocationHistoryMutation = useMutation({
    mutationFn: (data) => base44.entities.LocationHistory.create(data),
  });

  const clockInMutation = useMutation({
    mutationFn: (data) => base44.entities.TimeEntry.create(data),
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: ['activeTimeEntry'] });
      const previousEntry = queryClient.getQueryData(['activeTimeEntry']);
      
      queryClient.setQueryData(['activeTimeEntry'], newEntry);
      
      return { previousEntry };
    },
    onError: (err, newEntry, context) => {
      if (context?.previousEntry) {
        queryClient.setQueryData(['activeTimeEntry'], context.previousEntry);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['recentTimeEntries'] });
      setUserCoords(null);
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TimeEntry.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['activeTimeEntry'] });
      const previousEntry = queryClient.getQueryData(['activeTimeEntry']);
      
      queryClient.setQueryData(['activeTimeEntry'], null);
      
      return { previousEntry };
    },
    onError: (error, variables, context) => {
      console.error('Clock out error:', error);
      setGeoError('Failed to clock out. Please try again.');
      setVerifyingLocation(false);
      if (context?.previousEntry) {
        queryClient.setQueryData(['activeTimeEntry'], context.previousEntry);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['recentTimeEntries'] });
      setNotes("");
      setSelectedLocation("");
      setVerifyingLocation(false);
      // Generate QR patrol report for this shift (fire and forget)
      if (activeEntry) {
        const propertySite = activeEntry.location?.split(' - ')[0] || '';
        base44.functions.invoke('generateQRPatrolReport', {
          shift_id: activeEntry.id,
          officer_email: activeEntry.officer_email || user?.email,
          officer_name: user?.full_name || user?.email,
          property_site: propertySite,
          shift_start: activeEntry.clock_in,
          shift_end: new Date().toISOString(),
          report_date: new Date().toISOString().slice(0, 10),
        }).catch(err => console.error('QR report gen error:', err));
      }
    },
  });

  // NEW MUTATION: switchSiteMutation
  const switchSiteMutation = useMutation({
    mutationFn: async ({ newSite, currentPosition }) => {
      const newLocation = locations.find(loc => loc.site_name === newSite);
      if (!newLocation) throw new Error('Location not found');

      // Admins bypass GPS + geofence verification, matching clock-in/clock-out behavior elsewhere.
      let clockOutLat = null;
      let clockOutLng = null;
      let clockInLat = null;
      let clockInLng = null;

      if (!isAdmin) {
        if (!currentPosition) {
          throw new Error('GPS location required. Please enable location access and try again.');
        }
        const boundaryCheck = verifyAgainstLocationBoundary(
          newLocation,
          currentPosition.coords.latitude,
          currentPosition.coords.longitude
        );
        if (!boundaryCheck.ok) throw new Error(boundaryCheck.message);
        clockOutLat = currentPosition.coords.latitude;
        clockOutLng = currentPosition.coords.longitude;
        clockInLat = currentPosition.coords.latitude;
        clockInLng = currentPosition.coords.longitude;
      }

      // Clock out from old site
      const clockOutData = {
        clock_out: new Date().toISOString(),
        clock_out_latitude: clockOutLat,
        clock_out_longitude: clockOutLng,
      };
      await base44.entities.TimeEntry.update(activeEntry.id, clockOutData);

      // Clock in to new site
      const clockInData = {
        officer_email: user?.email,
        officer_name: user?.full_name || user?.email,
        clock_in: new Date().toISOString(),
        location: `${newSite} - ${newLocation.address}`,
        clock_in_latitude: clockInLat,
        clock_in_longitude: clockInLng,
        notes: `Switched from ${activeEntry.location.split(' - ')[0]}`,
      };
      return await base44.entities.TimeEntry.create(clockInData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTimeEntry'] });
      queryClient.invalidateQueries({ queryKey: ['recentTimeEntries'] });
      setSwitchingSite(false);
      setSelectedNewSite("");
      setGeoError(null); // Clear any geo error from previous operations
      alert('✅ Successfully switched sites!');
    },
    onError: (error) => {
      console.error("Site switch error:", error);
      setGeoError(`Failed to switch sites: ${error.message}`);
    }
  });

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distanceMeters = R * c;
    const distanceFeet = distanceMeters * 3.28084;
    return distanceMeters; // Return in meters as per new requirement
  };

  const isSpecialAssignment = (locationString) => {
    if (!locationString) return false;
    const lowerLocation = locationString.toLowerCase();
    return lowerLocation.includes('special') || lowerLocation.includes('event');
  };

  // Removed auto-trigger of location permission - will request on clock in button click

  useEffect(() => {
    return subscribeLiveLocation((fix) => {
      setCurrentLocationCoords({ lat: fix.latitude, lng: fix.longitude });
    });
  }, []);

  const requestLocationPermission = async () => {

    setVerifyingLocation(true);
    setGeoError(null);

    try {
      const fix = await waitForLiveLocation({ maxAgeMs: 10000, timeoutMs: 10000 });
      const userLat = fix.latitude;
      const userLng = fix.longitude;
      const position = { coords: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy }, timestamp: fix.timestamp };
      setUserCoords({ lat: userLat, lng: userLng, position });
      setLocationPermissionGranted(true);
      setGeoError(null);

      const location = locations?.find(loc => loc.site_name === selectedLocation);

      const boundaryCheck = verifyAgainstLocationBoundary(location, userLat, userLng);
      if (boundaryCheck.ok) {
        return { verified: true, coords: { lat: userLat, lng: userLng }, distance: boundaryCheck.distance, position };
      }
      setGeoError(boundaryCheck.message);
      return { verified: false, distance: boundaryCheck.distance };
    } catch (error) {
      if (error.code === 1) {
        setGeoError("LOCATION PERMISSION DENIED - You cannot clock in without enabling location services. Click your browser's address bar and allow location access, then try again.");
      } else {
        setGeoError("Unable to access your location. Please enable location services in your browser settings and try again.");
      }
      setLocationPermissionGranted(false);
      return { verified: false, error: error.message };
    } finally {
      setVerifyingLocation(false);
    }
  };

  const handleClockIn = async () => {
    if (!selectedLocation) {
      setGeoError("Please select a location before clocking in.");
      return;
    }

    const locationDetails = locations?.find(loc => loc.site_name === selectedLocation);
    if (!locationDetails) {
      setGeoError("Selected location details not found. Please try again.");
      return;
    }

    // Check for expired DCJS or Firearm certifications (non-admins only)
    if (!isAdmin) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (user?.dcjs_expiration) {
        const dcjsExp = new Date(user.dcjs_expiration);
        if (dcjsExp < today) {
          setGeoError("⛔ Your DCJS (Security Officer Core Subjects) certification has expired. You are not authorized to clock in. Please contact your supervisor immediately.");
          return;
        }
      }
      if (user?.firearm_expiration) {
        const firearmExp = new Date(user.firearm_expiration);
        if (firearmExp < today) {
          setGeoError("⛔ Your Firearm (Handgun) certification has expired. You are not authorized to clock in. Please contact your supervisor immediately.");
          return;
        }
      }
    }

    // Every user, including admins, must provide a current GPS fix and pass the site's canonical geofence.
    setVerifyingLocation(true);
    setGeoError(null);

    const verification = await requestLocationPermission();

    if (!verification.verified) {
      setVerifyingLocation(false);
      return;
    }
    
    setVerifyingLocation(false);
    const clockInLocation = {
      latitude: verification.coords.lat,
      longitude: verification.coords.lng
    };
    setClockInCoords(clockInLocation);
    
    clockInMutation.mutate({
      officer_email: user?.email,
      clock_in: new Date().toISOString(),
      location: `${locationDetails.site_name} - ${locationDetails.address}`,
      clock_in_latitude: clockInLocation.latitude,
      clock_in_longitude: clockInLocation.longitude,
    });
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;

    const locationDetails = locations?.find(loc => activeEntry.location?.includes(loc.site_name));
    
    // Admin bypass - no location verification
    if (isAdmin && !locationDetails?.is_special_event) {
      clockOutMutation.mutate({
        id: activeEntry.id,
        data: {
          clock_out: new Date().toISOString(),
          notes,
          clock_out_latitude: null,
          clock_out_longitude: null,
        },
      });
      return;
    }
    
    const isSpecial = locationDetails?.is_special_event || isSpecialAssignment(activeEntry.location);

    setVerifyingLocation(true);
    setGeoError(null);

    // Try to get location, but always allow clock out
    try {
      const fix = await waitForLiveLocation({ maxAgeMs: 10000, timeoutMs: 8000 });
      const currentLat = fix.latitude;
      const currentLng = fix.longitude;
      
      // Check distance for non-special assignments
      let flagNote = '';
      if (!isSpecial) {
        const clockInLat = activeEntry.clock_in_latitude || clockInCoords?.latitude;
        const clockInLng = activeEntry.clock_in_longitude || clockInCoords?.longitude;
        
        if (clockInLat && clockInLng) {
          const distanceMeters = calculateDistance(currentLat, currentLng, clockInLat, clockInLng);
          const distanceFeet = distanceMeters * 3.28084;
          const maxDistance = 0.25 * 5280; // 1,320 feet
          
          if (distanceFeet > maxDistance) {
            flagNote = `\n\n[FLAGGED: Clocked out ${Math.round(distanceFeet)} feet from clock-in location]`;
          }
        }
      }
      
      // Clock out with GPS coordinates
      clockOutMutation.mutate({
        id: activeEntry.id,
        data: {
          clock_out: new Date().toISOString(),
          notes: notes + flagNote,
          clock_out_latitude: currentLat,
          clock_out_longitude: currentLng,
        },
      });
      
      setGeoError(null);
      setClockInCoords(null);
    } catch (error) {
      console.error("Geolocation error during clock-out:", error);
      
      // Always allow clock out, just flag it
      clockOutMutation.mutate({
        id: activeEntry.id,
        data: {
          clock_out: new Date().toISOString(),
          notes: `${notes}\n\n[FLAGGED: GPS unavailable at clock-out - ${error.message || 'Location error'}]`,
          clock_out_latitude: null,
          clock_out_longitude: null,
        },
      });
      
      setGeoError(null);
      setClockInCoords(null);
    } finally {
      setVerifyingLocation(false);
    }
  };

  // NEW FUNCTION: handleSwitchSite
  const handleSwitchSite = async () => {
    if (!selectedNewSite) {
      setGeoError('Please select a site to switch to.');
      return;
    }

    if (!activeEntry) {
      setGeoError('No active entry to switch from.');
      return;
    }

    // Site switching uses the same canonical GPS/geofence rule for every user, including admins.
    setSwitchingSite(true);
    setGeoError(null);

    try {
      const fix = await waitForLiveLocation({ maxAgeMs: 10000, timeoutMs: 10000 });
      const currentPosition = { coords: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy }, timestamp: fix.timestamp };

      if (confirm(`Switch from ${activeEntry.location.split(' - ')[0]} to ${selectedNewSite}?\n\nThis will clock you out of your current site and clock you in to the new site.`)) {
        switchSiteMutation.mutate({ newSite: selectedNewSite, currentPosition });
      } else {
        setSwitchingSite(false); // User cancelled confirmation
      }

    } catch (error) {
      console.error("Error getting location for site switch:", error);
      let errorMessage = "Unable to get your current location for site switch.";
      if (error.code === 1) {
        errorMessage = "LOCATION PERMISSION DENIED - Cannot switch sites without location access. Please enable location services in your browser.";
      } else if (error.code === 3 || error.message === 'TIMEOUT') {
        errorMessage = "LOCATION TIMEOUT - Could not get your location in time. Please try again with better GPS signal.";
      }
      setGeoError(errorMessage);
    } finally {
      setSwitchingSite(false);
    }
  };

  useEffect(() => {
    let intervalId;

    const trackLocation = async () => {
      if (!activeEntry || !user?.email || isAdmin) return;

      try {
        const fix = await waitForLiveLocation({ maxAgeMs: 30000, timeoutMs: 10000 });

        saveLocationHistoryMutation.mutate({
          time_entry_id: activeEntry.id,
          officer_email: user.email,
          latitude: fix.latitude,
          longitude: fix.longitude,
          timestamp: new Date(fix.timestamp).toISOString(),
          accuracy: fix.accuracy,
        });

      } catch (error) {
        if (error.code !== 3) {
          console.error("Error tracking location:", error);
        }
      }
    };

    if (activeEntry && !isAdmin) {
      trackLocation();
      intervalId = setInterval(trackLocation, 10000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeEntry, user?.email, isAdmin, saveLocationHistoryMutation]);

  const calculateHours = (clockIn, clockOut) => {
    if (!clockOut) return "Active";
    const diff = new Date(clockOut) - new Date(clockIn);
    const hours = Math.floor(diff / 1000 / 60 / 60);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    return `${hours}h ${minutes}m`;
  };

  const calculateTotalHours = () => {
    let totalMinutes = 0;
    recentEntries?.forEach(entry => {
      if (entry.clock_out) {
        const diff = new Date(entry.clock_out) - new Date(entry.clock_in);
        totalMinutes += diff / 1000 / 60;
      }
    });
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    return `${hours}h ${minutes}m`;
  };

  const setThisWeek = () => {
    setStartDate(format(startOfWeek(new Date(), { weekStartsOn: 5 }), 'yyyy-MM-dd'));
    setEndDate(format(endOfWeek(new Date(), { weekStartsOn: 5 }), 'yyyy-MM-dd'));
  };

  const setLastWeek = () => {
    const lastWeek = subWeeks(new Date(), 1);
    setStartDate(format(startOfWeek(lastWeek, { weekStartsOn: 5 }), 'yyyy-MM-dd'));
    setEndDate(format(endOfWeek(lastWeek, { weekStartsOn: 5 }), 'yyyy-MM-dd'));
  };

  const setLast2Weeks = () => {
    setStartDate(format(subWeeks(new Date(), 2), 'yyyy-MM-dd'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handlePrintTimeEntries = () => {
    const officerName = user?.full_name || user?.email || 'Officer';
    generateTimeClockPrint(recentEntries || [], officerName, startDate, endDate);
  };

  if (isLoading) return <div className="p-6 text-slate-300">Loading time clock...</div>;

  return (
    <div className="min-h-screen bg-[#08111d] px-3 py-4 text-slate-100 sm:px-5 md:px-8 md:py-7">
      <div className="mx-auto max-w-5xl space-y-5 md:space-y-6">
        <div className="rounded-2xl border border-[#21384f] bg-[#0d1825] px-4 py-4 shadow-xl sm:px-6">
          <h1 className="mb-1 text-2xl font-black tracking-tight text-white sm:text-3xl">Time Clock</h1>
          <p className="text-sm text-slate-400 sm:text-base">Track your shift hours{isAdmin ? '' : ' with live location tracking'}</p>
        </div>

        {!isAdmin && (
          <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-900 mb-2">CRITICAL: Do NOT Close This App While Clocked In</p>
                <p className="text-sm text-red-800 font-semibold">
                  Closing or minimizing this app while on duty WILL AUTOMATICALLY CLOCK YOU OUT and may result in disciplinary action.
                </p>
                <p className="text-sm text-red-800 mt-2">
                  You must keep the app open and running in your browser at all times during your shift. Your location is being tracked continuously for safety and accountability purposes.
                </p>
                <p className="text-sm text-red-700 mt-2 font-semibold">
                  If you need to use other applications, open them in a new tab or window, but keep this tab active in your browser.
                </p>
              </div>
            </div>
          </div>
        )}

        <Card className="overflow-hidden border border-[#29445f] bg-[#0d1825] text-slate-100 shadow-2xl">
          <CardHeader className={`border-b border-[#29445f] ${activeEntry ? 'bg-[#0f2a22]' : 'bg-[#10263b]'}`}>
            <CardTitle className="flex items-center gap-3 text-xl font-black text-white sm:text-2xl">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${activeEntry ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-blue-500/40 bg-blue-500/10'}`}>
                <Clock className={`h-5 w-5 ${activeEntry ? 'text-emerald-300' : 'text-blue-300'}`} />
              </div>
              {activeEntry ? 'Currently On Duty' : 'Ready to Clock In'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 md:p-7">
            {activeEntry ? (
              <div className="space-y-6">
                {geoError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{geoError}</AlertDescription>
                  </Alert>
                )}
                {/* Updated styling for active shift display card */}
                <div className="rounded-2xl border border-emerald-500/30 bg-[#0c201b] p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.55)] animate-pulse" />
                    <span className="text-sm font-black uppercase tracking-wide text-emerald-200">Active Shift{!isAdmin && ' · Live Tracking Enabled'}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#2b4158] bg-[#0a1521] p-4">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Clocked In</p>
                      <p className="text-2xl font-black text-white">
                        {format(new Date(activeEntry.clock_in), 'h:mm a')}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-[#2b4158] bg-[#0a1521] p-4">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Location</p>
                      <p className="flex min-w-0 items-start gap-2 break-words text-base font-bold leading-6 text-white sm:text-lg">
                        <MapPin className="mt-1 h-4 w-4 shrink-0 text-blue-300" />
                        <span className="min-w-0 break-words">{activeEntry.location}</span>
                      </p>
                      {isSpecialAssignment(activeEntry.location) && (
                        <p className="text-xs text-amber-700 mt-1 font-semibold">
                          Special Assignment - No geofence required for clock-out
                        </p>
                      )}
                    </div>
                  </div>
                  {!isAdmin && (
                    <>
                      <div className="mt-4 rounded-xl border border-blue-500/25 bg-blue-500/10 p-3">
                        <p className="flex items-start gap-2 text-xs leading-5 text-blue-200">
                          <Navigation className="mt-0.5 h-4 w-4 shrink-0 animate-pulse" />
                          Your location is being tracked every 10 seconds. Keep this app open to maintain accurate tracking.
                        </p>
                      </div>
                      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                        <p className="flex items-start gap-2 text-xs font-semibold leading-5 text-red-200">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          WARNING: Closing this app will automatically clock you out.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {currentLocationCoords && !isAdmin && (
                  <Card className="border-none shadow-lg overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MapPin className="w-5 h-5 text-blue-600" />
                        Your Current Location
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="h-[300px] w-full">
                        <MapContainer
                          key={`map-${activeEntry?.id || 'default'}`}
                          center={[currentLocationCoords.lat, currentLocationCoords.lng]}
                          zoom={17}
                          style={{ height: '100%', width: '100%' }}
                          scrollWheelZoom={false}
                        >
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          />
                          <MapUpdater center={[currentLocationCoords.lat, currentLocationCoords.lng]} />
                          <Marker position={[currentLocationCoords.lat, currentLocationCoords.lng]} />
                          {(() => {
                            const activeSiteName = activeEntry.location?.split(' - ')[0]?.trim();
                            const activeSite = locations?.find(loc => loc.site_name === activeSiteName);
                            const polygon = activeSite?.geofence_polygon || [];
                            if (polygon.length >= 3) {
                              return <Polygon positions={polygon.map(point => [Number(point.lat), Number(point.lng)])} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.12, weight: 3 }} />;
                            }
                            if (activeSite?.latitude && activeSite?.longitude) {
                              return <Circle center={[activeSite.latitude, activeSite.longitude]} radius={activeSite.geofence_radius_meters || 100} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.08 }} />;
                            }
                            return null;
                          })()}
                        </MapContainer>
                      </div>
                      <div className="p-3 bg-blue-50 border-t border-blue-200">
                        <p className="text-xs text-blue-900">
                          <MapPin className="w-3 h-3 inline mr-1" />
                          GPS: {currentLocationCoords.lat.toFixed(6)}, {currentLocationCoords.lng.toFixed(6)}
                        </p>
                        {!isSpecialAssignment(activeEntry.location) && (
                          <p className="text-xs text-amber-300 mt-1">
                            Gold boundary is the approved property geofence used for clock-in, geofence alerts, and property-call monitoring.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm font-bold text-slate-200">Shift Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any notes about your shift..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="min-h-[110px] resize-none border-[#36516b] bg-[#091522] text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                  />
                </div>

                <Button
                  onClick={handleClockOut}
                  disabled={clockOutMutation.isPending || verifyingLocation}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold"
                >
                  {verifyingLocation ? (
                    <>
                      <Navigation className="w-5 h-5 mr-2 animate-pulse" />
                      Verifying Clock Out Location...
                    </>
                  ) : clockOutMutation.isPending ? (
                    'Clocking Out...'
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 mr-2" />
                      Clock Out
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {geoError && (
                  <Alert variant="destructive" className="border-2 border-red-500">
                    <AlertCircle className="h-5 w-5" />
                    <AlertDescription className="text-base font-semibold">{geoError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3">
                  <Label htmlFor="location">Select Your Location *</Label>
                  <Select
                    value={selectedLocation}
                    onValueChange={(value) => {
                      setSelectedLocation(value);
                      setGeoError(null);
                      setUserCoords(null);
                      if (!isAdmin) {
                        setLocationPermissionGranted(false);
                      }
                    }}
                    required
                  >
                    <SelectTrigger className="text-base md:text-lg py-6 min-h-[44px]">
                      <SelectValue placeholder="Choose your assigned location..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[60vh]">
                      {locations?.map((loc) => (
                        <SelectItem key={loc.id} value={loc.site_name} className="min-h-[44px]">
                          <div className="flex flex-col py-1">
                            <span className="font-semibold text-sm">{loc.site_name}</span>
                            <span className="text-xs text-slate-500">{loc.address}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedLocation && !isAdmin && (
                  <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-blue-900 mb-2">Location Verification</p>
                        <p className="text-sm text-blue-800">
                          When you click "Clock In", you'll be asked to grant location permission. Please allow access to verify you're at the correct site.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleClockIn}
                  disabled={clockInMutation.isPending || verifyingLocation || !selectedLocation}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-6 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {verifyingLocation ? (
                    <>
                      <Navigation className="w-5 h-5 mr-2 animate-pulse" />
                      Verifying Location...
                    </>
                  ) : clockInMutation.isPending ? (
                    'Clocking In...'
                  ) : !selectedLocation ? (
                    <>
                      <AlertCircle className="w-5 h-5 mr-2" />
                      Select Location First
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Clock In{!isAdmin && ' & Start Tracking'}
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {activeEntry && (
          <>
            {/* The existing active shift display card starts here. Modified its className. */}
            {/* This card is now nested inside the activeEntry check. */}
            
            <Card className="border border-[#29445f] bg-[#0d1825] text-slate-100 shadow-xl"> {/* New Card for Switch Site */}
              <CardHeader className="border-b border-[#29445f]">
                <CardTitle className="flex items-center gap-2 text-blue-300">
                  <MapPin className="h-5 w-5" />
                  Switch Site
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-slate-400">
                    Moving to a different site? Switch your active location here. This will clock you out of your current site and clock you in to the new site.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="new_site">Select New Site</Label>
                    <Select value={selectedNewSite} onValueChange={setSelectedNewSite}>
                      <SelectTrigger id="new_site" className="min-h-[46px] border-[#36516b] bg-[#091522] text-white">
                        <SelectValue placeholder="Choose a site..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[60vh]">
                        {locations?.filter(loc => 
                            loc.site_name !== activeEntry.location.split(' - ')[0] // Filter out current site
                            && loc.active // Only show active locations
                          ).map((loc) => (
                          <SelectItem key={loc.id} value={loc.site_name} className="min-h-[44px] py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-sm">{loc.site_name}</span>
                              <span className="text-xs text-slate-500">{loc.address}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleSwitchSite}
                    disabled={switchSiteMutation.isPending || !selectedNewSite || switchingSite}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {switchSiteMutation.isPending || switchingSite ? 'Switching Sites...' : 'Switch Site'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Card className="border border-[#29445f] bg-[#0d1825] text-slate-100 shadow-xl">
          <CardHeader className="border-b border-[#29445f]">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                My Time Entries
              </CardTitle>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintTimeEntries}
                  className="border-[#36516b] bg-[#091522] text-blue-200 hover:bg-[#10263b]"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total Hours</p>
                  <p className="text-2xl font-black text-white">{calculateTotalHours()}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={setThisWeek}
                  className="text-xs"
                >
                  This Week
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={setLastWeek}
                  className="text-xs"
                >
                  Last Week
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={setLast2Weeks}
                  className="text-xs"
                >
                  Last 2 Weeks
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="start_date" className="text-xs">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-[#36516b] bg-[#091522] text-sm text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end_date" className="text-xs">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border-[#36516b] bg-[#091522] text-sm text-white"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {recentEntries?.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-3 rounded-xl border border-[#2b4158] bg-[#0a1521] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-white">
                      {format(new Date(entry.clock_in), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm text-slate-300">
                      {format(new Date(entry.clock_in), 'h:mm a')} - {entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : 'Active'}
                    </p>
                    <p className="mt-1 flex min-w-0 items-start gap-1 text-xs text-slate-400">
                      <MapPin className="w-3 h-3" />
                      {entry.location}
                    </p>
                    {entry.created_by !== user?.email && (
                      <p className="text-xs text-amber-600 mt-1">
                        Added by support
                      </p>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-black text-white">
                      {calculateHours(entry.clock_in, entry.clock_out)}
                    </p>
                  </div>
                </div>
              ))}
              {!recentEntries?.length && (
                <p className="text-center text-slate-500 py-8">No time entries for selected period</p>
              )}
            </div>
          </CardContent>
        </Card>

        {!isAdmin && (
          <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-4">
            <p className="text-sm leading-6 text-blue-200">
              <strong>Live Tracking:</strong> Your location is automatically tracked every 10 seconds while clocked in. GPS coordinates are accurate to within 30-50 feet depending on signal strength. Location tracking automatically stops when you clock out.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
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
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 17);
    }
  }, [center, map]);
  return null;
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

      // Admins bypass geofence check
      if (!isAdmin) {
        if (!currentPosition) {
          throw new Error('GPS location required. Please enable location access and try again.');
        }

        const distance = calculateDistance(
          currentPosition.coords.latitude,
          currentPosition.coords.longitude,
          newLocation.latitude,
          newLocation.longitude
        );

        // Allow up to 300 meters for site switching
        if (distance > 300) {
          throw new Error(`You must be within 300 meters of ${newSite} to switch sites. Current distance: ${Math.round(distance)} meters.`);
        }
      }

      // Clock out from old site
      const clockOutData = {
        clock_out: new Date().toISOString(),
        clock_out_latitude: isAdmin ? null : currentPosition?.coords.latitude,
        clock_out_longitude: isAdmin ? null : currentPosition?.coords.longitude,
      };
      await base44.entities.TimeEntry.update(activeEntry.id, clockOutData);

      // Clock in to new site
      const clockInData = {
        officer_email: user?.email,
        officer_name: user?.full_name || user?.email,
        clock_in: new Date().toISOString(),
        location: `${newSite} - ${newLocation.address}`,
        clock_in_latitude: isAdmin ? null : currentPosition?.coords.latitude,
        clock_in_longitude: isAdmin ? null : currentPosition?.coords.longitude,
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
    let watchId;
    
    if (activeEntry && !isAdmin) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocationCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error watching position:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 10000
        }
      );
    }

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeEntry, isAdmin]);

  const requestLocationPermission = async () => {
    // Admin bypasses location check entirely IF NOT a special event
    if (isAdmin) {
      const location = locations?.find(loc => loc.site_name === selectedLocation);
      if (!location?.is_special_event) {
        setLocationPermissionGranted(true);
        return { verified: true, coords: null };
      }
    }

    setVerifyingLocation(true);
    setGeoError(null);

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      setUserCoords({ lat: userLat, lng: userLng, position });
      setLocationPermissionGranted(true);
      setGeoError(null);

      const location = locations?.find(loc => loc.site_name === selectedLocation);

      if (location?.latitude && location?.longitude) {
        // Here distance is in meters, convert to feet for display if needed
        const distanceMeters = calculateDistance(userLat, userLng, location.latitude, location.longitude);
        const distanceFeet = distanceMeters * 3.28084;


        // Special event locations do not have a geofence limit on clock-in
        if (location.is_special_event || distanceFeet <= 200) {
          return { verified: true, coords: { lat: userLat, lng: userLng }, distance: distanceMeters, position };
        } else {
          setGeoError(`You are ${Math.round(distanceFeet)} feet away from ${location.site_name}. You must be within 200 feet to clock in.`);
          return { verified: false, distance: distanceMeters };
        }
      } else {
        // If location has no lat/lng, still allow clock-in but without geofence check
        // This implies it's either an old location or a non-physical one where geo-verification isn't strict
        return { verified: true, coords: { lat: userLat, lng: userLng }, position };
      }
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

    // Admin clock-in - no validation needed
    if (isAdmin) {
      clockInMutation.mutate({
        officer_email: user?.email,
        clock_in: new Date().toISOString(),
        location: `${locationDetails.site_name} - ${locationDetails.address}`,
        clock_in_latitude: null,
        clock_in_longitude: null,
      });
      return;
    }

    // For non-admins, request location permission and verify
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
      const position = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), 8000);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeoutId);
            resolve(pos);
          },
          (err) => {
            clearTimeout(timeoutId);
            reject(err);
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 5000
          }
        );
      });

      const currentLat = position.coords.latitude;
      const currentLng = position.coords.longitude;
      
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

    // Admins bypass location check
    if (isAdmin) {
      if (confirm(`Switch from ${activeEntry.location.split(' - ')[0]} to ${selectedNewSite}?\n\nThis will clock you out of your current site and clock you in to the new site.`)) {
        switchSiteMutation.mutate({ newSite: selectedNewSite, currentPosition: null });
      }
      return;
    }

    setSwitchingSite(true);
    setGeoError(null);

    try {
      const currentPosition = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

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
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 120000
          });
        });

        saveLocationHistoryMutation.mutate({
          time_entry_id: activeEntry.id,
          officer_email: user.email,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date().toISOString(),
          accuracy: position.coords.accuracy,
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

  if (isLoading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Time Clock</h1>
          <p className="text-slate-600">Track your shift hours{isAdmin ? '' : ' with live location tracking'}</p>
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

        <Card className="border-none shadow-xl overflow-hidden">
          <CardHeader className={`border-b ${activeEntry ? 'bg-green-100' : 'bg-gradient-to-r from-blue-50 to-purple-50'}`}>
            <CardTitle className="flex items-center gap-2 text-2xl text-slate-900">
              <Clock className={`w-7 h-7 ${activeEntry ? 'text-green-600' : 'text-blue-600'}`} />
              {activeEntry ? 'Currently On Duty' : 'Ready to Clock In'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            {activeEntry ? (
              <div className="space-y-6">
                {geoError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{geoError}</AlertDescription>
                  </Alert>
                )}
                {/* Updated styling for active shift display card */}
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    <span className="font-semibold text-green-900">Active Shift{!isAdmin && ' - Live Tracking Enabled'}</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-green-700 mb-1">Clocked In</p>
                      <p className="text-2xl font-bold text-green-900">
                        {format(new Date(activeEntry.clock_in), 'h:mm a')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700 mb-1">Location</p>
                      <p className="text-lg font-medium text-green-900 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {activeEntry.location}
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
                      <div className="mt-4 p-3 bg-white rounded-lg border border-green-200">
                        <p className="text-xs text-green-700 flex items-center gap-2">
                          <Navigation className="w-4 h-4 animate-pulse" />
                          Your location is being tracked every 10 seconds. Keep this app open to maintain accurate tracking.
                        </p>
                      </div>
                      <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-xs text-red-700 font-semibold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          WARNING: Closing this app will automatically clock you out!
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
                          {activeEntry.clock_in_latitude && activeEntry.clock_in_longitude && !isSpecialAssignment(activeEntry.location) && (
                            <Circle
                              center={[activeEntry.clock_in_latitude, activeEntry.clock_in_longitude]}
                              radius={402}
                              pathOptions={{
                                color: 'green',
                                fillColor: 'green',
                                fillOpacity: 0.1
                              }}
                            />
                          )}
                        </MapContainer>
                      </div>
                      <div className="p-3 bg-blue-50 border-t border-blue-200">
                        <p className="text-xs text-blue-900">
                          <MapPin className="w-3 h-3 inline mr-1" />
                          GPS: {currentLocationCoords.lat.toFixed(6)}, {currentLocationCoords.lng.toFixed(6)}
                        </p>
                        {!isSpecialAssignment(activeEntry.location) && (
                          <p className="text-xs text-blue-700 mt-1">
                            Green circle shows 0.25 mile radius from clock-in location
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-3">
                  <Label htmlFor="notes">Shift Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any notes about your shift..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="resize-none"
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
            
            <Card className="border-none shadow-lg"> {/* New Card for Switch Site */}
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-600">
                  <MapPin className="w-5 h-5" />
                  Switch Site
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Moving to a different site? Switch your active location here. This will clock you out of your current site and clock you in to the new site.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="new_site">Select New Site</Label>
                    <Select value={selectedNewSite} onValueChange={setSelectedNewSite}>
                      <SelectTrigger id="new_site" className="min-h-[44px]">
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

        <Card className="border-none shadow-lg">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between mb-4">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                My Time Entries
              </CardTitle>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintTimeEntries}
                  className="text-blue-700 border-blue-300 hover:bg-blue-50"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <div className="text-right">
                  <p className="text-sm text-slate-600">Total Hours</p>
                  <p className="text-2xl font-bold text-blue-900">{calculateTotalHours()}</p>
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
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end_date" className="text-xs">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {recentEntries?.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">
                      {format(new Date(entry.clock_in), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm text-slate-600">
                      {format(new Date(entry.clock_in), 'h:mm a')} - {entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : 'Active'}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {entry.location}
                    </p>
                    {entry.created_by !== user?.email && (
                      <p className="text-xs text-amber-600 mt-1">
                        Added by support
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Live Tracking:</strong> Your location is automatically tracked every 10 seconds while clocked in. GPS coordinates are accurate to within 30-50 feet depending on signal strength. Location tracking automatically stops when you clock out.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
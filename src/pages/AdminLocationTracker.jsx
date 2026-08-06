import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, MapPin, Clock, Activity, Users, History, Calendar as CalendarIcon, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

const EXCLUDED_OFFICERS = ['calvin.jones@example.com', 'kavon.hiers@example.com'];

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

function MapUpdater({ officers, historicalPath, clockInLocation, clockOutLocation }) {
  const map = useMap();
  
  useEffect(() => {
    if (historicalPath && historicalPath.length > 0) {
      const bounds = [];
      
      // Add clock-in location
      if (clockInLocation) {
        bounds.push([clockInLocation.latitude, clockInLocation.longitude]);
      }
      
      // Add path points
      historicalPath.forEach(h => {
        bounds.push([h.latitude, h.longitude]);
      });
      
      // Add clock-out location
      if (clockOutLocation) {
        bounds.push([clockOutLocation.latitude, clockOutLocation.longitude]);
      }
      
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    } else if (officers && officers.length > 0) {
      const validOfficers = officers.filter(o => o.latitude && o.longitude);
      if (validOfficers.length > 0) {
        const bounds = validOfficers.map(o => [o.latitude, o.longitude]);
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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasAccess = user?.role === 'admin';

  const { data: allUsers } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeEntries } = useQuery({
    queryKey: ['allActiveTimeEntries'],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.list('-created_date');
      // Filter out admins and excluded officers from location tracking
      return entries.filter(e => {
        if (e.clock_out) return false; // Only consider active (not clocked out) entries

        // Exclude specific officers from the predefined list
        if (EXCLUDED_OFFICERS.includes(e.officer_email)) return false;
        
        // Exclude admins from location tracker (they track themselves differently)
        const officer = allUsers?.find(u => u.email === e.officer_email);
        if (officer?.role === 'admin') return false;
        
        return true;
      });
    },
    refetchInterval: 15000,
    enabled: hasAccess && !!allUsers,
  });

  const { data: activeOfficerLocations } = useQuery({
    queryKey: ['activeOfficerLocations'],
    queryFn: async () => {
      const locations = await base44.entities.ActiveOfficer.list('-last_update');
      // Filter out admins from displaying their active locations
      return locations.filter(loc => {
        const user = allUsers?.find(u => u.email === loc.officer_email);
        return user?.role !== 'admin';
      });
    },
    refetchInterval: 15000,
    enabled: hasAccess && !!allUsers,
  });

  const currentlyActiveOfficers = activeEntries?.map(entry => {
    const locationData = activeOfficerLocations?.find(ao => ao.officer_email === entry.officer_email);
    // Fall back to clock-in GPS coords if no ActiveOfficer record yet
    const lat = locationData?.latitude || entry.clock_in_latitude;
    const lng = locationData?.longitude || entry.clock_in_longitude;
    return {
      ...entry,
      latitude: lat,
      longitude: lng,
      last_update: locationData?.last_update || entry.clock_in,
      current_location: entry.location,
      clock_in_time: entry.clock_in,
      officer_email: entry.officer_email,
      id: entry.id
    };
  }) || [];

  // Get selected time entry for historical view
  const { data: selectedTimeEntry } = useQuery({
    queryKey: ['selectedTimeEntry', selectedOfficerEmail, selectedDate],
    queryFn: async () => {
      if (!selectedOfficerEmail || viewMode !== 'history') return null;
      
      const entries = await base44.entities.TimeEntry.filter({
        officer_email: selectedOfficerEmail
      }, '-created_date');
      
      // Find entry for selected date that is completed (has clock_out)
      const entry = entries.find(e => {
        const entryDate = e.clock_in.split('T')[0];
        return entryDate === selectedDate && e.clock_out; 
      });
      
      return entry || null;
    },
    enabled: hasAccess && viewMode === 'history' && !!selectedOfficerEmail,
  });

  // Get location history for the selected time entry
  const { data: locationHistory } = useQuery({
    queryKey: ['locationHistory', selectedTimeEntry?.id],
    queryFn: async () => {
      if (!selectedTimeEntry) return [];
      
      const allHistory = await base44.entities.LocationHistory.filter({
        officer_email: selectedOfficerEmail
      }, 'timestamp');
      
      // Filter to only points during this specific shift
      const clockIn = new Date(selectedTimeEntry.clock_in);
      const clockOut = new Date(selectedTimeEntry.clock_out);
      
      return allHistory.filter(h => {
        const timestamp = new Date(h.timestamp);
        return timestamp >= clockIn && timestamp <= clockOut;
      });
    },
    enabled: hasAccess && !!selectedTimeEntry,
  });

  const getOfficerName = (email) => {
    const officer = allUsers?.find(u => u.email === email);
    if (officer?.first_name && officer?.last_name) {
      return `${officer.first_name} ${officer.last_name}`;
    }
    return email;
  };

  const performLocationCheck = async () => {
    try {
      setCheckingLocations(true);

      // Use cached React Query data instead of making duplicate API calls
      // The hooks already refetch on an interval, so this avoids rate limiting
      const freshEntries = activeEntries || [];
      const freshLocations = activeOfficerLocations || [];
      const freshUsers = allUsers || [];

      const currentEntries = freshEntries.filter(e => {
        if (e.clock_out) return false;
        if (EXCLUDED_OFFICERS.includes(e.officer_email)) return false;
        const officer = freshUsers.find(u => u.email === e.officer_email);
        if (officer?.role === 'admin') return false;
        return true;
      });

      const results = {
        total: currentEntries.length,
        withLocation: [],
        withoutLocation: [],
        staleLocation: [],
        timestamp: new Date().toISOString()
      };

      const now = new Date();

      currentEntries.forEach(entry => {
        const officerUser = freshUsers.find(u => u.email === entry.officer_email);
        const officerName = officerUser?.first_name && officerUser?.last_name
          ? `${officerUser.first_name} ${officerUser.last_name}`
          : entry.officer_email;
        const locationData = freshLocations.find(ao => ao.officer_email === entry.officer_email);

        if (locationData && locationData.latitude && locationData.longitude) {
          const lastUpdate = new Date(locationData.last_update);
          const minutesSinceUpdate = (now - lastUpdate) / 1000 / 60;

          if (minutesSinceUpdate > 5) {
            results.staleLocation.push({
              name: officerName,
              email: entry.officer_email,
              location: entry.location,
              lastUpdate: locationData.last_update,
              minutesSinceUpdate: Math.floor(minutesSinceUpdate)
            });
          } else {
            results.withLocation.push({
              name: officerName,
              email: entry.officer_email,
              location: entry.location,
              lastUpdate: locationData.last_update
            });
          }
        } else {
          results.withoutLocation.push({
            name: officerName,
            email: entry.officer_email,
            location: entry.location,
            clockedInAt: entry.clock_in
          });
        }
      });

      setLocationCheckResults(results);
      setLastAutoCheck(new Date());
      queryClient.invalidateQueries({ queryKey: ['activeOfficerLocations'] });
      queryClient.invalidateQueries({ queryKey: ['allActiveTimeEntries'] });

      return results;
    } catch (error) {
      console.error("❌ Error checking locations:", error);
      throw error;
    } finally {
      setCheckingLocations(false);
    }
  };

  const handleCheckAllLocations = async () => {
    try {
      await performLocationCheck();
    } catch (error) {
      alert("Failed to check officer locations. Please try again.");
    }
  };

  useEffect(() => {
    if (viewMode === 'live' && hasAccess && allUsers && activeEntries) { // Changed activeTimeEntries to activeEntries
      console.log("🔄 Setting up auto-check interval");
      
      const initialTimer = setTimeout(() => {
        console.log("⏰ Running initial location check");
        performLocationCheck();
      }, 3000);

      const interval = setInterval(() => {
        console.log("⏰ Running scheduled location check");
        performLocationCheck();
      }, 30000);

      return () => {
        clearTimeout(initialTimer);
        clearInterval(interval);
      };
    }
  }, [viewMode, hasAccess, allUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  const officersWithLocation = currentlyActiveOfficers?.filter(o => o.latitude && o.longitude) || [];
  const filteredOfficersForDropdown = allUsers?.filter(u => 
    !EXCLUDED_OFFICERS.includes(u.email) && 
    u.role !== 'admin'
  ).sort((a, b) => {
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
              Officer Location Tracker
            </h1>
            <p className="text-slate-600">Real-time and historical GPS location tracking</p>
            {lastAutoCheck && (
              <p className="text-xs text-slate-500 mt-1">
                Last auto-check: {format(lastAutoCheck, 'h:mm:ss a')} • Next check in ~30 seconds
              </p>
            )}
          </div>
          <Button
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
          </Button>
        </div>

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
                    Officers with Active GPS Tracking
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
                    Officers with Stale GPS Data
                  </h3>
                  <Alert className="bg-amber-50 border-amber-300 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-900">
                      These officers are clocked in and have GPS data, but it hasn't updated in over 2 minutes. Their app may be closed or in the background.
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
                            {officer.minutesSinceUpdate} min ago
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
                    Officers Without GPS Data
                  </h3>
                  <Alert className="bg-red-50 border-red-300 mb-3">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-900">
                      These officers are clocked in but have NO GPS data. They may have location services disabled, denied permission, or closed the app completely.
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
                          <p className="text-xs text-red-600">Clocked In</p>
                          <p className="text-sm font-medium text-red-900">
                            {officer.clockedInAt ? format(new Date(officer.clockedInAt), 'h:mm a') : 'N/A'}
                          </p>
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
                  <Label htmlFor="officer_select">Select Officer</Label>
                  <Select value={selectedOfficerEmail} onValueChange={setSelectedOfficerEmail}>
                    <SelectTrigger id="officer_select">
                      <SelectValue placeholder="Choose an officer..." />
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
                    Officers Currently On Duty
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold text-slate-900">{currentlyActiveOfficers?.length || 0}</div>
                  <p className="text-xs text-slate-900 mt-1">Clocked in right now</p>
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
                  <div className="text-5xl font-bold text-slate-900">{officersWithLocation.length}</div>
                  <p className="text-xs text-slate-500 mt-1">With location data</p>
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
                  <div className="text-3xl font-bold text-slate-900">30 sec</div>
                   <p className="text-xs text-slate-500 mt-1">Auto-check rate</p>
                </CardContent>
              </Card>
            </div>

            {officersWithLocation.length > 0 && (
              <Card className="border-none shadow-xl">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-green-600" />
                    Live Map - All Active Officers
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[360px] w-full sm:h-[500px] lg:h-[600px]">
                    <MapContainer
                      center={[37.5407, -77.4360]}
                      zoom={12}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      />
                      <MapUpdater officers={officersWithLocation} historicalPath={null} />
                      {officersWithLocation.map((officer) => (
                        <Marker 
                          key={officer.id} 
                          position={[officer.latitude, officer.longitude]}
                        >
                          <Popup>
                            <div className="p-2">
                              <p className="font-bold text-slate-900">{getOfficerName(officer.officer_email)}</p>
                              <p className="text-sm text-slate-600">{officer.current_location}</p>
                              <p className="text-xs text-slate-500">
                                Clocked in: {officer.clock_in_time ? format(new Date(officer.clock_in_time), 'h:mm a') : 'N/A'}
                              </p>
                              <p className="text-xs text-green-600">
                                Last update: {officer.last_update ? format(new Date(officer.last_update), 'h:mm:ss a') : 'No GPS data'}
                              </p>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </div>
                </CardContent>
              </Card>
            )}

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
                        <p className="text-xs text-slate-500">Clocked In</p>
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
                  <p className="text-slate-500">No officers currently clocked in</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {viewMode === 'history' && selectedOfficerEmail && selectedTimeEntry && (
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
                    <p className="text-sm text-blue-700 font-semibold">Clock In</p>
                    <p className="text-lg font-bold text-blue-900">
                      {format(new Date(selectedTimeEntry.clock_in), 'h:mm a')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700 font-semibold">Clock Out</p>
                    <p className="text-lg font-bold text-blue-900">
                      {format(new Date(selectedTimeEntry.clock_out), 'h:mm a')}
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
                <div className="h-[360px] w-full sm:h-[500px] lg:h-[600px]">
                  <MapContainer
                    center={[37.5407, -77.4360]}
                    zoom={12}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <MapUpdater 
                      officers={[]} 
                      historicalPath={locationHistory}
                      clockInLocation={locationHistory[0]}
                      clockOutLocation={locationHistory[locationHistory.length - 1]}
                    />
                    
                    {/* Draw the path line */}
                    <Polyline
                      positions={locationHistory.map(h => [h.latitude, h.longitude])}
                      color="#3b82f6"
                      weight={4}
                      opacity={0.8}
                    />
                    
                    {/* Clock In marker (green) */}
                    <Marker 
                      position={[locationHistory[0].latitude, locationHistory[0].longitude]}
                      icon={clockInIcon}
                    >
                      <Popup>
                        <div className="p-2">
                          <p className="font-bold text-green-700 text-lg">🟢 CLOCK IN</p>
                          <p className="text-sm font-semibold">{format(new Date(selectedTimeEntry.clock_in), 'h:mm:ss a')}</p>
                          <p className="text-xs text-slate-600 mt-1">{selectedTimeEntry.location}</p>
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
                          locationHistory[locationHistory.length - 1].latitude, 
                          locationHistory[locationHistory.length - 1].longitude
                        ]}
                        icon={clockOutIcon}
                      >
                        <Popup>
                          <div className="p-2">
                            <p className="font-bold text-red-700 text-lg">🔴 CLOCK OUT</p>
                            <p className="text-sm font-semibold">{format(new Date(selectedTimeEntry.clock_out), 'h:mm:ss a')}</p>
                            <p className="text-xs text-slate-600 mt-1">{selectedTimeEntry.location}</p>
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
              ) : (
                <div className="p-12 text-center">
                  <History className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500">No location tracking data for this shift</p>
                  <p className="text-xs text-slate-400 mt-2">The officer may have had location tracking disabled or the app closed during their shift.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {viewMode === 'history' && selectedOfficerEmail && !selectedTimeEntry && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <History className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No completed shifts found for {getOfficerName(selectedOfficerEmail)} on {format(new Date(selectedDate + 'T00:00:00'), 'MMMM d, yyyy')}</p>
              <p className="text-xs text-slate-400 mt-2">Only completed shifts (clocked out) can be viewed in historical tracking.</p>
            </CardContent>
          </Card>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Live Tracking:</strong> Shows only officers who are currently clocked in. Officer locations are automatically updated every 10 seconds while on duty. 
            The system auto-checks all officer locations every 10 seconds showing real-time movement. GPS coordinates are accurate to within 30-50 feet depending on signal strength.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Check All Locations Now:</strong> Runs a comprehensive check of all clocked-in officers to verify their GPS is working properly. Shows which officers have active tracking, stale data, or no GPS signal. This check also runs automatically every 10 seconds.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Historical Tracking:</strong> View an officer's complete movement path for any completed shift. The map shows a green pin where they clocked in, a blue line following their tracked path, and a red pin where they clocked out. Select an officer and date to see their tracked locations throughout their shift.
          </p>
          <p className="text-sm text-blue-900 mt-2">
            <strong>Privacy Note:</strong> Location tracking is only active during on-duty hours and automatically stops when officers clock out. Admins can disable their own location tracking using the toggle in the background tracker.
          </p>
        </div>
      </div>
    </div>
  );
}
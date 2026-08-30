import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Shield, Target, MapPin, Check, AlertTriangle, Clock, User, ZoomIn, ZoomOut, Settings, Radio, Eye, Hand, Power } from "lucide-react";
import { differenceInMinutes } from "date-fns";
import { MapContainer, Marker, Circle, Polygon, Popup } from "react-leaflet";
import PathfinderTileLayer from '@/components/map/PathfinderTileLayer';
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listDirectoryLocations } from '@/lib/appDirectory';

// Fix leaflet marker
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function AdminGeofenceAlerts() {
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [acknowledgeNotes, setAcknowledgeNotes] = useState("");
  const [mapZooms, setMapZooms] = useState({});
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.additional_roles?.includes('supervisor');

  const { data: alerts = [] } = useQuery({
    queryKey: ['geofenceAlerts'],
    queryFn: async () => {
      const result = await base44.functions.invoke('manageGeofenceAlerts', { action: 'list' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.alerts || [];
    },
    enabled: isAdmin || isSupervisor,
    refetchInterval: 30000,
  });

  const { data: locations } = useQuery({
    queryKey: ['directoryLocations', 'geofenceAlerts'],
    queryFn: () => listDirectoryLocations(),
    enabled: isAdmin || isSupervisor,
  });

  const activeAlerts = alerts?.filter(a => !a.acknowledged) || [];
  const acknowledgedAlerts = alerts?.filter(a => a.acknowledged) || [];
  const monitoredLocations = (locations || []).filter(location => location.active !== false && location.property_monitoring_enabled === true);

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ id, notes }) => {
      const result = await base44.functions.invoke('manageGeofenceAlerts', { action: 'acknowledge', id, notes });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofenceAlerts'] });
      setSelectedAlert(null);
      setAcknowledgeNotes("");
    },
  });

  const bulkAcknowledgeMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('manageGeofenceAlerts', { action: 'clear_all' });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofenceAlerts'] });
    },
  });

  const autoDispatchMutation = useMutation({
    mutationFn: async ({ location, mode }) => {
      const data = mode === 'disabled'
        ? { auto_dispatch_enabled: false, auto_dispatch_mode: 'disabled' }
        : { auto_dispatch_enabled: true, auto_dispatch_mode: mode };
      const result = await base44.functions.invoke('manageLocations', { action: 'update', id: location.id, data });
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.location;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directoryLocations', 'geofenceAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['adminManagedLocations'] });
    },
  });

  if (!isAdmin && !isSupervisor) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">Only supervisors and admins can view geofence alerts.</p>
      </div>
    );
  }

  const parseServerTimestamp = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    // Base44 created_date values can arrive without an explicit timezone suffix.
    // Those values are UTC server timestamps, so append Z before converting to ET.
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getAlertAge = (createdDate) => {
    const created = parseServerTimestamp(createdDate);
    if (!created) return 'Time unavailable';
    const mins = Math.max(0, differenceInMinutes(new Date(), created));
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  };

  const formatET = (value, withYear = true) => {
    const date = parseServerTimestamp(value);
    if (!date) return 'Time unavailable';
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    }) + ' ET';
  };

  const getLocationCoords = (locationName) => {
    const loc = locations?.find(l => l.site_name === locationName);
    if (!loc) return null;
    const polygon = (loc.geofence_polygon || []).map(point => [Number(point.lat), Number(point.lng)]).filter(pair => pair.every(Number.isFinite));
    return { lat: Number(loc.latitude), lng: Number(loc.longitude), radius: loc.geofence_radius_meters || 100, polygon };
  };

  return (
    <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-2xl md:p-7">
          <div className="flex items-center gap-3"><Target className="h-8 w-8 text-cyan-300"/><div><div className="text-[11px] font-black uppercase tracking-[.24em] text-cyan-300">Property & Geofence Command</div><h1 className="mt-1 text-3xl font-black">Geofence Alerts & Auto Dispatch</h1><p className="mt-1 text-sm text-slate-400">Monitor patrol-zone exceptions and control each monitored property's automatic dispatch mode from one screen.</p></div></div>
        </section>

        {isAdmin && <section className="rounded-[26px] border border-slate-700/80 bg-[#0d1420] p-5 shadow-xl"><div className="flex items-start gap-3"><Settings className="mt-0.5 h-5 w-5 text-amber-300"/><div><div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Property Automatic Dispatch Controls</div><p className="mt-1 text-xs text-slate-400">LIVE automatically assigns eligible units. SHADOW only recommends. MANUAL REVIEW requires dispatcher action. OFF disables automatic dispatch for that property.</p></div></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{monitoredLocations.map(location=>{const mode=location.auto_dispatch_enabled===true?(location.auto_dispatch_mode||'shadow'):'disabled';return <div key={location.id} className="rounded-2xl border border-slate-700 bg-[#09111d] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-black text-white">{location.site_name}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Current mode: <span className={mode==='live'?'text-emerald-300':mode==='disabled'?'text-red-300':'text-amber-300'}>{mode.replaceAll('_',' ')}</span></div></div><div className="flex flex-wrap gap-1.5"><button type="button" disabled={autoDispatchMutation.isPending} onClick={()=>autoDispatchMutation.mutate({location,mode:'live'})} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${mode==='live'?'border-emerald-500 bg-emerald-500/20 text-emerald-200':'border-slate-700 text-slate-400 hover:text-white'}`}><Radio className="mr-1 inline h-3 w-3"/>LIVE</button><button type="button" disabled={autoDispatchMutation.isPending} onClick={()=>autoDispatchMutation.mutate({location,mode:'shadow'})} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${mode==='shadow'?'border-cyan-500 bg-cyan-500/20 text-cyan-200':'border-slate-700 text-slate-400 hover:text-white'}`}><Eye className="mr-1 inline h-3 w-3"/>SHADOW</button><button type="button" disabled={autoDispatchMutation.isPending} onClick={()=>autoDispatchMutation.mutate({location,mode:'manual_review'})} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${mode==='manual_review'?'border-amber-500 bg-amber-500/20 text-amber-200':'border-slate-700 text-slate-400 hover:text-white'}`}><Hand className="mr-1 inline h-3 w-3"/>MANUAL</button><button type="button" disabled={autoDispatchMutation.isPending} onClick={()=>autoDispatchMutation.mutate({location,mode:'disabled'})} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${mode==='disabled'?'border-red-500 bg-red-500/20 text-red-200':'border-slate-700 text-slate-400 hover:text-white'}`}><Power className="mr-1 inline h-3 w-3"/>OFF</button></div></div>{mode==='live'&&<div className="mt-2 text-[10px] font-bold text-emerald-300">Live automatic assignment enabled and administrator-approved.</div>}{mode==='shadow'&&<div className="mt-2 text-[10px] font-bold text-cyan-300">Shadow alert control is active: recommendations only; no unit status changes.</div>}</div>})}</div>{!monitoredLocations.length&&<div className="mt-4 rounded-xl border border-dashed border-slate-700 p-5 text-center text-xs text-slate-500">No active monitored properties are configured.</div>}</section>}

        {activeAlerts.length > 0 && (
          <Card className="border-l-4 border-l-red-500 shadow-lg">
            <CardHeader className="bg-red-50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-red-900">
                  <AlertTriangle className="w-5 h-5" />
                  Active Alerts ({activeAlerts.length})
                </CardTitle>
                <Button
                  onClick={() => bulkAcknowledgeMutation.mutate()}
                  disabled={bulkAcknowledgeMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {bulkAcknowledgeMutation.isPending ? 'Clearing...' : 'Clear All'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {activeAlerts.map((alert) => {
                  const locCoords = getLocationCoords(alert.location);
                  return (
                    <div key={alert.id} className="p-4 bg-red-50 rounded-lg border-2 border-red-300">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-red-600 text-white">
                              {alert.alert_type === 'outside_zone' ? 'Outside Zone' : alert.alert_type}
                            </Badge>
                            <span className="text-sm text-red-700 font-medium">
                              {getAlertAge(alert.created_date)}
                            </span>
                          </div>
                          <p className="font-bold text-slate-900 text-lg flex items-center gap-2">
                            <User className="w-4 h-4" />
                            {alert.officer_name}
                          </p>
                          <p className="text-sm text-slate-600">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            {alert.location} • {alert.distance_from_site}m from site
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatET(alert.created_date)}
                          </p>
                        </div>
                        <Button
                          onClick={() => setSelectedAlert(alert)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Acknowledge
                        </Button>
                      </div>

                      {locCoords && alert.latitude && alert.longitude && (
                        <div className="space-y-2 mt-3">
                          <div style={{ position: 'relative', height: '200px', width: '100%' }} className="rounded-lg overflow-hidden border border-red-200">
                            <MapContainer
                              key={`map-${alert.id}`}
                              center={[(alert.latitude + locCoords.lat) / 2, (alert.longitude + locCoords.lng) / 2]}
                              zoom={mapZooms[alert.id] || 14}
                              style={{ height: '100%', width: '100%' }}
                              scrollWheelZoom={false}
                            >
                              <PathfinderTileLayer />
                              {locCoords.polygon?.length >= 3 ? (
                                <Polygon positions={locCoords.polygon} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.12, weight: 3 }}>
                                  <Popup autoPan={false}>Approved property geofence - {alert.location}</Popup>
                                </Polygon>
                              ) : (
                                <Circle center={[locCoords.lat, locCoords.lng]} radius={locCoords.radius} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.08 }}>
                                  <Popup autoPan={false}>Shared fallback geofence - {alert.location}</Popup>
                                </Circle>
                              )}
                              <Marker position={[locCoords.lat, locCoords.lng]}>
                                <Popup autoPan={false}>Site Center</Popup>
                              </Marker>
                              <Marker position={[alert.latitude, alert.longitude]}>
                                <Popup autoPan={false}>{alert.officer_name} - {alert.distance_from_site}m away</Popup>
                              </Marker>
                            </MapContainer>
                            <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 1000 }} className="bg-white rounded-lg shadow-lg flex flex-col gap-1">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => setMapZooms(prev => ({ ...prev, [alert.id]: Math.min((prev[alert.id] || 14) + 1, 18) }))}
                                className="h-8 w-8"
                              >
                                <ZoomIn className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => setMapZooms(prev => ({ ...prev, [alert.id]: Math.max((prev[alert.id] || 14) - 1, 10) }))}
                                className="h-8 w-8"
                              >
                                <ZoomOut className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {alert.officer_name} is {alert.distance_from_site}m from {alert.location}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {activeAlerts.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Target className="w-16 h-16 mx-auto mb-4 text-green-300" />
              <p className="text-xl font-semibold text-slate-700">No Active Geofence Alerts</p>
              <p className="text-slate-500 mt-2">All officers are within their patrol zones</p>
            </CardContent>
          </Card>
        )}

        {acknowledgedAlerts.length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                Acknowledged Alerts ({acknowledgedAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {acknowledgedAlerts.slice(0, 20).map((alert) => (
                  <div key={alert.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{alert.officer_name}</p>
                        <p className="text-sm text-slate-600">
                          {alert.location} • {alert.distance_from_site}m from site
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatET(alert.created_date, false)} • Acknowledged by {alert.acknowledged_by}
                        </p>
                        {alert.notes && (
                          <p className="text-xs text-slate-600 mt-1 italic">Note: {alert.notes}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <Check className="w-3 h-3 mr-1" />
                        Acknowledged
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Geofence Alert</DialogTitle>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-semibold text-slate-900">{selectedAlert.officer_name}</p>
                <p className="text-sm text-slate-600">
                  {selectedAlert.location} • {selectedAlert.distance_from_site}m outside zone
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {formatET(selectedAlert.created_date)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes about this alert..."
                  value={acknowledgeNotes}
                  onChange={(e) => setAcknowledgeNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSelectedAlert(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => acknowledgeMutation.mutate({ id: selectedAlert.id, notes: acknowledgeNotes })}
                  disabled={acknowledgeMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {acknowledgeMutation.isPending ? 'Saving...' : 'Acknowledge Alert'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
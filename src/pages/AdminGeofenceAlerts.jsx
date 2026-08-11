import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Shield, Target, MapPin, Check, AlertTriangle, Clock, User, ZoomIn, ZoomOut } from "lucide-react";
import { differenceInMinutes } from "date-fns";
import { MapContainer, TileLayer, Marker, Circle, Polygon, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
    enabled: isAdmin || isSupervisor,
  });

  const activeAlerts = alerts?.filter(a => !a.acknowledged) || [];
  const acknowledgedAlerts = alerts?.filter(a => a.acknowledged) || [];

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
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Target className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Geofence Alerts</h1>
            <p className="text-slate-600">Monitor officers leaving their patrol zones</p>
          </div>
        </div>

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
                              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
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
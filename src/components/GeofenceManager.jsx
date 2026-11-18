import { useState } from "react";
import { MapContainer, Circle, Marker, Popup, useMapEvents, Polygon } from "react-leaflet";
import PathfinderTileLayer from '@/components/map/PathfinderTileLayer';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Trash2, Save } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapClickHandler({ onMapClick, isDrawingPolygon }) {
  useMapEvents({
    click: (e) => {
      if (isDrawingPolygon) {
        onMapClick(e.latlng);
      }
    },
  });
  return null;
}

export default function GeofenceManager({ location, onSave }) {
  const [geofenceEnabled, setGeofenceEnabled] = useState(location?.geofence_enabled || false);
  const [radius, setRadius] = useState(location?.geofence_radius_meters || 100);
  const [polygonPoints, setPolygonPoints] = useState(location?.geofence_polygon || []);
  const [usePolygon, setUsePolygon] = useState((location?.geofence_polygon?.length || 0) > 2);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  
  const center = location?.latitude && location?.longitude 
    ? [location.latitude, location.longitude]
    : [37.5407, -77.4360]; // Richmond, VA default

  const handleMapClick = (latlng) => {
    if (isDrawingPolygon) {
      setPolygonPoints(prev => [...prev, { lat: latlng.lat, lng: latlng.lng }]);
    }
  };

  const clearPolygon = () => {
    setPolygonPoints([]);
    setIsDrawingPolygon(false);
  };

  const handleSave = () => {
    onSave({
      geofence_enabled: geofenceEnabled,
      geofence_radius_meters: radius,
      geofence_polygon: usePolygon && polygonPoints.length >= 3 ? polygonPoints : [],
    });
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-green-600" />
          Geofence Settings - {location?.site_name}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">Enable Geofencing</Label>
            <p className="text-sm text-slate-500">Trigger alerts when officers enter/exit this area</p>
          </div>
          <Switch 
            checked={geofenceEnabled} 
            onCheckedChange={setGeofenceEnabled}
          />
        </div>

        {geofenceEnabled && (
          <>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  id="circle" 
                  checked={!usePolygon} 
                  onChange={() => setUsePolygon(false)}
                />
                <Label htmlFor="circle">Circular Zone</Label>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  id="polygon" 
                  checked={usePolygon} 
                  onChange={() => setUsePolygon(true)}
                />
                <Label htmlFor="polygon">Custom Polygon</Label>
              </div>
            </div>

            {!usePolygon && (
              <div className="space-y-2">
                <Label>Radius (meters)</Label>
                <Input
                  type="number"
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value) || 100)}
                  min={10}
                  max={5000}
                />
                <p className="text-xs text-slate-500">
                  Officers will be alerted if they move more than {radius}m from the site center
                </p>
              </div>
            )}

            {usePolygon && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Custom Boundary ({polygonPoints.length} points)</Label>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant={isDrawingPolygon ? "default" : "outline"}
                      onClick={() => setIsDrawingPolygon(!isDrawingPolygon)}
                    >
                      {isDrawingPolygon ? "Stop Drawing" : "Draw Boundary"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={clearPolygon}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {isDrawingPolygon && (
                  <p className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                    Click on the map to add boundary points. Need at least 3 points.
                  </p>
                )}
              </div>
            )}

            <div className="h-80 rounded-lg overflow-hidden border border-slate-200">
              <MapContainer
                center={center}
                zoom={16}
                style={{ height: "100%", width: "100%" }}
              >
                <PathfinderTileLayer />
                <MapClickHandler onMapClick={handleMapClick} isDrawingPolygon={isDrawingPolygon} />
                
                {location?.latitude && location?.longitude && (
                  <Marker position={[location.latitude, location.longitude]}>
                    <Popup autoPan={false}>{location.site_name}</Popup>
                  </Marker>
                )}

                {!usePolygon && location?.latitude && location?.longitude && (
                  <Circle
                    center={[location.latitude, location.longitude]}
                    radius={radius}
                    pathOptions={{ 
                      color: '#22c55e', 
                      fillColor: '#22c55e', 
                      fillOpacity: 0.2 
                    }}
                  />
                )}

                {usePolygon && polygonPoints.length >= 3 && (
                  <Polygon
                    positions={polygonPoints.map(p => [p.lat, p.lng])}
                    pathOptions={{ 
                      color: '#22c55e', 
                      fillColor: '#22c55e', 
                      fillOpacity: 0.2 
                    }}
                  />
                )}

                {usePolygon && polygonPoints.map((point, idx) => (
                  <Circle
                    key={idx}
                    center={[point.lat, point.lng]}
                    radius={5}
                    pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1 }}
                  />
                ))}
              </MapContainer>
            </div>
          </>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
            <Save className="w-4 h-4 mr-2" />
            Save Geofence Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
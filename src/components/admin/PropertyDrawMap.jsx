import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function ClickHandler({ mode, onCircleCenter, onPolygonPoint }) {
  useMapEvents({
    click(e) {
      if (mode === 'circle') onCircleCenter([e.latlng.lat, e.latlng.lng]);
      else onPolygonPoint([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, map.getZoom());
  }, [center]);
  return null;
}

export default function PropertyDrawMap({ mode, center, radius, polygon, onCenterChange, onPolygonChange, flyTo }) {
  const defaultCenter = [37.5407, -77.4360]; // Richmond, VA

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      style={{ height: '280px', width: '100%', borderRadius: '4px' }}
      className="z-0"
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      <ClickHandler mode={mode} onCircleCenter={onCenterChange} onPolygonPoint={(pt) => onPolygonChange([...polygon, pt])} />
      {flyTo && <FlyTo center={flyTo} />}

      {/* Circle mode */}
      {mode === 'circle' && center && (
        <>
          <Marker position={center} />
          {radius > 0 && (
            <Circle
              center={center}
              radius={radius}
              pathOptions={{ color: '#d4a017', fillColor: '#d4a017', fillOpacity: 0.15, weight: 2 }}
            />
          )}
        </>
      )}

      {/* Polygon mode */}
      {mode === 'polygon' && polygon.length > 0 && (
        <>
          {polygon.map((pt, i) => (
            <Marker key={i} position={pt} />
          ))}
          {polygon.length >= 2 && (
            <Polyline
              positions={polygon}
              pathOptions={{ color: '#d4a017', weight: 2, dashArray: '5,5' }}
            />
          )}
          {polygon.length >= 3 && (
            <Polygon
              positions={polygon}
              pathOptions={{ color: '#d4a017', fillColor: '#d4a017', fillOpacity: 0.15, weight: 2 }}
            />
          )}
        </>
      )}
    </MapContainer>
  );
}
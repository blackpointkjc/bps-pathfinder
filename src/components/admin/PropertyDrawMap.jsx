import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, Marker, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// Small dot icon for pins — avoids broken default image URLs
const dotIcon = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;background:#d4a017;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.8);"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const centerIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#d4a017;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(212,160,23,0.8);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function ClickHandler({ mode, onCircleCenter, onPolygonPoint }) {
  useMapEvents({
    click(e) {
      const pt = [e.latlng.lat, e.latlng.lng];
      if (mode === 'circle') onCircleCenter(pt);
      else onPolygonPoint(pt);
    },
    dblclick(e) {
      // Prevent zoom on double-click while drawing polygon
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
    },
  });
  return null;
}

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 15, { duration: 1 });
  }, [JSON.stringify(center)]);
  return null;
}

export default function PropertyDrawMap({ mode, center, radius, polygon, onCenterChange, onPolygonChange, flyTo }) {
  const defaultCenter = [37.5407, -77.4360];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      doubleClickZoom={false}
      style={{ height: '300px', width: '100%', cursor: 'crosshair' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; CARTO'
      />

      <ClickHandler
        mode={mode}
        onCircleCenter={onCenterChange}
        onPolygonPoint={(pt) => onPolygonChange([...polygon, pt])}
      />

      {flyTo && <FlyTo center={flyTo} />}

      {/* CIRCLE MODE */}
      {mode === 'circle' && center && (
        <>
          <Marker position={center} icon={centerIcon} />
          {radius > 0 && (
            <Circle
              center={center}
              radius={radius}
              pathOptions={{ color: '#d4a017', fillColor: '#d4a017', fillOpacity: 0.2, weight: 2, dashArray: '6,4' }}
            />
          )}
        </>
      )}

      {/* POLYGON MODE */}
      {mode === 'polygon' && polygon.length > 0 && (
        <>
          {polygon.map((pt, i) => (
            <Marker key={i} position={pt} icon={dotIcon} />
          ))}

          {/* Line connecting points (open path) */}
          {polygon.length >= 2 && (
            <Polyline
              positions={polygon}
              pathOptions={{ color: '#d4a017', weight: 2, dashArray: '6,4' }}
            />
          )}

          {/* Filled polygon when 3+ points */}
          {polygon.length >= 3 && (
            <Polygon
              positions={polygon}
              pathOptions={{ color: '#d4a017', fillColor: '#d4a017', fillOpacity: 0.2, weight: 2 }}
            />
          )}
        </>
      )}
    </MapContainer>
  );
}
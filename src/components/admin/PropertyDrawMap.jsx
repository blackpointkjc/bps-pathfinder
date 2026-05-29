import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const dotIcon = (color = '#d4a017') => L.divIcon({
  className: '',
  html: `<div style="width:12px;height:12px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 0 5px rgba(0,0,0,0.9);margin:-1px;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// This component wires up native Leaflet click events using a ref so there are NO stale closures
function MapEventBinder({ mode, onCenterChange, onPolygonChange, polygonRef }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Disable double-click zoom so we can click rapidly to add points
    map.doubleClickZoom.disable();

    const handleClick = (e) => {
      const pt = [e.latlng.lat, e.latlng.lng];
      if (mode === 'circle') {
        onCenterChange(pt);
      } else {
        // Use the ref so we always have the latest points array
        onPolygonChange([...polygonRef.current, pt]);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, mode, onCenterChange, onPolygonChange]);

  return null;
}

function FlyTo({ center }) {
  const map = useMap();
  const prevRef = useRef(null);
  useEffect(() => {
    const key = center ? center.join(',') : null;
    if (center && key !== prevRef.current) {
      prevRef.current = key;
      map.flyTo(center, 15, { duration: 1.2 });
    }
  }, [center]);
  return null;
}

export default function PropertyDrawMap({ mode, center, radius, polygon, onCenterChange, onPolygonChange, flyTo }) {
  // Keep a ref so event handlers always see the latest polygon array
  const polygonRef = useRef(polygon);
  useEffect(() => { polygonRef.current = polygon; }, [polygon]);

  const defaultCenter = [37.5407, -77.4360];

  return (
    <div style={{ cursor: 'crosshair', position: 'relative', zIndex: 0 }}>
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: '300px', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; CARTO"
        />

        <MapEventBinder
          mode={mode}
          onCenterChange={onCenterChange}
          onPolygonChange={onPolygonChange}
          polygonRef={polygonRef}
        />

        {flyTo && <FlyTo center={flyTo} />}

        {/* ── CIRCLE MODE ── */}
        {mode === 'circle' && center && (
          <>
            <Marker position={center} icon={dotIcon('#f59e0b')} />
            {radius > 0 && (
              <Circle
                center={center}
                radius={radius}
                pathOptions={{ color: '#d4a017', fillColor: '#fbbf24', fillOpacity: 0.18, weight: 2 }}
              />
            )}
          </>
        )}

        {/* ── POLYGON MODE ── */}
        {mode === 'polygon' && polygon.length > 0 && (
          <>
            {/* Vertex pins */}
            {polygon.map((pt, i) => (
              <Marker key={i} position={pt} icon={dotIcon(i === 0 ? '#f59e0b' : '#d4a017')} />
            ))}

            {/* Connecting line (open) */}
            {polygon.length >= 2 && (
              <Polyline
                positions={polygon}
                pathOptions={{ color: '#d4a017', weight: 2, dashArray: '6 4' }}
              />
            )}

            {/* Closing line back to first point */}
            {polygon.length >= 3 && (
              <Polyline
                positions={[polygon[polygon.length - 1], polygon[0]]}
                pathOptions={{ color: '#fbbf24', weight: 1.5, dashArray: '4 4', opacity: 0.6 }}
              />
            )}

            {/* Filled polygon */}
            {polygon.length >= 3 && (
              <Polygon
                positions={polygon}
                pathOptions={{ color: '#d4a017', fillColor: '#fbbf24', fillOpacity: 0.18, weight: 2 }}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
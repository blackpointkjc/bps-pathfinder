import React, { useState, useEffect, useRef } from 'react';
import { Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { base44 } from '@/api/base44Client';

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const data = await res.json();
        const a = data.address || {};
        return [
            a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road || '',
            a.city || a.town || a.village || a.county || ''
        ].filter(Boolean).join(', ') || data.display_name?.split(',').slice(0,2).join(',') || null;
    } catch { return null; }
}

function createDistressIcon() {
    return new L.DivIcon({
        className: '',
        html: `
            <div style="position:relative;width:52px;height:52px;">
                <div style="position:absolute;inset:0;border-radius:50%;background:rgba(239,68,68,0.3);animation:distress-ping 1s cubic-bezier(0,0,0.2,1) infinite;"></div>
                <div style="position:absolute;inset:6px;border-radius:50%;background:rgba(239,68,68,0.3);animation:distress-ping 1s cubic-bezier(0,0,0.2,1) infinite 0.3s;"></div>
                <svg width="52" height="52" viewBox="0 0 52 52" style="position:relative;z-index:1;">
                    <circle cx="26" cy="26" r="22" fill="#7F1D1D" stroke="#EF4444" stroke-width="3"/>
                    <text x="26" y="22" font-size="14" text-anchor="middle" font-family="Arial" fill="white">🚨</text>
                    <text x="26" y="36" font-size="7" text-anchor="middle" font-family="Arial" fill="#FCA5A5" font-weight="bold">DISTRESS</text>
                </svg>
            </div>
            <style>
                @keyframes distress-ping {
                    0% { transform: scale(0.8); opacity: 1; }
                    80%, 100% { transform: scale(2.2); opacity: 0; }
                }
            </style>
        `,
        iconSize: [52, 52],
        iconAnchor: [26, 26],
        popupAnchor: [0, -30],
    });
}

function AutoCenter({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) map.setView(position, Math.max(map.getZoom(), 15), { animate: true });
    }, [position?.[0], position?.[1]]);
    return null;
}

export default function OfficerDistressMarker({ autoCenter = false }) {
    const [activeAlerts, setActiveAlerts] = useState([]);
    const [addresses, setAddresses] = useState({});
    const geocodedRef = useRef(new Set());
    const icon = createDistressIcon();

    useEffect(() => {
        const loadAlerts = () => {
            base44.entities.OfficerDistress.list('-activated_at', 10)
                .then(all => setActiveAlerts(all.filter(a =>
                    ['active', 'acknowledged', 'responders_enroute'].includes(a.status)
                    && a.current_latitude && a.current_longitude
                )))
                .catch(() => {});
        };
        const fetchAndGeocode = () => {
            base44.entities.OfficerDistress.list('-activated_at', 10)
                .then(all => {
                    const active = all.filter(a =>
                        ['active', 'acknowledged', 'responders_enroute'].includes(a.status)
                        && a.current_latitude && a.current_longitude
                    );
                    setActiveAlerts(active);
                    active.forEach(alert => {
                        const lat = alert.current_latitude || alert.latitude;
                        const lon = alert.current_longitude || alert.longitude;
                        if (lat && lon && !geocodedRef.current.has(alert.id)) {
                            geocodedRef.current.add(alert.id);
                            reverseGeocode(lat, lon).then(addr => {
                                if (addr) setAddresses(prev => ({ ...prev, [alert.id]: addr }));
                            });
                        }
                    });
                })
                .catch(() => {});
        };
        fetchAndGeocode();
        const interval = setInterval(fetchAndGeocode, 8000);
        window.addEventListener('officer-distress-activated', fetchAndGeocode);
        return () => { clearInterval(interval); window.removeEventListener('officer-distress-activated', fetchAndGeocode); };
    }, []);

    if (activeAlerts.length === 0) return null;

    return (
        <React.Fragment>
            {activeAlerts.map(alert => {
                const pos = [alert.current_latitude || alert.latitude, alert.current_longitude || alert.longitude];
                return (
                    <React.Fragment key={alert.id}>
                        {autoCenter && <AutoCenter position={pos} />}
                        <Circle
                            center={pos}
                            radius={100}
                            pathOptions={{ color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.15, weight: 2, dashArray: '6 4' }}
                        />
                        <Marker position={pos} icon={icon}>
                            <Popup maxWidth={280}>
                                <div style={{ fontFamily: 'monospace', background: '#1a0505', color: 'white', padding: '12px', borderRadius: '8px', margin: '-10px' }}>
                                    <div style={{ color: '#FCA5A5', fontWeight: 'bold', fontSize: '13px', marginBottom: '8px' }}>🚨 OFFICER IN DISTRESS</div>
                                    <div style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
                                        UNIT {alert.unit_number || '???'} — {alert.rank ? `${alert.rank} ` : ''}{alert.last_name || alert.officer_name}
                                    </div>
                                    <div style={{ color: '#9CA3AF', fontSize: '11px', marginTop: '4px' }}>
                                        STATUS: {alert.status.replace('_', ' ').toUpperCase()}
                                    </div>
                                    <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                                        ACTIVATED: {new Date(alert.activated_at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true })}
                                    </div>
                                    <div style={{ color: '#6B7280', fontSize: '10px', marginTop: '4px' }}>
                                        📍 {addresses[alert.id] || `${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}`}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    </React.Fragment>
                );
            })}
        </React.Fragment>
    );
}
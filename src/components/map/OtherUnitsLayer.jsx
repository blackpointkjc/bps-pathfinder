import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { Badge } from '@/components/ui/badge';
import { Car, Radio, Clock } from 'lucide-react';

// Get agency label from unit data
const getAgencyLabel = (unitNumber) => {
    if (!unitNumber) return 'UNIT';
    const num = unitNumber.toString().toUpperCase();
    
    if (num.includes('HENRICO') || num.includes('HPD')) return 'HPD';
    if (num.includes('RICHMOND') || num.includes('RPD')) return 'RPD';
    if (num.includes('CHESTERFIELD') || num.includes('CCPD')) return 'CCPD';
    if (num.includes('HFD')) return 'HFD';
    
    return num.slice(0, 4) || 'UNIT';
};

// Law-enforcement-style patrol shield for officer/unit locations.
const createOtherUnitIcon = (status, heading, showLights, isSupervisor, unitNumber) => {
    let statusColor = '#64748B';
    if (status === 'Dispatched' || status === 'Enroute') statusColor = '#EF4444';
    else if (status === 'On Scene') statusColor = '#22C55E';
    else if (status === 'On Patrol') statusColor = '#3B82F6';
    else if (status === 'Busy') statusColor = '#F59E0B';
    else if (status === 'Out of Service') statusColor = '#475569';
    if (isSupervisor) statusColor = '#EAB308';

    const normalizedHeading = Number.isFinite(Number(heading)) ? ((Number(heading) % 360) + 360) % 360 : 0;
    const unitLabel = String(unitNumber || getAgencyLabel(unitNumber) || 'UNIT').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 7) || 'UNIT';
    const emergency = showLights || status === 'Dispatched' || status === 'Enroute' || status === 'On Scene';

    return new L.DivIcon({
        className: 'custom-marker patrol-shield-marker',
        html: `
          <div style="position:relative;width:54px;height:64px;filter:drop-shadow(0 5px 8px rgba(0,0,0,.55));">
            ${emergency ? `<div style="position:absolute;left:13px;top:0;width:28px;height:6px;border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,.9);z-index:4;background:#111827"><span style="position:absolute;left:0;top:0;width:50%;height:100%;background:#ef4444;animation:bpsPoliceFlash .8s infinite"></span><span style="position:absolute;right:0;top:0;width:50%;height:100%;background:#2563eb;animation:bpsPoliceFlash .8s .4s infinite"></span></div>` : ''}
            <svg width="54" height="58" viewBox="0 0 54 58" style="position:absolute;top:5px;left:0;z-index:2;overflow:visible">
              <path d="M27 2 L47 9 V26 C47 40 39 50 27 56 C15 50 7 40 7 26 V9 Z" fill="#081a2d" stroke="${isSupervisor ? '#facc15' : '#dbeafe'}" stroke-width="2.2"/>
              <path d="M27 7 L42 12 V26 C42 36 36 44 27 49 C18 44 12 36 12 26 V12 Z" fill="#0f3b68" stroke="${statusColor}" stroke-width="2"/>
              <circle cx="27" cy="25" r="9" fill="#e5eef8" stroke="#93c5fd" stroke-width="1.2"/>
              <path d="M27 17.2 L29.2 22.3 L34.7 22.8 L30.5 26.5 L31.8 31.8 L27 29 L22.2 31.8 L23.5 26.5 L19.3 22.8 L24.8 22.3 Z" fill="${isSupervisor ? '#eab308' : '#123b63'}"/>
              <circle cx="27" cy="25" r="12.5" fill="none" stroke="${statusColor}" stroke-width="1.4" opacity=".9"/>
              <rect x="13" y="39" width="28" height="10" rx="4" fill="#050b13" stroke="#294d70"/>
              <text x="27" y="46.2" text-anchor="middle" font-size="7" font-weight="900" fill="#ffffff" font-family="Arial, sans-serif">${unitLabel}</text>
              ${isSupervisor ? `<text x="27" y="14" text-anchor="middle" font-size="6" font-weight="900" fill="#fde047" font-family="Arial, sans-serif">SUPV</text>` : ''}
            </svg>
            ${Number.isFinite(Number(heading)) ? `<div style="position:absolute;left:24px;top:-8px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:10px solid ${isSupervisor ? '#facc15' : '#67e8f9'};transform:rotate(${normalizedHeading}deg);transform-origin:4px 39px;z-index:1"></div>` : ''}
          </div>
          <style>@keyframes bpsPoliceFlash{0%,48%{opacity:1}50%,100%{opacity:.2}}</style>
        `,
        iconSize: [54, 64],
        iconAnchor: [27, 56],
        popupAnchor: [0, -50],
    });
};

const getStatusColor = (status) => {
    switch (status) {
        case 'Available': return 'bg-gray-100 text-gray-700';
        case 'Enroute': return 'bg-red-100 text-red-700';
        case 'On Scene': return 'bg-green-100 text-green-700';
        case 'Busy': return 'bg-orange-100 text-orange-700';
        case 'Out of Service': return 'bg-gray-100 text-gray-500';
        default: return 'bg-gray-100 text-gray-700';
    }
};

export default function OtherUnitsLayer({ units, currentUserId, onUnitClick }) {
    if (!units || units.length === 0) return null;
    
    // Officer-safety view: every officer remains an individual marker.
    // Never collapse union/group members into a single lead-unit icon.
    const unitsToShow = units.filter(unit => unit.id !== currentUserId);

    if (unitsToShow.length === 0) return null;
    
    const locationSignature = unitsToShow
        .map(unit => `${unit.id}:${Number(unit.latitude).toFixed(6)}:${Number(unit.longitude).toFixed(6)}:${unit.last_updated || ''}`)
        .sort()
        .join('|');

    return (
        <MarkerClusterGroup
            key={locationSignature}
            chunkedLoading
            maxClusterRadius={8}
            spiderfyOnMaxZoom={true}
            disableClusteringAtZoom={14}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={(cluster) => {
                const count = cluster.getChildCount();
                return L.divIcon({
                    html: `<div style="
                        background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
                        color: white;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        font-size: 14px;
                        border: 3px solid white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    ">${count}</div>`,
                    className: 'custom-cluster-icon',
                    iconSize: [40, 40]
                });
            }}
        >
            {unitsToShow.map((unit) => {
                const markerKey = `${unit.id}-${unit.latitude?.toFixed(5)}-${unit.longitude?.toFixed(5)}-${unit.status}-${unit.last_updated || ''}`;
                return (
                <Marker
                    key={markerKey}
                    position={[unit.latitude, unit.longitude]}
                    icon={createOtherUnitIcon(unit.status, unit.heading, unit.show_lights, unit.is_supervisor, unit.unit_number)}
                    eventHandlers={{ click: () => onUnitClick?.(unit) }}
                >
                        <Popup>
                            <div className="p-3 min-w-[240px]">
                                <div className="flex items-start gap-3 mb-3 pb-3 border-b">
                                    <div className={`w-10 h-10 rounded-full ${unit.is_supervisor ? 'bg-yellow-100' : 'bg-blue-100'} flex items-center justify-center flex-shrink-0`}>
                                        <Car className={`w-5 h-5 ${unit.is_supervisor ? 'text-yellow-600' : 'text-blue-600'}`} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-sm text-gray-900">
                                            {unit.rank && unit.last_name ? `${unit.rank} ${unit.last_name}` : unit.full_name || 'Unknown'}
                                            {unit.is_supervisor && <span className="ml-2 text-yellow-600">★</span>}
                                            {unit.isUnionLead && (
                                                <Badge className="ml-2 bg-green-600 text-white text-xs">
                                                    {unit.unionMembers} Unit Group
                                                </Badge>
                                            )}
                                        </p>
                                        <p className="text-xs text-blue-600 font-semibold">
                                            {unit.union_id || unit.unit_number || 'No Unit ID'}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-600">Status:</span>
                                        <Badge className={getStatusColor(unit.status)}>
                                            {unit.status || 'Available'}
                                        </Badge>
                                    </div>

                                    {unit.speed !== undefined && unit.speed !== null && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">Speed:</span>
                                            <span className="text-sm font-bold text-gray-900">{Math.round(unit.speed)} mph</span>
                                        </div>
                                    )}

                                    {unit.current_call_info && (
                                        <div className="pt-2 border-t">
                                            <div className="flex items-start gap-2">
                                                <Radio className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                                <span className="text-xs text-gray-700 leading-relaxed">{unit.current_call_info}</span>
                                            </div>
                                        </div>
                                    )}

                                    {unit.last_updated && (
                                        <div className="flex items-center gap-1.5 text-gray-500 pt-2 border-t">
                                            <Clock className="w-3 h-3" />
                                            <span className="text-xs">Last seen: {new Date(unit.last_updated).toLocaleTimeString()}</span>
                                        </div>
                                    )}
                                    {onUnitClick && (
                                        <button onClick={() => onUnitClick(unit)} className="mt-3 w-full rounded bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-600">
                                            Navigate to Unit
                                        </button>
                                    )}
                                </div>
                            </div>
                        </Popup>
                        </Marker>
                        );
                        })}
                        </MarkerClusterGroup>
                        );
                        }
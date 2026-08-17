/**
 * ActiveCallMarkers — PURE RENDER ONLY.
 * Consumes pre-geocoded calls. Never fetches, geocodes, or modifies state.
 */
import { Marker } from 'react-leaflet';
import L from 'leaflet';

const createCallIcon = (call, isHighPriority = false) => {
    const incident = call.incident?.toLowerCase() || '';
    const agency = call.agency || '';
    const isApproximate = call.geo_approximate === true;

    const isEMS = incident.includes('ems') || incident.includes('medical') ||
        incident.includes('ambulance') || incident.includes('unconscious') ||
        incident.includes('overdose') || incident.includes('stroke') ||
        incident.includes('cardiac');

    const isFire = agency.includes('FD') || incident.includes('fire') ||
        incident.includes('smoke') || incident.includes('alarm');

    let statusColor = '#EF4444';
    if (call.status?.toLowerCase().includes('arrived') ||
        call.status?.toLowerCase().includes('arv') ||
        call.status?.toLowerCase().includes('on scene')) {
        statusColor = '#10B981';
    }

    let iconSvg = '';
    let bgColor = '#1E40AF';

    if (isEMS) {
        bgColor = '#D97706';
        iconSvg = `<text x="20" y="26" font-size="18" text-anchor="middle" font-family="Arial">🚑</text>`;
    } else if (isFire) {
        bgColor = '#DC2626';
        iconSvg = `<text x="20" y="26" font-size="18" text-anchor="middle" font-family="Arial">🔥</text>`;
    } else {
        bgColor = '#1E40AF';
        iconSvg = `<text x="20" y="26" font-size="16" text-anchor="middle" font-family="Arial" fill="white" font-weight="bold">PD</text>`;
    }

    const outerRing = isApproximate
        ? `<circle cx="20" cy="20" r="18" fill="none" stroke="#FBBF24" stroke-width="3" stroke-dasharray="4 2"/>`
        : '';

    return new L.DivIcon({
        className: 'custom-call-marker',
        html: `
            <div style="position:relative;width:40px;height:40px;">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="${bgColor}" stroke="${isHighPriority ? '#EF4444' : 'white'}" stroke-width="${isApproximate ? 1.5 : 3}" ${isApproximate ? 'opacity="0.75"' : ''}/>
                    ${iconSvg}
                    <circle cx="32" cy="8" r="6" fill="${statusColor}" stroke="white" stroke-width="2"/>
                    ${outerRing}
                </svg>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });
};

const assessCallPriority = (call) => {
    const combined = `${call.incident || ''} ${call.description || ''}`.toLowerCase();
    if (combined.includes('shooting') || combined.includes('shots fired') ||
        combined.includes('stabbing') || combined.includes('officer down') ||
        combined.includes('active shooter') || combined.includes('10-00') ||
        combined.includes('cardiac arrest') || combined.includes('person with gun')) {
        return { score: 4 };
    }
    if (combined.includes('assault') || combined.includes('robbery') ||
        combined.includes('burglary in progress') || combined.includes('domestic') ||
        combined.includes('pursuit') || combined.includes('fire') ||
        combined.includes('accident with injury')) {
        return { score: 3 };
    }
    return { score: 1 };
};

export default function ActiveCallMarkers({ calls, onCallClick }) {
    if (!calls || calls.length === 0) return null;

    const renderable = calls.filter(c =>
        Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude)) &&
        Number(c.latitude) !== 0 && Number(c.longitude) !== 0
    ).map(c => ({ ...c, latitude: Number(c.latitude), longitude: Number(c.longitude) }));

    return (
        <>
            {renderable.map((call, index) => {
                const priority = assessCallPriority(call);
                return (
                    <Marker
                        key={call.id || `call-${index}`}
                        position={[call.latitude, call.longitude]}
                        icon={createCallIcon(call, priority.score >= 3)}
                        eventHandlers={{ click: () => onCallClick?.(call) }}
                    />
                );
            })}
        </>
    );
}
import useLiveMapWindow from '@/hooks/useLiveMapWindow';
import {isLiveMapCall} from '../../../base44/functions/_shared/callFeedPolicy.js';
import {incidentPriority} from '@/lib/incidentPriority';
/**
 * ActiveCallMarkers — PURE RENDER ONLY.
 * Consumes pre-geocoded calls. Never fetches, geocodes, or modifies state.
 */
import { Fragment } from 'react';
import { CircleMarker, Marker, Pane, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

const EMPTY_CALLS=[];
const createCallIcon = (call, priority = "medium") => {
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
        className: 'custom-call-marker cad-priority-marker',
        html: `
            <div data-priority="${priority}" class="cad-marker-priority-ring" style="position:relative;width:40px;height:40px;">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="${bgColor}" stroke="${priority==='critical'?'#EF4444':priority==='high'?'#FACC15':'white'}" stroke-width="${isApproximate ? 1.5 : 3}" ${isApproximate ? 'opacity="0.75"' : ''}/>
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

export default function ActiveCallMarkers({ calls, onCallClick }) {
    const map = useMap();
    const recent=useLiveMapWindow(calls||EMPTY_CALLS);
    if (!recent.length) return null;

    const renderable = recent.filter(c=>isLiveMapCall(c)).map(c => ({ ...c, latitude: Number(c.latitude), longitude: Number(c.longitude) }));

    return (
        <Pane name="active-cad-calls" pane={map.getPane('norotatePane') ? 'norotatePane' : undefined} style={{ zIndex: 7 }}>
            {renderable.map((call, index) => {
                const priority = incidentPriority(call);
                const key = call.id || `call-${index}`;
                const fillColor = priority==='critical'?'#ef4444':priority==='high'?'#facc15':'#2563eb';
                return (
                    <Fragment key={key}>
                        <CircleMarker
                            pane="overlayPane"
                            center={[call.latitude, call.longitude]}
                            radius={13}
                            interactive={false}
                            pathOptions={{ color: '#ffffff', weight: 3, fillColor, fillOpacity: 0.85 }}
                        />
                        <Marker
                            pane="active-cad-calls"
                            position={[call.latitude, call.longitude]}
                            icon={createCallIcon(call, priority)}
                            zIndexOffset={priority==='critical'?1300:priority==='high'?1200:900}
                            eventHandlers={{ click: () => onCallClick?.(call) }}
                        >
                            <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
                                <div style={{ fontWeight: 700 }}>{call.pathfinder_local_response?'LOCAL · ':''}{call.incident || 'Active Call'}</div>
                                <div>{(call.call_id || call.agency_cad_number || call.bps_reference || '')}</div>
                            </Tooltip>
                        </Marker>
                    </Fragment>
                );
            })}
        </Pane>
    );
}
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import TrafficLayer from './TrafficLayer';
import ActiveCallMarkers from './ActiveCallMarkers';
import OtherUnitsLayer from './OtherUnitsLayer';
import JurisdictionBoundaries from './JurisdictionBoundaries';
import PrecinctMarkers from './PrecinctMarkers';
import PoliceStationMarkers from './PoliceStationMarkers';
import JailMarkers from './JailMarkers';
import SearchPinMarker from './SearchPinMarker';
import NavigationCamera from './NavigationCamera';
import FireStationMarkers from './FireStationMarkers';
import ChesterfieldFireStations from './ChesterfieldFireStations';
import VolunteerRescueSquads from './VolunteerRescueSquads';
import VolunteerFireCompanies from './VolunteerFireCompanies';
import RAAStations from './RAAStations';
import CCPDStation from './CCPDStation';
import CallHeatmapLayer from './CallHeatmapLayer';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const makeCurrentOfficerShield = (heading = null, withLights = false, unitName = 'YOU') => {
    const normalizedHeading = Number.isFinite(Number(heading)) ? ((Number(heading) % 360) + 360) % 360 : 0;
    const unitLabel = String(unitName || 'YOU').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 7) || 'YOU';
    return new L.DivIcon({
        className: 'custom-marker patrol-shield-marker current-officer-marker',
        html: `
          <div style="position:relative;width:58px;height:68px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.58));">
            ${withLights ? `<div style="position:absolute;left:14px;top:0;width:30px;height:7px;border-radius:5px;overflow:hidden;border:1px solid #fff;z-index:4;background:#111827"><span style="position:absolute;left:0;top:0;width:50%;height:100%;background:#ef4444;animation:bpsCurrentFlash .75s infinite"></span><span style="position:absolute;right:0;top:0;width:50%;height:100%;background:#2563eb;animation:bpsCurrentFlash .75s .375s infinite"></span></div>` : ''}
            <svg width="58" height="61" viewBox="0 0 58 61" style="position:absolute;top:6px;left:0;z-index:2;overflow:visible">
              <path d="M29 2 L51 10 V28 C51 43 42 53 29 59 C16 53 7 43 7 28 V10 Z" fill="#06101d" stroke="#67e8f9" stroke-width="2.6"/>
              <path d="M29 8 L45 14 V28 C45 38 39 46 29 51 C19 46 13 38 13 28 V14 Z" fill="#124776" stroke="#38bdf8" stroke-width="2"/>
              <circle cx="29" cy="27" r="10" fill="#edf6ff" stroke="#7dd3fc" stroke-width="1.4"/>
              <path d="M29 18 L31.5 23.8 L37.8 24.3 L33 28.6 L34.5 34.5 L29 31.4 L23.5 34.5 L25 28.6 L20.2 24.3 L26.5 23.8 Z" fill="#0c4a6e"/>
              <rect x="14" y="42" width="30" height="10" rx="4" fill="#020617" stroke="#38bdf8"/>
              <text x="29" y="49.2" text-anchor="middle" font-size="7" font-weight="900" fill="#fff" font-family="Arial, sans-serif">${unitLabel}</text>
            </svg>
            ${Number.isFinite(Number(heading)) ? `<div style="position:absolute;left:25px;top:-9px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:11px solid #67e8f9;transform:rotate(${normalizedHeading}deg);transform-origin:4px 42px;z-index:1"></div>` : ''}
          </div>
          <style>@keyframes bpsCurrentFlash{0%,48%{opacity:1}50%,100%{opacity:.18}}</style>
        `,
        iconSize: [58, 68],
        iconAnchor: [29, 59],
        popupAnchor: [0, -54],
    });
};

const createCurrentLocationIcon = (withLights = false, unitName = 'YOU') => makeCurrentOfficerShield(null, withLights, unitName);
const createLocationWithHeading = (heading, withLights = false, unitName = 'YOU') => makeCurrentOfficerShield(heading, withLights, unitName);

// Custom red marker for destination
const destinationIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `
        <div style="
            width: 32px;
            height: 32px;
            background: #FF3B30;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(255,59,48,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
        </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// Component to handle map center updates
function MapController({ center, routeBounds, mapCenter, fitBounds, isNavigating, heading }) {
    const map = useMap();
    const prevCenterRef = useRef(center);
    const userInteractingRef = useRef(false);
    const lastUpdateTimeRef = useRef(0);

    useEffect(() => {
        // Track user interaction. Keep the delayed reset cancellable so no map
        // lifecycle work survives a CAD Center tab/unmount transition.
        let interactionTimer = null;
        const handleMoveStart = () => { userInteractingRef.current = true; };
        const handleMoveEnd = () => {
            if (interactionTimer) window.clearTimeout(interactionTimer);
            interactionTimer = window.setTimeout(() => { userInteractingRef.current = false; }, 5000);
        };

        map.on('movestart', handleMoveStart);
        map.on('moveend', handleMoveEnd);

        return () => {
            if (interactionTimer) window.clearTimeout(interactionTimer);
            map.off('movestart', handleMoveStart);
            map.off('moveend', handleMoveEnd);
            map.closePopup();
            map.stop();
        };
    }, [map]);

    useEffect(() => {
        // Leaflet does not automatically know when its embedded Center panel
        // changes size. Keep its internal viewport synchronized with the actual
        // Live Map canvas and cancel the observer cleanly on unmount.
        const container = map.getContainer();
        let frame = null;
        const refresh = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                if (container?.isConnected) map.invalidateSize({ animate: false, pan: false });
            });
        };
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refresh) : null;
        observer?.observe(container);
        refresh();
        return () => {
            observer?.disconnect();
            if (frame) cancelAnimationFrame(frame);
        };
    }, [map]);

    // Handle external map centering (from call detail sidebar)
    useEffect(() => {
        if (mapCenter) {
            map.setView(mapCenter, 16, { animate: true, duration: 0.5 });
        }
    }, [mapCenter, map]);

    // Handle "fit all units" — zoom out so every unit with GPS is visible
    useEffect(() => {
        if (!fitBounds || fitBounds.length === 0) return;
        const valid = fitBounds.filter(c => Number.isFinite(c[0]) && Number.isFinite(c[1]));
        if (valid.length === 0) return;
        const bounds = L.latLngBounds(valid.map(c => [c[0], c[1]]));
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [70, 70], animate: true, duration: 0.5 });
        }
    }, [fitBounds, map]);

    useEffect(() => {
        // Don't auto-center if user is manually panning
        if (userInteractingRef.current) return;

        // Throttle updates to improve performance
        const now = Date.now();
        if (now - lastUpdateTimeRef.current < 1000) return;
        lastUpdateTimeRef.current = now;

        if (routeBounds && !isNavigating) {
            // Only fit bounds when first showing route, not during navigation
            map.fitBounds(routeBounds, { padding: [50, 50] });
        } else if (center && (!prevCenterRef.current || 
            Math.abs(center[0] - prevCenterRef.current[0]) > 0.00005 || 
            Math.abs(center[1] - prevCenterRef.current[1]) > 0.00005)) {

            // When navigating, keep map zoomed in and centered on user
            if (isNavigating) {
                map.setView(center, 18, { animate: true, duration: 0.3 });
            } else {
                // Don't auto-zoom when not navigating, just pan to follow user
                map.panTo(center, { animate: true, duration: 0.3 });
            }
            prevCenterRef.current = center;
        }
    }, [center, routeBounds, map, isNavigating]);

    return null;
}

const MapView = function MapView({ currentLocation, destination, route, trafficSegments, useOfflineTiles, activeCalls, heading, locationHistory, unitName, showLights, otherUnits, currentUserId, onCallClick, speed, mapCenter, fitBounds, isNavigating, baseMapType = 'street', jurisdictionFilters, showPoliceStations = true, showFireStations = true, showJails = true, searchPin = null, onNavigateToJail = () => {}, mapTheme = 'day', showHeatmap = false, children, allCalls = [] }) {
    const defaultCenter = currentLocation || [37.5407, -77.4360]; // Default to Richmond, VA
    
    // Calculate route bounds if route exists
    const routeBounds = route && route.length > 0 
        ? L.latLngBounds(route.map(coord => [coord[0], coord[1]]))
        : null;

    // Determine tile layer URL based on base map type and theme
    const getTileLayerUrl = () => {
        // Navigation uses the original Leaflet day/night basemaps.
        if (isNavigating) {
            return mapTheme === 'night'
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        }

        if (useOfflineTiles) {
            return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        }

        if (mapTheme === 'night') {
            if (baseMapType === 'satellite') {
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            }
            return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        }

        switch (baseMapType) {
            case 'satellite':
                return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            case 'topo':
                return 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
            case 'street':
            default:
                return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        }
    };

    const getTileAttribution = () => {
        if (mapTheme === 'night' && baseMapType !== 'satellite') {
            return '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
        }
        
        switch (baseMapType) {
            case 'satellite':
                return '&copy; <a href="https://www.esri.com/">Esri</a>';
            case 'topo':
                return '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>';
            case 'street':
            default:
                return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
        }
    };

    return (
        <MapContainer
            center={defaultCenter}
            zoom={isNavigating ? 18 : 13}
            className="h-full w-full"
            zoomControl={false}
            minZoom={3}
            maxZoom={20}
        >
            <TileLayer
                key={`${baseMapType}-${mapTheme}-${isNavigating ? 'nav' : 'normal'}`}
                attribution={getTileAttribution()}
                url={getTileLayerUrl()}
                maxZoom={20}
                maxNativeZoom={20}
                className={mapTheme === 'night' ? 'map-night-mode' : ''}
            />

            {/* Jurisdiction Boundaries */}
            <JurisdictionBoundaries filters={jurisdictionFilters} />

            {/* Richmond precinct markers */}
            <PrecinctMarkers showStations={showPoliceStations} onNavigateToPrecinct={onNavigateToJail} />

            {/* Police station markers */}
            <PoliceStationMarkers showStations={showPoliceStations} onNavigateToStation={onNavigateToJail} />

            {/* Jail markers */}
            <JailMarkers showJails={showJails} onNavigateToJail={onNavigateToJail} />

            {/* Fire station markers */}
            <FireStationMarkers showStations={showFireStations} onNavigateToStation={onNavigateToJail} />

            {/* Chesterfield Fire Department */}
            <ChesterfieldFireStations showStations={showFireStations} onNavigateToStation={onNavigateToJail} />

            {/* Volunteer Rescue Squads */}
            <VolunteerRescueSquads showStations={jurisdictionFilters?.showEMS} onNavigateToStation={onNavigateToJail} />

            {/* Volunteer Fire Companies */}
            <VolunteerFireCompanies showStations={showFireStations} onNavigateToStation={onNavigateToJail} />

            {/* Richmond Ambulance Authority */}
            <RAAStations showStations={jurisdictionFilters?.showEMS} onNavigateToStation={onNavigateToJail} />

            {/* Chesterfield County Police */}
            <CCPDStation showStations={showPoliceStations} onNavigateToStation={onNavigateToJail} />
            
            {!isNavigating ? (
                <MapController 
                    center={currentLocation} 
                    routeBounds={routeBounds}
                    mapCenter={mapCenter}
                    fitBounds={fitBounds}
                    isNavigating={isNavigating}
                    heading={heading}
                />
            ) : (
                <NavigationCamera
                    isNavigating={isNavigating}
                    currentLocation={currentLocation}
                    heading={heading}
                    speed={speed}
                    onUserInteraction={otherUnits ? undefined : undefined}
                />
            )}

            {currentLocation && (
                <Marker
                    key={`self-${currentLocation[0].toFixed(6)}-${currentLocation[1].toFixed(6)}`}
                    position={currentLocation}
                    icon={heading !== null ? createLocationWithHeading(heading, showLights, unitName) : createCurrentLocationIcon(showLights, unitName)}
                />
            )}
            
            {/* Location History Trail */}
            {locationHistory && locationHistory.length > 1 && (
                <Polyline
                    positions={locationHistory}
                    pathOptions={{
                        color: '#007AFF',
                        weight: 3,
                        opacity: 0.4,
                        dashArray: '5, 10',
                        lineCap: 'round',
                        lineJoin: 'round'
                    }}
                />
            )}
            
            {destination && (
                <Marker position={destination.coords} icon={destinationIcon}>
                    <Popup autoPan={false}>
                        <span className="font-medium">{destination.name}</span>
                    </Popup>
                </Marker>
            )}
            
            {trafficSegments && trafficSegments.length > 0 ? (
                <TrafficLayer trafficSegments={trafficSegments} />
            ) : route && route.length > 0 ? (
                <>
                    <Polyline
                        positions={route}
                        pathOptions={{
                            color: '#ffffff',
                            weight: 10,
                            opacity: 0.95,
                            lineCap: 'round',
                            lineJoin: 'round'
                        }}
                    />
                    <Polyline
                        positions={route}
                        pathOptions={{
                            color: '#1a73e8',
                            weight: 6,
                            opacity: 1,
                            lineCap: 'round',
                            lineJoin: 'round'
                        }}
                    />
                </>
            ) : null}

            {/* Active Emergency Calls */}
            {activeCalls && activeCalls.length > 0 && (
                <ActiveCallMarkers calls={activeCalls} onCallClick={onCallClick} />
            )}

            {/* Other Units */}
            {otherUnits && otherUnits.length > 0 && (
                <OtherUnitsLayer units={otherUnits} currentUserId={currentUserId} onUnitClick={(unit) => onNavigateToJail({ coords: [Number(unit.latitude), Number(unit.longitude)], name: unit.unit_number ? `Unit ${unit.unit_number}` : unit.full_name || 'Officer unit' })} />
            )}
            
            {/* Search Pin */}
            {searchPin && <SearchPinMarker position={searchPin.coords} address={searchPin.address} propertyInfo={searchPin.propertyInfo} />}
            
            {/* Call Volume Heatmap */}
            <CallHeatmapLayer enabled={showHeatmap} calls={allCalls} />

            {/* Additional children (e.g., VA Counties) */}
            {children}
        </MapContainer>
    );
}

export default MapView;
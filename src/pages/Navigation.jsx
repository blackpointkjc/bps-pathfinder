import MapToolDock from '@/components/map/MapToolDock';
import MapCallPanel from '@/components/map/MapCallPanel';
import '@/components/map/mapWorkspace.css';
import { createPortal } from 'react-dom';
import { readRecentDestinations, rememberDestination } from '@/lib/recentDestinations';
import { shouldSetDispatchEnroute } from '@/lib/navigationStatus';
import { observeElementSize } from '@/lib/observeElementSize';
import LiveMapToolbar from '@/components/map/LiveMapToolbar';
import usePatrolSpeeding from '@/components/usePatrolSpeeding';
import PatrolSpeedSigns from '@/components/map/PatrolSpeedSigns';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import MapView from '@/components/map/MapView';
import { projectOntoRoute } from '@/lib/navigationGeometry';
import {
    Layers, MapPin, Users,
    Eye, EyeOff, Crosshair, Flame, X, AlertTriangle, Navigation2, Square, Search,
    ArrowUp, CornerUpLeft, CornerUpRight, RotateCcw, Volume2, VolumeX, LocateFixed, Home
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { lookupDistrict } from '@/utils/districtLookup';
import { isCriticalCall } from '@/lib/cadCallUtils';
import { splitCallsByCoords } from '@/lib/geocodingPipeline';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import { getLiveLocation, startLiveLocationTracking, locationQuality, requestBestLiveLocation, subscribeLiveLocation, waitForLiveLocation } from '@/lib/liveLocationService';
import { usePathfinderMapTheme } from '@/components/map/PathfinderTileLayer';
import { applyOfficerLocationEvent, getOfficerLocationSnapshot, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import { announceNavigationInstruction, stopVoice } from '@/utils/voiceAnnouncer';
import { formatEasternTime } from '@/lib/easternTime';
import { cadCallFeedIsStale, refreshCadIngestionIfStale } from '@/lib/cadCallFeed';
import { applyDispatchCallEvent, subscribeDispatchCallChanges } from '@/lib/dispatchCallRealtime';
import { clearActiveDispatchCallMemoryCache, dedupeOperationalCalls, loadActiveDispatchCallRows, getActiveDispatchCallReadTime } from '@/lib/activeDispatchCalls';
import { persistOfficerStatus } from '@/lib/officerStatusService';
import { lookupNavigationDestinations, lookupNavigationPoint } from '@/lib/navigationGeocoding';
import { withRequestTimeout } from '@/lib/requestTimeout';
import { getExternalGpsStatus, startExternalGpsAutoReconnect, requestExternalGpsConnection, subscribeExternalGpsStatus } from '@/lib/externalGpsService';
import { getCurrentDirectoryUser } from '@/lib/appDirectory';

const TomTomSdkMapPreview = lazy(() => import('@/components/map/TomTomSdkMapPreview'));

const validPosition = (lat, lng) => [lat,lng].every(value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value))) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 && !(Number(lat) === 0 && Number(lng) === 0);
const liveSpeedMph = value => {
    const speed = Math.max(0, Number(value) || 0);
    return speed >= 5 ? speed : 0;
};
const profileHomeAddress = profile => [profile?.address, profile?.city, profile?.state, profile?.zip]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
const toRadians = value => Number(value) * Math.PI / 180;
const distanceMetersBetween = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
    const dLat = toRadians(Number(b[0]) - Number(a[0]));
    const dLng = toRadians(Number(b[1]) - Number(a[1]));
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(Number(a[0]))) * Math.cos(toRadians(Number(b[0]))) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};
const angleDifference = (a, b) => {
    if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return 0;
    return Math.abs((((Number(a) - Number(b)) % 360) + 540) % 360 - 180);
};


const STATUS_DOT = {
    'Available': 'bg-slate-400',
    'Dispatched': 'bg-cyan-400',
    'Enroute': 'bg-red-500',
    'On Scene': 'bg-green-400',
    'Busy': 'bg-yellow-400',
    'Supervisor': 'bg-yellow-300',
    'Out of Service': 'bg-slate-600',
};
const MY_STATUSES = [
    { label: 'Available', dot: 'bg-slate-400', shortcode: '10-8' },
    { label: 'Enroute', dot: 'bg-red-500', shortcode: '10-76' },
    { label: 'On Scene', dot: 'bg-green-400', shortcode: '10-23' },
    { label: 'Busy', dot: 'bg-yellow-400', shortcode: '10-6' },
    { label: 'Out of Service', dot: 'bg-slate-600', shortcode: '10-7' },
];

export default function Navigation() {
    const navigate = useNavigate();
    const [currentLocation, setCurrentLocation] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [otherUnits, setOtherUnits] = useState([]);
    const [activeCalls, setActiveCalls] = useState([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isLiveTracking, setIsLiveTracking] = useState(false);
    // Free map by default: tracking a GPS marker should never commandeer the
    // viewport while the officer is inspecting the area. Navigation / Recenter
    // explicitly opt in to camera-follow.
    const [followMyLocation, setFollowMyLocation] = useState(false);
    const [gpsQuality, setGpsQuality] = useState({ state: 'acquiring', accuracy: null });
    const [externalReceiver, setExternalReceiver] = useState(() => getExternalGpsStatus());
    const [gpsRecovering, setGpsRecovering] = useState(false);
    const [gpsStatusClock, setGpsStatusClock] = useState(Date.now());
    useEffect(() => { const interval = window.setInterval(() => setGpsStatusClock(Date.now()), 5000); return () => window.clearInterval(interval); }, []);
    useEffect(() => subscribeExternalGpsStatus(status => setExternalReceiver(status)), []);
    const [showActiveCalls, setShowActiveCalls] = useState(true);
    const [heading, setHeading] = useState(null);
    const [speed, setSpeed] = useState(0);
    const [roadSpeedLimit, setRoadSpeedLimit] = useState(null);
    const [roadSpeedLimitAt, setRoadSpeedLimitAt] = useState(0);
    const [roadSpeedLimitEstimated, setRoadSpeedLimitEstimated] = useState(false);
    const [roadSpeedLimitSource, setRoadSpeedLimitSource] = useState('');
    const [roadSpeedLimitRoad, setRoadSpeedLimitRoad] = useState('');
    const [roadSpeedLimitStatus, setRoadSpeedLimitStatus] = useState('Waiting for precise GPS');
    const [navigationDisplayLocation, setNavigationDisplayLocation] = useState(null);
    const [locationHistory, setLocationHistory] = useState([]);
    const [unitStatus, setUnitStatus] = useState('Available');
    const [statusSaving, setStatusSaving] = useState(false);
    const toolbarRef = useRef(null);
    const [toolbarHeight,setToolbarHeight] = useState(110);
    const [mapFullscreen, setMapFullscreen] = useState(false);
    const [callsRefreshing, setCallsRefreshing] = useState(false);
    const nativeFullscreenRef = useRef(false);
    const toggleMapFullscreen = async () => {
        if (mapFullscreen) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (document.fullscreenElement || document.webkitFullscreenElement) await exit?.call(document);
            setMapFullscreen(false);
            return;
        }
        setMapFullscreen(true);
        const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (!request) {
            toast.info('This browser supports expanded map view only. Install Pathfinder to the Home Screen for a browser-bar-free view.');
            return;
        }
        try { await request.call(document.documentElement, { navigationUI: 'hide' }); nativeFullscreenRef.current = true; }
        catch { toast.info('Device fullscreen was blocked. Open Pathfinder directly outside the editor, or install it to your Home Screen. Expanded map view is active.'); }
    };
    useEffect(() => {
        const changed = () => {
            const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (active) nativeFullscreenRef.current = true;
            else if (nativeFullscreenRef.current) { nativeFullscreenRef.current = false; setMapFullscreen(false); }
        };
        document.addEventListener('fullscreenchange', changed);
        document.addEventListener('webkitfullscreenchange', changed);
        return () => {
            document.removeEventListener('fullscreenchange', changed);
            document.removeEventListener('webkitfullscreenchange', changed);
            if (nativeFullscreenRef.current) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(()=>{});
        };
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('pf-map-fullscreen', mapFullscreen);
        const escape = event => { if (event.key === 'Escape') setMapFullscreen(false); };
        window.addEventListener('keydown', escape);
        window.dispatchEvent(new Event('resize'));
        return () => {
            document.documentElement.classList.remove('pf-map-fullscreen');
            window.removeEventListener('keydown', escape);
        };
    }, [mapFullscreen]);

    useEffect(() => {
        const element = toolbarRef.current;
        if (!element) return;
        const observer = observeElementSize(element, ({height}) => {
            setToolbarHeight(previous => previous === height ? previous : height);
        });
        return () => observer.disconnect();
    }, []);
    const [unitName] = useState(localStorage.getItem('unitName') || '');
    const [mapTheme, setMapTheme] = usePathfinderMapTheme();
    const [showCallSidebar, setShowCallSidebar] = useState(false);
    const [callSidebarCollapsed, setCallSidebarCollapsed] = useState(false);
    const [selectedCall, setSelectedCall] = useState(null);
    const [callDistrict, setCallDistrict] = useState(null);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [useTomTomMainMap, setUseTomTomMainMap] = useState(true);
    const [tomTomMainMapFailed, setTomTomMainMapFailed] = useState(false);
    const [tomTomRecoveryAttempt, setTomTomRecoveryAttempt] = useState(0);
    const [tomTomRetryAt, setTomTomRetryAt] = useState(0);
    const tomTomRetryTimerRef=useRef(null);
    const tomTomErrorCountRef=useRef(0);
    const markTomTomUnavailable=()=>{
        // Keep the CAD backup visible while the retry scheduler recovers TomTom.
        setTomTomMainMapFailed(true);
        tomTomErrorCountRef.current+=1;
    };
    const markTomTomReady=()=>{
        // Reset exponential retry delay once the real TomTom base map is loaded.
        tomTomErrorCountRef.current=0;
        setTomTomRetryAt(0);
    };
    useEffect(()=>{
        if(!useTomTomMainMap || !tomTomMainMapFailed || !isOnline)return undefined;
        // Bounded exponential backoff: 8s, 16s, 32s, then up to 2 minutes.
        // Prevents a failing TomTom provider or API key from being flooded.
        const delay=Math.min(120000,8000*Math.pow(2,Math.min(4,tomTomErrorCountRef.current-1)));
        const next=Date.now()+delay;
        setTomTomRetryAt(next);
        tomTomRetryTimerRef.current=window.setTimeout(()=>{
            tomTomRetryTimerRef.current=null;
            if(!navigator.onLine)return;
            setTomTomMainMapFailed(false);
            setTomTomRecoveryAttempt(n=>n+1);
            setTomTomRetryAt(0);
        },delay);
        return()=>{window.clearTimeout(tomTomRetryTimerRef.current);tomTomRetryTimerRef.current=null;};
    },[useTomTomMainMap,tomTomMainMapFailed,isOnline]);
    useEffect(()=>{
        if(!useTomTomMainMap)return undefined;
        const recover=()=>{
            if(!navigator.onLine || document.visibilityState!=='visible')return;
            if(!tomTomMainMapFailed)return;
            // Immediately retry when internet returns or the user returns to
            // the GPS page. Cancel the scheduled backoff for this one attempt.
            window.clearTimeout(tomTomRetryTimerRef.current);
            tomTomRetryTimerRef.current=null;
            setTomTomMainMapFailed(false);
            setTomTomRecoveryAttempt(n=>n+1);
            setTomTomRetryAt(0);
        };
        window.addEventListener('online',recover);
        document.addEventListener('visibilitychange',recover);
        return()=>{window.removeEventListener('online',recover);document.removeEventListener('visibilitychange',recover);};
    },[useTomTomMainMap,tomTomMainMapFailed]);
    const [assigning, setAssigning] = useState(false);
    const [unmappedCalls, setUnmappedCalls] = useState([]);
    const [showUnmapped, setShowUnmapped] = useState(false);
    useEffect(() => { setUnmappedCalls(splitCallsByCoords(activeCalls).unmapped); }, [activeCalls]);
    const [leftPanelOpen, setLeftPanelOpen] = useState(true);
    const [leftTab, setLeftTab] = useState('units'); // 'units' | 'calls'
    const [showOnlyCriticalCalls, setShowOnlyCriticalCalls] = useState(false);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [navDestination, setNavDestination] = useState(null);
    const [recentDestinations, setRecentDestinations] = useState([]);
    useEffect(() => { setRecentDestinations(readRecentDestinations(currentUser?.id)); }, [currentUser?.id]);

    const [navRoute, setNavRoute] = useState([]);
    const [navSpeedLimitSections, setNavSpeedLimitSections] = useState([]);
    const [navTrafficSegments, setNavTrafficSegments] = useState([]);
    const [showTomTomTraffic, setShowTomTomTraffic] = useState(true);
    const [navSteps, setNavSteps] = useState([]);
    const [navRouteProvider, setNavRouteProvider] = useState('');
    const [manualOriginQuery, setManualOriginQuery] = useState('');
    const [routePreviewOnly, setRoutePreviewOnly] = useState(false);
    const [navStepIndex, setNavStepIndex] = useState(0);
    const [navDistanceMiles, setNavDistanceMiles] = useState(0);
    const [navDurationMinutes, setNavDurationMinutes] = useState(0);
    const [navTurnDistanceFeet, setNavTurnDistanceFeet] = useState(0);
    const [isNavigating, setIsNavigating] = useState(false);
    const [navVoiceMuted, setNavVoiceMuted] = useState(() => {
        try { return localStorage.getItem('bps:navigation-voice-muted') === '1'; } catch { return false; }
    });
    const [navOffRoute, setNavOffRoute] = useState(false);
    const [routing, setRouting] = useState(false);
    const [addressQuery, setAddressQuery] = useState('');
    const [addressResults, setAddressResults] = useState([]);
    const [addressSearching, setAddressSearching] = useState(false);
    const [addressSearchError, setAddressSearchError] = useState('');
    const [navigationFallbackAddress, setNavigationFallbackAddress] = useState('');
    const [showAddressSearch, setShowAddressSearch] = useState(false);
    const [mapPickMode, setMapPickMode] = useState(false);
    const [mapSelectedDestination, setMapSelectedDestination] = useState(null);
    const [homeDestination, setHomeDestination] = useState(null);
    const [streetViewUrl, setStreetViewUrl] = useState('');
    const [fitBounds, setFitBounds] = useState(null);
    const lastSpokenNavStepRef = useRef(-1);
    const spokenNavPromptsRef = useRef(new Set());
    const lastRerouteAtRef = useRef(0);
    const offRouteSinceRef = useRef(0);
    const offRouteConfirmationsRef = useRef(0);
    const lastSpeedLimitLookupRef = useRef({ at: 0, lat: null, lng: null, road: '' });
    const speedLimitRequestSeqRef = useRef(0);
    const [speedLimitRetryRevision, setSpeedLimitRetryRevision] = useState(0);
    const [gpsFixSource, setGpsFixSource] = useState('');
    const navRouteSummaryRef = useRef({ distanceMeters: 0, durationSeconds: 0 });
    const navSnapIndexRef = useRef(0);
    const navStepRouteIndexesRef = useRef([]);
    const destinationRequestRef = useRef(0);
    const callsLoadingRef = useRef(false);
    const [callsError, setCallsError] = useState('');
    const [callsCheckedAt, setCallsCheckedAt] = useState(null);

    const patrolSpeedMonitor=usePatrolSpeeding({
        user:currentUser,limit:roadSpeedLimit,limitAt:roadSpeedLimitAt,
        road:roadSpeedLimitRoad,source:roadSpeedLimitSource,
        estimated:roadSpeedLimitEstimated,
        navVoiceMuted,
    });
    const speedSignQualified=Boolean(isLiveTracking && gpsQuality?.state==='live'
      && Number(gpsQuality?.accuracy)<=100 && !roadSpeedLimitEstimated
      && roadSpeedLimitAt>0 && Date.now()-roadSpeedLimitAt<70000
      && getLiveLocation(30000));

    const isSupervisorUser = currentUser?.is_supervisor === true || currentUser?.role === 'admin';
    const isDispatchOrAdmin = currentUser?.role === 'admin' || currentUser?.is_supervisor || currentUser?.dispatch_role;
    const homeAddress = profileHomeAddress(currentUser);
    const selfAssignedToCall = Boolean(String(currentUser?.current_call_id || '').trim());
    const flashSelfAssignedEnroute = String(unitStatus || currentUser?.status || '').trim().toLowerCase() === 'enroute'
        && selfAssignedToCall;

    const [mapToolsPanel, setMapToolsPanel] = useState(null);
    const [jurisdictionFilters, setJurisdictionFilters] = useState(() => {
        const defaults = {baseMapType:'street',showPoliceStations:true,showFireStations:true,
          showRescueStations:true,showEMS:true,showJails:true,
          richmondFacilities:true,henricoFacilities:true,chesterfieldFacilities:true};
        try { return {...defaults,...JSON.parse(localStorage.getItem('bps-map-icon-filters-v1') || '{}')}; }
        catch { return defaults; }
    });
    const changeMapIconFilters = filters => {
        setJurisdictionFilters(filters);
        try { localStorage.setItem('bps-map-icon-filters-v1', JSON.stringify(filters)); } catch {}
    };

    const unitStatusRef = useRef(unitStatus);

    const [focusCenter] = useState(() => {
        const p = new URLSearchParams(window.location.search);
        const lat = parseFloat(p.get('lat'));
        const lng = parseFloat(p.get('lng'));
        return lat && lng ? [lat, lng] : null;
    });
    const [mapCenter, setMapCenter] = useState(focusCenter);
    const [recenterRevision, setRecenterRevision] = useState(0);
    const focusCallId = new URLSearchParams(window.location.search).get('callId');

    useEffect(() => {
        const stopTracking = startLiveLocationTracking({ onError: error => {
            if (!getLiveLocation(30000)) {
                const external = getExternalGpsStatus();
                if (external.connected || external.connecting || external.portGranted) {
                    setIsLiveTracking(false);
                    setGpsQuality({ state: 'external_acquiring', accuracy: null, source: 'external_serial' });
                    startExternalGpsAutoReconnect({ recoverStale: true }).catch(() => null);
                    return;
                }
                setIsLiveTracking(false);
                setGpsQuality({ state: error?.code === 1 ? 'denied' : 'unavailable', accuracy: null });
            }
        }});
        init();
        const unsubscribe = subscribeLiveLocation((fix) => {
            const quality = locationQuality(fix);
            setGpsQuality(quality);
            setGpsFixSource(String(fix?.source || ''));
            const lat = Number(fix?.latitude);
            const lng = Number(fix?.longitude);
            if (!validPosition(fix?.latitude, fix?.longitude)) {
                setIsLiveTracking(false);
                return;
            }
            // Keep coarse Windows/Wi-Fi fixes available as a fallback, but never
            // move the tactical navigation map on a >100m estimate. That produced
            // the large jumps/off-road map behavior. External serial and precise
            // browser/device fixes remain authoritative for the moving marker.
            const tacticalFix = fix?.source === 'external_serial' || quality.state === 'live';
            if (tacticalFix) {
                const coords = [lat, lng];
                setCurrentLocation(coords);
                if (fix.heading !== null) setHeading(fix.heading);
                setSpeed(Math.round(liveSpeedMph(fix.speed)));
                setLocationHistory(prev => [...prev, coords].slice(-30));
            }
            setIsLiveTracking(tacticalFix);
        });
        return () => { unsubscribe(); stopTracking(); };
    }, []);

    // Re-entering Navigation remounts this page. Reclaim the already granted
    // antenna and resume GPS updates without requiring another Connect click.
    useEffect(()=>{
        const resume=()=>{
            if(document.visibilityState==='hidden')return;
            const receiver=getExternalGpsStatus();
            if(receiver.portGranted || receiver.connected || receiver.connecting ||
               receiver.lockedToAntenna){
                void startExternalGpsAutoReconnect({recoverStale:true}).catch(()=>null);
            }
            const latest=getLiveLocation(30000);
            if(latest && validPosition(latest.latitude,latest.longitude)){
                setCurrentLocation([latest.latitude,latest.longitude]);
                setSpeed(Math.round(liveSpeedMph(latest.speed)));
                setGpsQuality(locationQuality(latest));
                setIsLiveTracking(locationQuality(latest).state==='live');
            }
        };
        resume();
        window.addEventListener('bps-operational-resume',resume);
        window.addEventListener('pageshow',resume);
        window.addEventListener('focus',resume);
        return()=>{
            window.removeEventListener('bps-operational-resume',resume);
            window.removeEventListener('pageshow',resume);
            window.removeEventListener('focus',resume);
        };
    },[]);

    // Detect a receiver that goes silent during a long drive. Keep the map at
    // its last known position without claiming it is live, and recover GNSS.
    useEffect(() => {
        const check = () => {
            const latest = getLiveLocation(30_000);
            if (latest) return;
            setIsLiveTracking(false);
            setGpsQuality(previous => previous.state === 'stale' ? previous : { ...previous, state: 'stale' });
            const receiver = getExternalGpsStatus();
            if (receiver.connected || receiver.portGranted) {
                const elapsed = receiver.lastFixAt ? Date.now() - Date.parse(receiver.lastFixAt) : Infinity;
                if (elapsed > 45_000) startExternalGpsAutoReconnect({ recoverStale: true }).catch(() => null);
            }
        };
        const timer = window.setInterval(check, 5_000);
        return () => window.clearInterval(timer);
    }, []);

    // Credit-free live officer refresh. ActiveOfficer is the source written by
    // the time-clock/background GPS tracker while an officer is on duty.
    useEffect(() => {
        if (!currentUser?.id) return;
        fetchOtherUnits();
        let refreshTimer;
        const unsubscribe = subscribeOfficerLocationChanges((event) => {
            const type = String(event?.type || '').toLowerCase();
            const record = event?.data || event?.record || null;
            const currentEmail = String(currentUser?.email || '').toLowerCase();
            const eventEmail = String(record?.officer_email || record?.email || '').toLowerCase();

            // Realtime ActiveOfficer payloads already contain status/GPS updates.
            // Keep the signed-in officer's own call-assignment/status state current
            // too so their marker starts/stops flashing without a page refresh.
            if (eventEmail && eventEmail === currentEmail && record && type !== 'delete') {
                setCurrentUser(previous => previous ? {
                    ...previous,
                    ...(record.status !== undefined ? { status: record.status } : {}),
                    ...(event.directory_profile && record.unit_number !== undefined ? { unit_number: record.unit_number, rank: record.rank || previous.rank } : {}),
                    ...(record.current_call_id !== undefined ? { current_call_id: record.current_call_id } : {}),
                    ...(record.current_call_info !== undefined ? { current_call_info: record.current_call_info } : {}),
                } : previous);
                if (record.status) setUnitStatus(record.status === 'On Patrol' ? 'Available' : record.status);
            }

            // Paint other officers directly instead of spending a getOnDutyUnits
            // request for every GPS movement. Full roster reads are reconciliation only.
            if (eventEmail && eventEmail !== currentEmail) {
                setOtherUnits(current => {
                    if (type === 'delete' || record?.session_active === false) {
                        return current.filter(unit => String(unit.officer_email || unit.email || '').toLowerCase() !== eventEmail);
                    }
                    const exists = current.some(unit => String(unit.officer_email || unit.email || '').toLowerCase() === eventEmail);
                    const patched = applyOfficerLocationEvent(current, event);
                    if (exists) return patched;
                    const hasPosition = validPosition(record?.latitude, record?.longitude)
                        || validPosition(record?.last_known_latitude, record?.last_known_longitude)
                        || validPosition(record?.coarse_latitude, record?.coarse_longitude);
                    if (!hasPosition || record?.session_active !== true) return patched;
                    return [...patched, {
                        ...record,
                        email: record.officer_email || record.email,
                        latitude: record.latitude === null || record.latitude === undefined ? null : Number(record.latitude),
                        longitude: record.longitude === null || record.longitude === undefined ? null : Number(record.longitude),
                        heading: Number(record.heading) || 0,
                        isUnionLead: record.is_union_lead === true || record.isUnionLead === true,
                        unionMembers: Number(record.union_member_count || record.unionMembers) || 1,
                        show_on_map: record.show_on_map !== false,
                    }];
                });
            }

            // Only unusual/incomplete realtime events need a quick roster repair.
            if (!record || type === 'delete') {
                window.clearTimeout(refreshTimer);
                refreshTimer = window.setTimeout(() => {
                    if (document.visibilityState === 'visible') fetchOtherUnits();
                }, 5000);
            }
        });
        const recoverUnits = () => {
            window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(() => fetchOtherUnits(true), 200);
        };
        // Realtime handles movement; use a slow safety poll so several officers
        // publishing GPS at once cannot trigger a full roster read for each event.
        const fallback = setInterval(() => {
            if (document.visibilityState === 'visible') fetchOtherUnits();
        }, 120000);
        window.addEventListener('bps-operational-resume', recoverUnits);
        window.addEventListener('online', recoverUnits);
        window.addEventListener('pageshow', recoverUnits);
        return () => {
            unsubscribe?.();
            clearInterval(fallback);
            window.clearTimeout(refreshTimer);
            window.removeEventListener('bps-operational-resume', recoverUnits);
            window.removeEventListener('online', recoverUnits);
            window.removeEventListener('pageshow', recoverUnits);
        };
    }, [currentUser?.id]);

    useEffect(() => {
        // GRAC ingestion is owned app-wide by DashboardDataProvider. Navigation only
        // reads DispatchCall so opening the map cannot start another backend sync loop.
        fetchCalls();
        let refreshTimer;
        const unsubscribe = subscribeDispatchCallChanges(event => {
            if (!event?.data && event?.type !== 'delete') {
                window.clearTimeout(refreshTimer);
                refreshTimer = window.setTimeout(() => fetchCalls(), 5000);
                return;
            }
            // Keep the map aligned with the canonical CAD dashboard window. Calls
            // older than the one-hour operational window are left to history/archive.
            setActiveCalls(current => applyDispatchCallEvent(current, event, { hideClosed: true, limit: 250 }));
        });
        const recoverCalls = () => {
            window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(() => fetchCalls(), 200);
        };
        // Live DispatchCall events and the ingestion-finished signal repaint
        // immediately. Reconcile only once per minute instead of every 15s;
        // opening CAD plus Dispatch no longer queues duplicate 500-row reads.
        const localInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && navigator.onLine) fetchCalls();
        }, 60000);
        window.addEventListener('bps-cad-ingest-finished', recoverCalls);
        window.addEventListener('bps-operational-resume', recoverCalls);
        window.addEventListener('online', recoverCalls);
        window.addEventListener('pageshow', recoverCalls);
        return () => {
            unsubscribe?.();
            clearInterval(localInterval);
            window.clearTimeout(refreshTimer);
            window.removeEventListener('bps-cad-ingest-finished', recoverCalls);
            window.removeEventListener('bps-operational-resume', recoverCalls);
            window.removeEventListener('online', recoverCalls);
            window.removeEventListener('pageshow', recoverCalls);
        };
    }, []);



    // Do not auto-fit newly arrived officer/call markers on map load. That
    // async camera move could interrupt manual panning even with GPS turned off.
    // The explicit Fit All Units control is available to reframe the map.

    useEffect(() => { unitStatusRef.current = unitStatus; }, [unitStatus]);

    useEffect(() => {
        const syncConnectivity = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', syncConnectivity);
        window.addEventListener('offline', syncConnectivity);
        syncConnectivity();
        return () => {
            window.removeEventListener('online', syncConnectivity);
            window.removeEventListener('offline', syncConnectivity);
        };
    }, []);

    useEffect(() => {
        if (!isNavigating || !currentLocation || navSteps.length === 0 || routing || navOffRoute) return;
        const step = navSteps[navStepIndex];
        const location = step?.maneuver?.location;
        if (!location) return;
        const [lng, lat] = location;
        const toRad = value => value * Math.PI / 180;
        const dLat = toRad(lat - currentLocation[0]);
        const dLng = toRad(lng - currentLocation[1]);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(currentLocation[0])) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
        const miles = 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        setNavTurnDistanceFeet(Math.max(0, Math.round(miles * 5280)));

        // Keep remaining distance/time live instead of leaving the original route
        // totals frozen for the entire trip.
        const currentMeters = miles * 1609.344;
        const laterSteps = navSteps.slice(navStepIndex + 1);
        const futureMeters = laterSteps.reduce((sum, item) => sum + Math.max(0, Number(item?.distance) || 0), 0);
        const currentStepMeters = Math.max(1, Number(step?.distance) || currentMeters || 1);
        const currentStepSeconds = Math.max(0, Number(step?.duration) || 0) * Math.min(1, currentMeters / currentStepMeters);
        const futureSeconds = laterSteps.reduce((sum, item) => sum + Math.max(0, Number(item?.duration) || 0), 0);
        const remainingMiles = Math.max(0, (currentMeters + futureMeters) / 1609.344);
        setNavDistanceMiles(remainingMiles);
        // Some provider steps omit duration. Never present an impossible ETA
        // (for example 12 miles remaining in one minute) when GPS advances.
        const baseline = navRouteSummaryRef.current;
        const proportionalSeconds = baseline.distanceMeters > 0 && baseline.durationSeconds > 0
            ? baseline.durationSeconds * Math.min(1.5, (remainingMiles * 1609.344) / baseline.distanceMeters)
            : 0;
        // Preserve the full traffic-aware route timing when individual steps
        // have no timing information (including older TomTom route responses).
        setNavDurationMinutes(Math.max(1, Math.ceil(Math.max(currentStepSeconds + futureSeconds, proportionalSeconds) / 60), Math.ceil(remainingMiles * 60 / 65)));

        // Maintain forward route progress independently of exact maneuver-radius
        // hits. A GPS update can skip across the ~95 ft turn bubble at highway
        // speed; without route-progress advancement Pathfinder can keep speaking
        // a maneuver the officer already passed.
        if (navRoute.length > 1) {
            const projection = projectOntoRoute(currentLocation, navRoute, Math.max(0, navSnapIndexRef.current - 4), Math.min(navRoute.length - 1, navSnapIndexRef.current + 400));
            if (projection.distance <= 80) navSnapIndexRef.current = Math.max(navSnapIndexRef.current, projection.index);
        }
        const currentStepRouteIndex = navStepRouteIndexesRef.current[navStepIndex];
        const passedCurrentManeuver = Number.isFinite(Number(currentStepRouteIndex))
            && navSnapIndexRef.current >= Number(currentStepRouteIndex) + 2;
        // Do not advance so early that the final "turn now" prompt is skipped,
        // but do advance once forward route progress proves this maneuver was passed.
        if ((miles < 0.018 || passedCurrentManeuver) && navStepIndex < navSteps.length - 1) {
            setNavStepIndex(index => index + 1);
        }
        if (navDestination?.coords) {
            const [destLat, destLng] = navDestination.coords;
            const ddLat = toRad(destLat - currentLocation[0]);
            const ddLng = toRad(destLng - currentLocation[1]);
            const da = Math.sin(ddLat / 2) ** 2 + Math.cos(toRad(currentLocation[0])) * Math.cos(toRad(destLat)) * Math.sin(ddLng / 2) ** 2;
            const remaining = 3958.8 * 2 * Math.atan2(Math.sqrt(da), Math.sqrt(1 - da));
            if (remaining < 0.03) {
                toast.success('Arrived at call location');
                stopInAppNavigation();
            }
        }
    }, [currentLocation, isNavigating, navStepIndex, navSteps, navDestination, navRoute, routing, navOffRoute]);

    // Modern staged turn prompts: one early cue, one near-turn cue, and a
    // turn-now cue. Each stage is spoken only once per maneuver.
    useEffect(() => {
        if (!isNavigating || routePreviewOnly || navVoiceMuted || !navSteps.length || navStepIndex < 0 || routing || navOffRoute) return;
        const step = navSteps[navStepIndex];
        if (!step) return;
        const feet = Number(navTurnDistanceFeet);
        if (!Number.isFinite(feet) || feet < 0) return;

        let stage = 'far';
        if (feet <= 110) stage = 'now';
        else if (feet <= 450) stage = 'near';
        else if (feet <= 1400) stage = 'approach';

        const key = `${navStepIndex}:${stage}`;
        if (spokenNavPromptsRef.current.has(key)) return;
        spokenNavPromptsRef.current.add(key);
        lastSpokenNavStepRef.current = navStepIndex;
        announceNavigationInstruction(formatInstruction(step), stage === 'now' ? 0 : feet);
    }, [isNavigating, routePreviewOnly, navVoiceMuted, navStepIndex, navSteps, navTurnDistanceFeet, routing, navOffRoute]);

    const syncScheduledCadPartnership = async (user) => {
        if (!user?.email || !user?.id) return user;
        try {
            const now = new Date();
            const today = now.toISOString().slice(0, 10);
            const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
            const rows = await base44.entities.Schedule.list('-shift_date', 500);
            const candidates = (rows || []).filter(s =>
                String(s.officer_email || '').toLowerCase() === String(user.email).toLowerCase() &&
                (s.shift_date === today || s.shift_date === yesterday) &&
                s.partner_officer_email
            );
            const shift = candidates.find(s => s.shift_date === today) || candidates[0];
            if (!shift?.partner_officer_email) return user;

            let partner = null;
            try {
                const partnerRows = await base44.entities.User.filter({ email: shift.partner_officer_email });
                partner = partnerRows?.[0] || null;
            } catch (partnerLookupError) {
                // Do not let a failed partner lookup silently look like "no partner" --
                // fall back to the scheduled partner's email so the assignment still
                // shows, but make the degraded lookup visible in the console.
                console.error('[NAV] partner lookup failed, falling back to scheduled partner email:', partnerLookupError);
            }
            const pairKey = [String(user.email).toLowerCase(), String(shift.partner_officer_email).toLowerCase()].sort().join('|');
            const unionId = `TEAM-${shift.shift_date}-${pairKey}`;
            const isLead = String(user.email).toLowerCase() === pairKey.split('|')[0];
            const partnerName = partner
                ? `${partner.rank || 'Officer'} ${partner.last_name || partner.first_name || ''}`.trim()
                : shift.partner_officer_email;
            const partnership = {
                union_id: unionId,
                partner_email: shift.partner_officer_email,
                partner_name: partnerName,
                partner_user_id: partner?.id || '',
                is_union_lead: isLead,
                isUnionLead: isLead,
                union_member_count: 2,
                unionMembers: 2,
                scheduled_shift_id: shift.id,
            };

            // Do not swallow this failure into an empty array: a failed fetch would
            // then look identical to "no existing unit" and create a duplicate Unit
            // row on every sync retry. Let a real failure fall through to the outer
            // catch instead, which aborts the sync without touching CAD unit data.
            const ownUnits = await base44.entities.Unit.filter({ user_id: user.id });
            const unitPayload = {
                unit_id: user.unit_number || user.id,
                label: `${user.rank || 'Officer'} ${user.last_name || user.first_name || ''}`.trim(),
                // Never promote a missing/stale duty status to Available.
                status: user.status || 'Out of Service',
                user_id: user.id,
                union_id: unionId,
                partner_user_id: partner?.id || '',
                partner_email: shift.partner_officer_email,
                partner_name: partnerName,
                is_union_lead: isLead,
                union_member_count: 2,
                scheduled_shift_id: shift.id,
                last_update_at: new Date().toISOString(),
            };
            if (ownUnits?.length) {
                const sortedOwnUnits = [...ownUnits].sort((a, b) =>
                    new Date(b.created_date || b.updated_date || 0).getTime() - new Date(a.created_date || a.updated_date || 0).getTime()
                );
                const primaryUnit = sortedOwnUnits[0];
                await Promise.all([
                    base44.entities.Unit.update(primaryUnit.id, unitPayload),
                    ...sortedOwnUnits.slice(1)
                        .filter(unit => unit.status !== 'Out of Service')
                        .map(unit => base44.entities.Unit.update(unit.id, {
                            status: 'Out of Service',
                            description: 'Duplicate unit record retired automatically.',
                            last_update_at: new Date().toISOString(),
                        }).catch(() => null)),
                ]);
            } else {
                await base44.entities.Unit.create(unitPayload);
            }

            return { ...user, ...partnership };
        } catch (e) {
            console.error('[NAV] scheduled CAD partnership sync failed:', e);
            toast.error('Could not sync your CAD partner/unit assignment. It will retry automatically.');
            return user;
        }
    };

    const init = async () => {
        try {
            const [directoryUser, homeResponse] = await Promise.all([
                getCurrentDirectoryUser(),
                base44.functions.invoke('updateMyHomeAddress', { action: 'get' }).catch(() => null),
            ]);
            const homeProfile = homeResponse?.data || homeResponse || {};
            const user = profileHomeAddress(homeProfile)
                ? { ...directoryUser, address: homeProfile.address || '', city: homeProfile.city || '', state: homeProfile.state || '', zip: homeProfile.zip || '' }
                : directoryUser;
            setCurrentUser(user);
            syncScheduledCadPartnership(user).then(setCurrentUser).catch(() => null);
            if (user.status) setUnitStatus(user.status === 'On Patrol' ? 'Available' : user.status);
        } catch {}
        const fix = getLiveLocation(30000);
        if (fix) {
            const quality = locationQuality(fix);
            setGpsQuality(quality);
            const lat = Number(fix.latitude);
            const lng = Number(fix.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                setCurrentLocation([lat, lng]);
                if (fix.heading !== null) setHeading(fix.heading);
                setSpeed(Math.round(liveSpeedMph(fix.speed)));
            }
            setIsLiveTracking(quality.state === 'live' || quality.state === 'low_accuracy');
        }
        requestBestLiveLocation({ timeoutMs: 15000, targetAccuracyMeters: 50 }).catch(() => null);
    };

    const handleSelfAssign = async () => {
        if (!currentUser || !selectedCall) return;
        setAssigning(true);
        try {
            const alreadyAssigned = selectedCall.assigned_units?.includes(currentUser.id);
            if (!alreadyAssigned) {
                const previousUnits = selectedCall.assigned_units || [];
                const updatedUnits = [...previousUnits, currentUser.id];
                // Reflect assignment immediately; roll it back if the server rejects it.
                setSelectedCall(prev => ({ ...prev, assigned_units: updatedUnits }));
                try {
                    const result = await base44.functions.invoke('updateMyCallAssignment', { call_id: selectedCall.id, action: 'join' });
                    const payload = result?.data || result || {};
                    if (payload.error) throw new Error(payload.error);
                    setCurrentUser(previous => previous ? {
                        ...previous,
                        current_call_id: payload.current_call_id || String(selectedCall.id),
                        current_call_info: payload.current_call_info || previous.current_call_info || '',
                    } : previous);
                } catch (error) {
                    setSelectedCall(prev => ({ ...prev, assigned_units: previousUnits }));
                    throw error;
                }
                setAssigning(false);
                toast.success('Assigned to call — updating status to Enroute');
                handleStatusChange('Enroute');
            }
        } catch (error) {
            toast.error(error?.message || 'Failed to assign');
        } finally {
            setAssigning(false);
        }
    };

    const handleSelfUnassign = async () => {
        if (!currentUser || !selectedCall) return;
        setAssigning(true);
        try {
            const result = await base44.functions.invoke('updateMyCallAssignment', { call_id: selectedCall.id, action: 'leave' });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);
            if (String(currentUser.current_call_id || '') === String(selectedCall.id)) {
                setCurrentUser(previous => previous ? { ...previous, current_call_id: '', current_call_info: '' } : previous);
            }
            const updatedUnits = (selectedCall.assigned_units || []).filter(id => id !== currentUser.id);
            setSelectedCall(prev => ({ ...prev, assigned_units: updatedUnits }));
            toast.success('Unassigned from call');
        } catch {
            toast.error('Failed to unassign');
        } finally {
            setAssigning(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        const previousStatus = unitStatusRef.current;
        setStatusSaving(true);
        setUnitStatus(newStatus);
        unitStatusRef.current = newStatus;
        try {
            const stamp = new Date().toISOString();
            const payload = await persistOfficerStatus(newStatus, { force: true });
            if (payload.error) throw new Error(payload.error);
            setCurrentUser(prev => prev ? {
                ...prev,
                status: newStatus,
                last_updated: stamp,
                status_since: stamp,
                ...(['Available', 'Out of Service'].includes(newStatus) ? { current_call_id: '', current_call_info: '' } : {}),
            } : prev);
            // officerStatusService already broadcasts the canonical status event
            // with officer id/email. Do not emit a duplicate event/read burst here.
            fetchOtherUnits();
        } catch (e) {
            console.warn('[NAV] direct status update failed:', e?.message);
            setUnitStatus(previousStatus);
            unitStatusRef.current = previousStatus;
            toast.error('Unable to update status');
        } finally {
            setStatusSaving(false);
        }
    };

    const formatInstruction = (step) => {
        if (!step) return 'Continue to destination';
        const type = String(step.maneuver?.type || 'continue').toLowerCase();
        const modifier = String(step.maneuver?.modifier || '').toLowerCase();
        const name = String(step.name || step.ref || '').trim();
        const destinations = String(step.destinations || '').trim();
        const onto = name ? ` onto ${name}` : '';
        const onRoad = name ? ` on ${name}` : '';
        const toward = destinations ? ` toward ${destinations.split(';')[0].trim()}` : '';
        const side = modifier.includes('left') ? 'left' : modifier.includes('right') ? 'right' : 'ahead';

        if (type === 'arrive') {
            if (modifier.includes('left')) return 'Your destination is on the left';
            if (modifier.includes('right')) return 'Your destination is on the right';
            return 'You have arrived at your destination';
        }
        if (type === 'depart') {
            if (modifier.includes('left')) return `Head left${onRoad}`;
            if (modifier.includes('right')) return `Head right${onRoad}`;
            return `Head straight${onRoad}`;
        }
        if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
            const exit = Number(step.maneuver?.exit);
            return `Enter the roundabout${Number.isFinite(exit) && exit > 0 ? ` and take exit ${exit}` : ''}${onto}`;
        }
        if (type === 'exit roundabout' || type === 'exit rotary') return `Exit the roundabout${onto}`;
        if (modifier.includes('uturn') || modifier.includes('u-turn')) return `Make a U-turn${onto}`;
        if (type === 'merge') return `Merge ${side}${onto}${toward}`;
        if (type === 'fork') return `Keep ${side}${onto}${toward}`;
        if (type === 'on ramp') return `Take the ramp ${side}${onto}${toward}`;
        if (type === 'off ramp') return `Take the exit ${side}${onto}${toward}`;
        if (type === 'end of road') return `Turn ${side === 'ahead' ? 'right' : side}${onto}`;
        if (type === 'continue') {
            if (modifier.includes('slight left')) return `Keep slightly left${onRoad}`;
            if (modifier.includes('slight right')) return `Keep slightly right${onRoad}`;
            if (modifier.includes('left')) return `Keep left${onRoad}`;
            if (modifier.includes('right')) return `Keep right${onRoad}`;
            return `Continue${onRoad}`;
        }
        if (type === 'new name' || type === 'notification') return `Continue${onRoad || onto}`;
        if (type === 'turn') {
            if (modifier.includes('slight left')) return `Bear left${onto}`;
            if (modifier.includes('slight right')) return `Bear right${onto}`;
            if (modifier.includes('sharp left')) return `Make a sharp left${onto}`;
            if (modifier.includes('sharp right')) return `Make a sharp right${onto}`;
            if (modifier.includes('left')) return `Turn left${onto}`;
            if (modifier.includes('right')) return `Turn right${onto}`;
        }
        // Unknown highway maneuvers with a directional modifier are safer as
        // lane/continuation guidance than as an invented intersection turn.
        if (modifier.includes('left')) return `Keep left${onRoad}`;
        if (modifier.includes('right')) return `Keep right${onRoad}`;
        return `Continue${onRoad}`;
    };

    const maneuverIconForStep = (step, className = 'h-8 w-8') => {
        const type = String(step?.maneuver?.type || 'continue').toLowerCase();
        const modifier = String(step?.maneuver?.modifier || '').toLowerCase();
        if (modifier.includes('uturn') || modifier.includes('u-turn')) return <RotateCcw className={className} />;
        if (modifier.includes('left')) return <CornerUpLeft className={className} />;
        if (modifier.includes('right')) return <CornerUpRight className={className} />;
        if (type === 'arrive') return <MapPin className={className} />;
        return <ArrowUp className={className} />;
    };

    const recoverExternalReceiver = async () => {
        if (gpsRecovering) return;
        setGpsRecovering(true);
        try {
            // Explicitly reopen the device chooser on a user click. Merely
            // selecting External GPS previously could keep a silent COM port open.
            const result = await requestExternalGpsConnection({ baudRate: externalReceiver.baudRate || 4800 });
            if (!result.connected) throw new Error(result.error || 'Receiver port did not open.');
            toast.success('Antenna port opened. Waiting for satellite data; verify the status below.');
        } catch (error) {
            toast.error(error?.message || 'Could not reconnect the external GPS antenna.');
        } finally { setGpsRecovering(false); }
    };

    const getFreshDeviceLocation = async ({ quick = false } = {}) => {
        // One bounded GPS acquisition only. The former 15s wait followed by
        // another 15s high-accuracy attempt made Navigate Here feel frozen.
        const receiver = getExternalGpsStatus();
        const recent = getLiveLocation(15_000);
        if (recent && locationQuality(recent).state === 'live') {
            setCurrentLocation([recent.latitude, recent.longitude]);
            setIsLiveTracking(true);
            setGpsQuality(locationQuality(recent));
            setGpsFixSource(String(recent.source || ''));
            return [recent.latitude, recent.longitude];
        }
        if (receiver.portGranted || receiver.connected || receiver.connecting) {
            // Receiver reconnection runs independently; never block routing on
            // USB hardware recovery or incorrectly treat a stale fix as live.
            void startExternalGpsAutoReconnect({ recoverStale: true }).catch(() => null);
        }
        const budgetMs = quick ? 2400 : 6500;
        try {
            const fix = await waitForLiveLocation({ maxAgeMs: 12000, timeoutMs: budgetMs, maxAccuracyMeters: 100 });
            const quality = locationQuality(fix);
            setGpsQuality(quality);
            setCurrentLocation([fix.latitude, fix.longitude]);
            setGpsFixSource(String(fix.source || ''));
            if (fix.heading != null) setHeading(fix.heading);
            setSpeed(Math.round(liveSpeedMph(fix.speed)));
            setIsLiveTracking(quality.state === 'live');
            return quality.state === 'live' ? [fix.latitude, fix.longitude] : null;
        } catch (error) {
            const fallback = getLiveLocation(15000);
            const quality = locationQuality(fallback);
            setGpsQuality(quality);
            setIsLiveTracking(quality.state === 'live');
            return fallback && quality.state === 'live' ? [fallback.latitude, fallback.longitude] : null;
        }
    };

    const startNavigationToPoint = async (destination, options = {}) => {
        if (destination?.type === 'managed_property' && !destination.coords) {
            setNavigationFallbackAddress(destination.address || destination.name);
            try {
                const matches = await lookupNavigationDestinations(destination.address, currentLocation, { skipManaged: true });
                if (!matches[0]?.coords) throw new Error('The saved property address could not be mapped. Use Open driving directions in Google Maps.');
                destination = { ...destination, coords: matches[0].coords };
            } catch (error) {
                setAddressSearchError(error.message);
                setShowAddressSearch(true);
                return;
            }
        }
        const coords = destination?.coords || (destination?.latitude && destination?.longitude ? [Number(destination.latitude), Number(destination.longitude)] : null);
        if (!coords || !Number.isFinite(Number(coords[0])) || !Number.isFinite(Number(coords[1]))) {
            toast.error('This destination does not have mapped coordinates');
            return;
        }
        setRouting(true);
        setAddressSearchError('');
        setNavigationFallbackAddress(destination.address || coords.join(','));
        try {
            const originOverride = Array.isArray(options.originOverride) && validPosition(options.originOverride[0], options.originOverride[1])
                ? [Number(options.originOverride[0]), Number(options.originOverride[1])]
                : null;
            const rawRecentFix = getLiveLocation(options.reroute ? 12_000 : 15_000);
            const recentFix = locationQuality(rawRecentFix).state === 'live' ? rawRecentFix : null;
            let freshLocation = originOverride
                || (options.reroute && isLiveTracking && currentLocation && validPosition(currentLocation[0], currentLocation[1]) ? currentLocation : null)
                || (recentFix && validPosition(recentFix.latitude, recentFix.longitude) ? [recentFix.latitude, recentFix.longitude] : null)
                || (recentFix && currentLocation && validPosition(currentLocation[0], currentLocation[1]) ? currentLocation : null)
                || (manualOriginQuery.trim().length >= 3 ? null : await getFreshDeviceLocation({ quick: true }));
            let previewOnly = false;
            if (!freshLocation && manualOriginQuery.trim().length >= 3) {
                const origins = await withRequestTimeout(lookupNavigationDestinations(manualOriginQuery.trim(), null), 12000, 'Starting address lookup');
                const origin = origins.find(item => validPosition(item?.coords?.[0], item?.coords?.[1]));
                if (origin) { freshLocation = origin.coords.map(Number); previewOnly = true; }
                else throw new Error('Starting address was not found. Enter a complete street address or enable precise GPS.');
            }
            if (!freshLocation) throw new Error(getExternalGpsStatus().connected ? 'External antenna is connected but has not provided a recent accurate satellite fix. Check receiver signal, antenna placement and serial data; or enter a starting address for route preview.' : 'No usable GPS fix received. Check external antenna connection or enter a starting address to preview a route.');
            setRoutePreviewOnly(previewOnly);
            const [lat, lng] = freshLocation;
            const [destLat, destLng] = coords.map(Number);
            const originHeading = options.originHeading != null && Number.isFinite(Number(options.originHeading))
                ? Number(options.originHeading)
                : recentFix?.heading != null && Number.isFinite(Number(recentFix.heading)) ? Number(recentFix.heading)
                    : heading != null && Number.isFinite(Number(heading)) ? Number(heading) : null;
            const originAccuracy = Number.isFinite(Number(recentFix?.accuracy))
                ? Number(recentFix.accuracy)
                : Number.isFinite(Number(gpsQuality?.accuracy)) ? Number(gpsQuality.accuracy) : null;
            const originSpeed = liveSpeedMph(recentFix?.speed ?? speed);
            const browserQuery = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' });
            if (originSpeed >= 5 && Number.isFinite(originHeading)) browserQuery.set('bearings', `${Math.round(((originHeading % 360) + 360) % 360)},55;`);
            if (Number.isFinite(originAccuracy) && originAccuracy > 0) browserQuery.set('radiuses', `${Math.round(Math.max(25, Math.min(100, originAccuracy * 2)))};unlimited`);
            const routePath = `${lng},${lat};${destLng},${destLat}?${browserQuery.toString()}`;
            const plainRoutePath = `${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
            let route = null;
            let routeProvider = '';
            // Fastest valid route wins: server TomTom and browser OSRM race.
            // Slow TomTom credentials/providers must not hold an officer's
            // navigation for 12s plus serial 7s fallback requests.
            const serverRoute = async () => {
                const routed = await withRequestTimeout(base44.functions.invoke('routeNavigation', {
                    origin_lat: lat, origin_lng: lng, dest_lat: destLat, dest_lng: destLng,
                    origin_heading: originHeading, origin_accuracy: originAccuracy,
                    origin_speed_mph: originSpeed,
                }), 8500, 'Navigation route');
                const payload = routed?.data || routed || {};
                if (!payload.route?.geometry?.coordinates?.length || payload.route.geometry.coordinates.length < 2) throw new Error('Server route unavailable');
                return { route: payload.route, provider: payload.provider === 'TomTom' ? 'TomTom' : 'Fallback routing' };
            };
            const browserRoute = async () => {
                const urls = [
                    `https://router.project-osrm.org/route/v1/driving/${plainRoutePath}`,
                    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${plainRoutePath}`,
                ];
                const attempts = urls.map(async url => {
                    const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
                    if (!response.ok) throw new Error(`Routing provider ${response.status}`);
                    const data = await response.json();
                    if (!data.routes?.[0]?.geometry?.coordinates?.length || data.routes[0].geometry.coordinates.length < 2) throw new Error('No drivable route returned');
                    return { route: data.routes[0], provider: 'Fallback routing' };
                });
                return Promise.any(attempts);
            };
            try {
                const winner = await Promise.any([serverRoute(), browserRoute()]);
                route = winner.route;
                routeProvider = winner.provider;
            } catch (routingError) {
                console.warn('[NAV] Routing providers unavailable:', routingError?.message || routingError);
            }
            if (!route) throw new Error('In-app routing is unavailable. Open driving directions in Google Maps below.');
            setNavRouteProvider(String(route.provider || '').includes('TomTom') ? 'TomTom' : 'Fallback');
            setNavOffRoute(false);
            setNavDestination({ coords: [destLat, destLng], name: destination.name || destination.address || 'Destination' });
            const routeCoords = (route.geometry?.coordinates || []).map(([x, y]) => [y, x]);
            const routeSteps = route.legs?.flatMap(leg => leg.steps || []) || [];
            setNavRoute(routeCoords);
            setNavRouteProvider(routeProvider || 'Fallback routing');
            setNavSpeedLimitSections(Array.isArray(route.speedLimitSections) ? route.speedLimitSections : []);
            setNavTrafficSegments(Array.isArray(route.trafficSegments) ? route.trafficSegments : []);
            navSnapIndexRef.current = 0;
            offRouteSinceRef.current = 0;
            offRouteConfirmationsRef.current = 0;
            // Map each OSRM maneuver to its forward route index. This gives the
            // step engine a route-progress reference so a missed/closely-parallel
            // maneuver cannot stay active indefinitely.
            let searchStart = 0;
            navStepRouteIndexesRef.current = routeSteps.map(step => {
                const location = step?.maneuver?.location;
                if (!Array.isArray(location) || location.length < 2 || !routeCoords.length) return searchStart;
                const point = [Number(location[1]), Number(location[0])];
                let nearestIndex = searchStart;
                let nearestDistance = Infinity;
                for (let index = searchStart; index < routeCoords.length; index += 1) {
                    const distance = distanceMetersBetween(point, routeCoords[index]);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestIndex = index;
                    }
                    if (nearestDistance < 4 && index > nearestIndex + 15) break;
                }
                searchStart = Math.max(searchStart, nearestIndex);
                return nearestIndex;
            });
            setNavSteps(routeSteps);
            setNavStepIndex(0);
            lastSpokenNavStepRef.current = -1;
            spokenNavPromptsRef.current.clear();
            setNavTurnDistanceFeet(Math.max(0, Math.round((Number(routeSteps[0]?.distance) || 0) * 3.28084)));
            navRouteSummaryRef.current = { distanceMeters: Math.max(0, Number(route.distance) || 0), durationSeconds: Math.max(0, Number(route.duration) || 0) };
            setNavDistanceMiles(route.distance / 1609.344);
            setNavDurationMinutes(Math.max(1, Math.ceil(route.duration / 60), Math.ceil((route.distance / 1609.344) * 60 / 65)));
            setFollowMyLocation(true);
            setIsNavigating(true);
            // Save only the current user's active destination, not the full
            // route, which must be recalculated from a fresh GPS fix on resume.
            try{sessionStorage.setItem('bps:active-navigation',JSON.stringify({
              userId:currentUser?.id||'',coords:[destLat,destLng],
              name:destination.name||destination.address||'Destination',
              address:destination.address||'',savedAt:Date.now()
            }));}catch{}
            setRecentDestinations(rememberDestination(currentUser?.id, { ...destination, coords: [destLat, destLng] }));
            setShowCallSidebar(false);
            setShowAddressSearch(false);
            setAddressResults([]);
            setAddressQuery('');
            setNavigationFallbackAddress('');
            setAddressSearchError('');
            setMapPickMode(false);
            setMapSelectedDestination(null);
            setFitBounds(null);
            setMapCenter(null);
            // A route preview without live position must never change CAD duty status.
            if (!previewOnly && shouldSetDispatchEnroute(options, currentUser)) void handleStatusChange('Enroute');
            if (previewOnly) toast.success('Route preview ready. Enable precise GPS for live turn-by-turn tracking.');
            else if (options.resuming) toast.success('GPS navigation resumed from your current position');
            else if (options.reroute) toast.success('Route updated from your current position');
            else toast.success(`Navigation started to ${destination.name || destination.address || 'destination'}`);
        } catch (error) {
            const message = error?.message || 'Unable to build route';
            if (!options.reroute) {
                setAddressSearchError(message + ' The destination is retained below so you can open driving directions.');
                setShowAddressSearch(true);
            } else {
                setNavOffRoute(true);
            }
            toast.error(options.reroute ? `Rerouting unavailable: ${message}` : message, { duration: 9000 });
        } finally {
            setRouting(false);
        }
    };

    const restoredNavigationRef=useRef(false);
    useEffect(()=>{
        if(!currentUser?.id || restoredNavigationRef.current)return undefined;
        let saved=null;
        try{saved=JSON.parse(sessionStorage.getItem('bps:active-navigation')||'null');}catch{}
        if(!saved || saved.userId!==currentUser.id ||
          !Array.isArray(saved.coords)||!validPosition(saved.coords[0],saved.coords[1])||
          Date.now()-Number(saved.savedAt)>6*3600000){
            if(saved)try{sessionStorage.removeItem('bps:active-navigation');}catch{}
            restoredNavigationRef.current=true;
            return undefined;
        }
        restoredNavigationRef.current=true;
        let cancelled=false;
        let attempts=0;
        let retryTimer;
        const attemptRestore=async()=>{
            if(cancelled || !navigator.onLine)return;
            const fix=getLiveLocation(30000);
            if(!fix || locationQuality(fix).state!=='live'){
                if(++attempts<=8)retryTimer=window.setTimeout(attemptRestore,3000);
                return;
            }
            const pos=[Number(fix.latitude),Number(fix.longitude)];
            setCurrentLocation(pos);
            setIsLiveTracking(true);
            // Do not change officer duty status when resuming an existing trip.
            await startNavigationToPoint({coords:saved.coords,name:saved.name,address:saved.address},
              {reroute:true,setEnroute:false,originOverride:pos,resuming:true});
        };
        retryTimer=window.setTimeout(attemptRestore,1200);
        return()=>{cancelled=true;window.clearTimeout(retryTimer);};
    },[currentUser?.id]);

    useEffect(() => {
        if (!isNavigating || routePreviewOnly || !isLiveTracking || !getLiveLocation(25_000) || !currentLocation || navRoute.length < 2 || !navDestination || routing) return;

        // Compare only against the forward route. Looking at the entire polyline
        // lets a nearby road/interchange segment already driven falsely keep the
        // officer "on route" after taking a different road.
        const projection = projectOntoRoute(currentLocation, navRoute, Math.max(0, navSnapIndexRef.current - 4), Math.min(navRoute.length - 1, navSnapIndexRef.current + 400));
        const nearestMeters = projection.distance;
        const nearestIndex = projection.index;

        const accuracy = Number(gpsQuality?.accuracy);
        const offRouteThresholdMeters = Math.max(40, Math.min(100, Number.isFinite(accuracy) && accuracy > 0 ? accuracy * 2 : 45));
        if (nearestMeters <= Math.max(80, offRouteThresholdMeters * 2)) {
            navSnapIndexRef.current = Math.max(navSnapIndexRef.current, nearestIndex);
        }

        const routeBearing = projection.bearing;
        const headingMismatch = Number(speed || 0) >= 10
            && heading != null && Number.isFinite(Number(heading))
            && routeBearing != null && Number.isFinite(Number(routeBearing))
            && angleDifference(Number(heading), Number(routeBearing)) >= 70
            && nearestMeters > 15;
        const offRoute = nearestMeters > offRouteThresholdMeters || headingMismatch;
        const now = Date.now();
        if (offRoute) {
            if (!offRouteSinceRef.current) offRouteSinceRef.current = now;
            offRouteConfirmationsRef.current += 1;
        } else {
            offRouteSinceRef.current = 0;
            offRouteConfirmationsRef.current = 0;
        }
        setNavOffRoute(offRoute);

        const confirmedDeviation = offRoute
            && offRouteConfirmationsRef.current >= 2
            && now - offRouteSinceRef.current >= 2500;
        if (confirmedDeviation && now - lastRerouteAtRef.current > 15000) {
            lastRerouteAtRef.current = now;
            offRouteSinceRef.current = 0;
            offRouteConfirmationsRef.current = 0;
            // Recalculate without discarding the existing route until a
            // replacement is returned. Avoid unrelated CAD audio interruptions.
            spokenNavPromptsRef.current.clear();
            startNavigationToPoint(navDestination, {
                setEnroute: false,
                reroute: true,
                originOverride: [...currentLocation],
                originHeading: heading,
            }).catch(() => null);
        }
    }, [currentLocation, isNavigating, isLiveTracking, navRoute, navDestination, routing, gpsQuality?.accuracy, heading, speed]);

    // Retry a transient speed-limit failure even if GPS coordinates remain
    // stationary. Previously the effect only reran on location movement, so a
    // timeout left the posted-limit panel at N/A indefinitely.
    useEffect(() => {
        const retry = () => {
            if (document.visibilityState === 'visible' && navigator.onLine)
                setSpeedLimitRetryRevision(previous => previous + 1);
        };
        const timer = window.setInterval(retry, 35_000);
        window.addEventListener('online', retry);
        return () => { window.clearInterval(timer); window.removeEventListener('online', retry); };
    }, []);

    useEffect(() => {
        const accurate = isLiveTracking && gpsQuality?.state === 'live' && Number(gpsQuality?.accuracy) <= 100;
        if (!accurate || !currentLocation || !validPosition(currentLocation[0], currentLocation[1])) {
            speedLimitRequestSeqRef.current += 1;
            setRoadSpeedLimit(null);
            setRoadSpeedLimitAt(0);
            setRoadSpeedLimitSource('');
            setRoadSpeedLimitRoad('');
            setRoadSpeedLimitStatus(isLiveTracking ? 'GPS accuracy insufficient' : 'GPS signal unavailable');
            return;
        }
        const now = Date.now();
        const roadName = String(isNavigating ? navSteps[navStepIndex]?.name || '' : '').trim();
        const previous = lastSpeedLimitLookupRef.current;
        const distance = previous.lat == null ? Infinity : distanceMetersBetween([previous.lat, previous.lng], currentLocation);
        const roadChanged = Boolean(roadName && roadName !== previous.road);
        // Road-speed data is not telemetry: avoid polling the public map service
        // for every GPS point, but refresh when the vehicle changes road.
        if (!roadChanged && now - previous.at < 25000 && distance < 90) return;
        const requestSeq = ++speedLimitRequestSeqRef.current;
        lastSpeedLimitLookupRef.current = { at: now, lat: currentLocation[0], lng: currentLocation[1], road: roadName };
        // Display a verified TomTom legal road section immediately while the
        // posted-limit provider responds. Never invent a limit from road class.
        let routeLimit = null;
        if (isNavigating && !navOffRoute && navRoute.length > 1 && navSpeedLimitSections.length) {
            const matched = projectOntoRoute(currentLocation, navRoute,
                Math.max(0, navSnapIndexRef.current - 5),
                Math.min(navRoute.length - 1, navSnapIndexRef.current + 80));
            if (matched && matched.distance <= 25) {
                const section = navSpeedLimitSections.find(row => matched.index >= row.start && matched.index < row.end);
                if (section && Number.isFinite(Number(section.mph)) && section.mph >= 10 && section.mph <= 90) routeLimit = section.mph;
            }
        }
        if (roadChanged || distance > 90) {
            setRoadSpeedLimit(routeLimit);
            setRoadSpeedLimitAt(routeLimit!=null?Date.now():0);
            setRoadSpeedLimitRoad('');
            setRoadSpeedLimitSource(routeLimit != null ? 'TomTom legal route speed limit' : '');
        }
        if (routeLimit == null && (roadChanged || distance > 90 || previous.at === 0)) setRoadSpeedLimitStatus('Checking road data');
        withRequestTimeout(base44.functions.invoke('getRoadSpeedLimit', {
            latitude: currentLocation[0], longitude: currentLocation[1], road_name: roadName,
            // Below 12 mph, GPS heading often reflects sensor drift rather than
            // the carriageway; avoid filtering out a correctly mapped road.
            heading: Number(speed) >= 12 ? heading : null,
            speed_mph: Number(speed) || 0,
            previous_latitude: Number.isFinite(previous.lat) ? previous.lat : null,
            previous_longitude: Number.isFinite(previous.lng) ? previous.lng : null,
            accuracy: gpsQuality?.accuracy ?? null,
        }), 10000, 'Road speed limit').then(response => {
            if (requestSeq !== speedLimitRequestSeqRef.current) return;
            const payload = response?.data || response || {};
            const limit = Number(payload.speed_limit_mph);
            const verified = Number.isFinite(limit) && limit >= 10 && limit <= 90;
            // When point matching has no posted limit, reuse TomTom's *legal*
            // speed-limit sections for the confirmed current route. Never use
            // the planned route if the officer is off-route or >25m from it.
            let routeLimit = null;
            if (!verified && isNavigating && !navOffRoute && navRoute.length > 1 && navSpeedLimitSections.length) {
                const matched = projectOntoRoute(currentLocation, navRoute,
                    Math.max(0, navSnapIndexRef.current - 5),
                    Math.min(navRoute.length - 1, navSnapIndexRef.current + 80));
                if (matched && matched.distance <= 25) {
                    const section = navSpeedLimitSections.find(row => matched.index >= row.start && matched.index < row.end);
                    if (section) routeLimit = section.mph;
                }
            }
            const hasLimit = verified || routeLimit != null;
            setRoadSpeedLimit(hasLimit ? (verified ? Math.round(limit) : routeLimit) : null);
            setRoadSpeedLimitAt(hasLimit?Date.now():0);
            setRoadSpeedLimitSource(verified ? String(payload.source || '') : routeLimit != null ? 'TomTom legal route speed limit' : '');
            setRoadSpeedLimitRoad(hasLimit ? String(payload.road_name || '') : '');
            setRoadSpeedLimitEstimated(payload.estimated === true);
            setRoadSpeedLimitStatus(hasLimit ? 'Mapped posted limit' : payload.reason === 'gps_accuracy_too_low' ? 'GPS too imprecise for road match' : payload.reason === 'map_provider_rate_limited' ? 'Speed data provider busy' : payload.reason === 'posted_limit_unavailable' ? 'Speed data temporarily unavailable' : 'No mapped limit for this road');
        }).catch(() => {
            if (requestSeq !== speedLimitRequestSeqRef.current) return;
            setRoadSpeedLimitStatus('Posted speed limit unavailable');
        });
    }, [currentLocation, isNavigating, isLiveTracking, gpsQuality?.state, gpsQuality?.accuracy, heading, navStepIndex, navSteps, navRoute, navOffRoute, navSpeedLimitSections, speedLimitRetryRevision]);

    useEffect(() => {
        if (!currentLocation || !validPosition(currentLocation[0], currentLocation[1])) return;
        if (!isNavigating || navRoute.length < 2) {
            navSnapIndexRef.current = 0;
            setNavigationDisplayLocation(currentLocation);
            return;
        }

        const distanceMeters = distanceMetersBetween;
        const projection = projectOntoRoute(currentLocation, navRoute, Math.max(0, navSnapIndexRef.current - 4), Math.min(navRoute.length - 1, navSnapIndexRef.current + 400));
        const nearestIndex = projection.index;
        const nearestDistance = projection.distance;
        // Only snap the displayed vehicle to the route when GPS and route geometry
        // actually agree. The old 85m tolerance could pull the icon onto a nearby
        // parallel/side road and make the street map appear wrong.
        if (navOffRoute) {
            setNavigationDisplayLocation(currentLocation);
            return;
        }
        const snapToleranceMeters = gpsQuality?.state === 'live' ? 35 : 20;
        const canSnapToRoute = nearestDistance <= snapToleranceMeters;
        if (canSnapToRoute) navSnapIndexRef.current = Math.max(navSnapIndexRef.current - 3, nearestIndex);
        // Once off-route, immediately follow the real GPS point rather than
        // visually pulling the vehicle back onto the obsolete route line.
        const target = canSnapToRoute ? projection.point : currentLocation;
        setNavigationDisplayLocation(previous => {
            if (!previous) return target;
            const moved = distanceMeters(previous, target);
            if (moved < 3) return previous;
            if (moved > 120) return target;
            return [previous[0] * 0.3 + target[0] * 0.7, previous[1] * 0.3 + target[1] * 0.7];
        });
    }, [currentLocation, isNavigating, navRoute, gpsQuality?.state, navOffRoute]);

    const toggleNavigationVoice = () => {
        setNavVoiceMuted(current => {
            const next = !current;
            try { localStorage.setItem('bps:navigation-voice-muted', next ? '1' : '0'); } catch {}
            if (!next) spokenNavPromptsRef.current.clear();
            return next;
        });
    };

    const startInAppNavigation = async () => {
        const call = selectedCall;
        if (!call) return;
        let destination = validPosition(call.latitude, call.longitude)
            ? { coords: [Number(call.latitude), Number(call.longitude)], name: call.location || call.incident || 'Call location' }
            : null;
        if (!destination) {
            // Live CAD records sometimes arrive before GRAC provides GPS. Use
            // the same TomTom-first server geocoder used for dispatch creation;
            // do not block officers from starting directions to an address.
            const address = String(call.location || '').trim();
            if (address.length < 5) {
                toast.error('Call address is missing. Dispatch must provide a location.');
                return;
            }
            try {
                const region = /HPD|HFD|HENRICO/i.test(String(call.agency || '')) ? 'Henrico County, VA'
                    : /CCPD|CCFD|CHESTERFIELD/i.test(String(call.agency || '')) ? 'Chesterfield County, VA' : 'Richmond, VA';
                const query = /\b(VA|Virginia|Richmond|Henrico|Chesterfield)\b/i.test(address) ? address : `${address}, ${region}`;
                const result = await withRequestTimeout(base44.functions.invoke('geocodeNavigationDestination', {query}), 10000, 'Call address lookup');
                const matches = result?.data?.results || result?.results || [];
                const point = matches.find(item => validPosition(item?.coords?.[0], item?.coords?.[1]));
                if (point) destination = {coords: point.coords, name: address, address};
            } catch (error) {
                console.warn('Dispatch call address navigation lookup failed:', error?.message || error);
            }
        }
        if (!destination) {
            toast.error('No verified map location for this call. Confirm its address with Dispatch.');
            return;
        }
        await startNavigationToPoint(destination, {dispatchCall: call});
    };

    const openInAppStreetView = () => {
        const lat = Number(selectedCall?.latitude);
        const lng = Number(selectedCall?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            toast.error('This call does not have mapped coordinates');
            return;
        }
        setStreetViewUrl(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`);
    };

    const searchAddress = async (event) => {
        event?.preventDefault();
        const request = ++destinationRequestRef.current;
        const query = addressQuery.trim();
        if (query.length < 3) return;
        setAddressSearching(true);
        setAddressSearchError('');
        setAddressResults([]);
        setMapSelectedDestination(null);
        setMapPickMode(false);
        setNavigationFallbackAddress(query);
        try {
            // A disconnected GPS does not make place search unavailable. Use
            // the viewed map area as a search bias only, never as a route origin.
            const searchBias = currentLocation || mapCenter || [37.541, -77.436];
            const results = await withRequestTimeout(lookupNavigationDestinations(query, searchBias), 23000, 'Destination search');
            if (request !== destinationRequestRef.current) return;
            setAddressResults(results);
            if (!results.length) {
                setAddressSearchError('No mapped address or place was returned. Try the full street, business, building, or city.');
                toast.error('Location not found. Try a more specific search.');
            } else {
                const points = results.map(result => result.coords).filter(coords => Array.isArray(coords));
                setFitBounds(points);
                window.setTimeout(() => setFitBounds(null), 1100);
                toast.success(`${results.length} location${results.length === 1 ? '' : 's'} found`);
            }
        } catch (error) {
            const message = error?.message || 'Unable to search locations';
            if (request !== destinationRequestRef.current) return;
            setAddressSearchError(message + '. Use Google Maps below if the address services are unavailable.');
            toast.error(message);
        } finally {
            if (request === destinationRequestRef.current) setAddressSearching(false);
        }
    };

    const selectMapLocation = async (coords) => {
        if (!mapPickMode || !Array.isArray(coords) || coords.length < 2) return;
        const [lat, lng] = coords.map(Number);
        if (!validPosition(lat, lng)) return;
        const request = ++destinationRequestRef.current;
        setMapPickMode(false);
        setFitBounds(null);
        setMapCenter(null);
        setShowAddressSearch(true);
        setAddressSearching(true);
        setAddressSearchError('');
        setAddressResults([]);
        const pending = {
            coords: [lat, lng],
            name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            label: 'Selected Map Location',
            type: 'map_point',
        };
        setMapSelectedDestination(pending);
        setNavigationFallbackAddress(pending.address);
        try {
            const resolved = await lookupNavigationPoint(lat, lng);
            if (request !== destinationRequestRef.current) return;
            const destination = { ...resolved, coords: pending.coords, label: 'Selected Map Location' };
            setMapSelectedDestination(destination);
            setAddressQuery(destination.address || destination.name || '');
            setNavigationFallbackAddress(destination.address || destination.name || pending.address);
        } catch (error) {
            if (request !== destinationRequestRef.current) return;
            setAddressSearchError(error?.message || 'The map point could not be identified by street name, but its coordinates can still be used.');
        } finally {
            if (request === destinationRequestRef.current) setAddressSearching(false);
        }
    };

    const showHomeLocation = async ({ navigate = false } = {}) => {
        setMapPickMode(false);
        setShowAddressSearch(false);
        setAddressSearching(true);
        setAddressSearchError('');
        try {
            // Read the signed-in officer's private Home address directly. Do not
            // depend on the general directory/currentUser object because CAD/session
            // syncs can replace that object with a redacted operational profile.
            let freshHomeAddress = homeAddress;
            try {
                const response = await base44.functions.invoke('updateMyHomeAddress', { action: 'get' });
                const profile = response?.data || response || {};
                if (profile.error) throw new Error(profile.error);
                const backendAddress = profileHomeAddress(profile);
                if (backendAddress) {
                    freshHomeAddress = backendAddress;
                    setCurrentUser(previous => previous ? {
                        ...previous,
                        address: profile.address || '',
                        city: profile.city || '',
                        state: profile.state || '',
                        zip: profile.zip || '',
                    } : previous);
                }
            } catch (profileError) {
                if (!freshHomeAddress) throw profileError;
            }

            if (!freshHomeAddress) {
                toast.error('No Home address is saved. Add one in My Profile first.');
                return;
            }

            let destination = homeDestination;
            if (!destination || String(destination.address || '') !== freshHomeAddress) {
                const results = await lookupNavigationDestinations(freshHomeAddress, currentLocation);
                destination = results[0] || null;
                if (!destination) throw new Error('Your saved Home address could not be mapped. Check the address in My Profile.');
                destination = { ...destination, name: 'Home', address: freshHomeAddress, label: 'Home' };
                setHomeDestination(destination);
            }
            setMapSelectedDestination(destination);
            setAddressQuery(freshHomeAddress);
            setNavigationFallbackAddress(freshHomeAddress);
            setAddressResults([]);
            setFitBounds([...(currentLocation ? [currentLocation] : []), destination.coords]);
            if (navigate) await startNavigationToPoint(destination);
            else setShowAddressSearch(true);
        } catch (error) {
            const message = error?.message || 'Unable to locate Home';
            setAddressSearchError(message);
            toast.error(message);
        } finally {
            setAddressSearching(false);
        }
    };

    const stopInAppNavigation = () => {
        stopVoice();
        lastSpokenNavStepRef.current = -1;
        spokenNavPromptsRef.current.clear();
        setIsNavigating(false);
        try{sessionStorage.removeItem('bps:active-navigation');}catch{}
        setFollowMyLocation(false);
        setNavDestination(null);
        setNavRoute([]);
        setRoutePreviewOnly(false);
        setNavRouteProvider('');
        setNavSpeedLimitSections([]);
        setNavTrafficSegments([]);
        setNavSteps([]);
        setNavStepIndex(0);
        setNavDistanceMiles(0);
        setNavDurationMinutes(0);
        setNavTurnDistanceFeet(0);
        setNavOffRoute(false);
    };

    const recenter = async () => {
        const fresh = await getFreshDeviceLocation();
        if (!fresh) {
            toast.error('Unable to get your current location');
            return;
        }
        setFollowMyLocation(true);
        setRecenterRevision(revision => revision + 1);
        setMapCenter([...fresh]);
        window.setTimeout(() => setMapCenter(null), 800);
        toast.success('Map centered on your current location');
    };

    // Zoom out so every unit with GPS coordinates is visible on the map at once.
    const fitAllUnits = () => {
        const coords = [];
        if (currentLocation && Number.isFinite(currentLocation[0]) && Number.isFinite(currentLocation[1])) {
            coords.push([currentLocation[0], currentLocation[1]]);
        }
        for (const u of mapVisibleUnits) {
            const liveLat = u.latitude === null || u.latitude === undefined ? NaN : Number(u.latitude);
            const liveLng = u.longitude === null || u.longitude === undefined ? NaN : Number(u.longitude);
            const lastLat = u.last_known_latitude === null || u.last_known_latitude === undefined ? NaN : Number(u.last_known_latitude);
            const lastLng = u.last_known_longitude === null || u.last_known_longitude === undefined ? NaN : Number(u.last_known_longitude);
            if (Number.isFinite(liveLat) && Number.isFinite(liveLng)) coords.push([liveLat, liveLng]);
            else if (Number.isFinite(lastLat) && Number.isFinite(lastLng)) coords.push([lastLat, lastLng]);
        }
        if (coords.length === 0) {
            toast.error('No units with GPS coordinates to display');
            return;
        }
        setFitBounds(coords);
        window.setTimeout(() => setFitBounds(null), 800);
        toast.success(`Fitting ${coords.length} unit${coords.length === 1 ? '' : 's'} on map`);
    };

    const fetchOtherUnits = async (force = false) => {
        try {
            // Navigation shares the full canonical snapshot already used by CAD,
            // Command, and the dashboard. Using a second location_only request body
            // defeated request deduplication and caused two getOnDutyUnits calls at
            // startup. Never fall back to raw ActiveOfficer rows.
            const payload = await getOfficerLocationSnapshot({ force });
            const roster = Array.isArray(payload.units) ? payload.units : payload.users || [];
            const sourceUnits = roster
                // Retained-session officers (map_visible) stay on the map with their
                // last known position even when their live session recently ended.
                .filter(unit => unit.session_active === true || unit.presence_online === true || unit.map_visible === true);
            const currentEmail = currentUser?.email?.toLowerCase();
            const self = sourceUnits.find(unit => String(unit.officer_email || unit.email || '').toLowerCase() === currentEmail);
            if (self) setCurrentUser(previous => previous ? { ...previous, unit_number:self.unit_number, rank:self.rank } : previous);
            // Server positions are a labelled fallback while this device acquires GPS.
            if (!getLiveLocation(30000) && self) {
                const live = validPosition(self.latitude, self.longitude);
                const lat = live ? self.latitude : self.last_known_latitude;
                const lng = live ? self.longitude : self.last_known_longitude;
                if (validPosition(lat, lng)) {
                    setCurrentLocation([Number(lat), Number(lng)]);
                    setGpsQuality({ state: 'last_known', accuracy: live ? self.accuracy : self.last_known_accuracy });
                    setIsLiveTracking(false);
                }
            }
            const units = sourceUnits
                .filter(unit => String(unit.officer_email || unit.email || '').toLowerCase() !== currentEmail)
                .filter(unit => {
                    const hasLive = validPosition(unit.latitude, unit.longitude);
                    const hasLast = validPosition(unit.last_known_latitude, unit.last_known_longitude);
                    const hasCoarse = validPosition(unit.coarse_latitude, unit.coarse_longitude);
                    return hasLive || hasLast || hasCoarse;
                })
                .map(unit => ({
                    ...unit,
                    email: unit.officer_email || unit.email,
                    latitude: unit.latitude === null || unit.latitude === undefined ? null : Number(unit.latitude),
                    longitude: unit.longitude === null || unit.longitude === undefined ? null : Number(unit.longitude),
                    heading: Number(unit.heading) || 0,
                    isUnionLead: unit.is_union_lead === true || unit.isUnionLead === true,
                    unionMembers: Number(unit.union_member_count || unit.unionMembers) || 1,
                    show_on_map: unit.show_on_map !== false,
                }));
            setOtherUnits(units);
        } catch (e) {
            console.warn('[NAV] on-duty unit fetch failed:', e?.message);
            // Preserve the last confirmed map positions during a transient refresh failure.
        }
    };

    const autoGeocodeUnmapped = async (unmapped) => {
        if (!unmapped.length || isGeocoding) return;
        setIsGeocoding(true);
        try {
            // Credit-free: delegate to backend geocodeMissingCalls (uses direct fetch, no InvokeLLM)
            const count = unmapped.length;
            await base44.functions.invoke('geocodeMissingCalls', {
                limit: Math.min(count, 50),
                force_retry: true,
                retry_rounds: 3,
            });
            toast.success(`Geocoding ${Math.min(count, 50)} calls in background`);
            // Give the backend a moment to persist, then re-fetch
            setTimeout(() => { fetchCalls(); setIsGeocoding(false); }, 4000);
        } catch (e) {
            console.warn('[NAV] geocode trigger failed:', e?.message);
            toast.error('Geocoding failed');
            setIsGeocoding(false);
        }
    };

    // Geocoding handled by backend "geocodeMissingCalls" automation (every 10 min).
    // Frontend must not call geocoding providers directly (causes 502s / rate limits).

    const fetchCalls = async () => {
        if (callsLoadingRef.current) return;
        callsLoadingRef.current = true;
        setCallsRefreshing(true);
        try {
            let all = await loadActiveDispatchCallRows(500);
            if (cadCallFeedIsStale(all)) {
                // Render the persisted queue now; ingestion runs independently.
                void refreshCadIngestionIfStale(all).then(recovery => {
                    if (!recovery?.success || recovery?.skipped) return;
                    clearActiveDispatchCallMemoryCache();
                    window.dispatchEvent(new CustomEvent('bps-cad-ingest-finished'));
                }).catch(error => setCallsError('Source sync delayed: ' + (error?.message || 'retrying')));
            }
            const readAt = getActiveDispatchCallReadTime();
            setCallsCheckedAt(readAt ? new Date(readAt) : null);
            setCallsError(!readAt || Date.now() - readAt > 30000 ? 'Showing saved calls; live feed is reconnecting.' : '');
            const uniqueCalls = new Map();
            for (const call of all || []) {
                const descriptionKey = String(call.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1];
                const key = call.external_call_id || descriptionKey || call.id;
                const current = uniqueCalls.get(key);
                const currentHasIdentifier = Boolean(current?.agency_cad_number || current?.bps_reference || current?.call_id);
                const candidateHasIdentifier = Boolean(call?.agency_cad_number || call?.bps_reference || call?.call_id);
                const currentHasOfficialCad = Boolean(current?.official_cad_verified && (current?.agency_cad_number || current?.call_id));
                const candidateHasOfficialCad = Boolean(call?.official_cad_verified && (call?.agency_cad_number || call?.call_id));
                if (!current || (!currentHasIdentifier && candidateHasIdentifier) || (!currentHasOfficialCad && candidateHasOfficialCad)) uniqueCalls.set(key, call);
            }
            // Use the same operational visibility and duplicate rules as CAD.
            // Do not apply a second map-only cap that changes dashboard totals.
            const active = dedupeOperationalCalls([...uniqueCalls.values()].filter(c =>
                !['Cleared', 'Cancelled', 'Closed'].includes(String(c.status || ''))
            ));
            const { unmapped } = splitCallsByCoords(active);
            setActiveCalls(active);
            setUnmappedCalls(unmapped);
            if (focusCallId) {
                const target = active.find(c => c.id === focusCallId);
                if (target) {
                    setSelectedCall(target);
                    setShowCallSidebar(true);
                    setCallSidebarCollapsed(false);
                    setCallDistrict(null);
                    if (Number.isFinite(Number(target.latitude)) && Number.isFinite(Number(target.longitude))) {
                        setMapCenter([Number(target.latitude), Number(target.longitude)]);
                        window.setTimeout(() => setMapCenter(null), 1200);
                        lookupDistrict(target.latitude, target.longitude).then(d => setCallDistrict(d)).catch(() => null);
                    }
                }
            }
            // geocoding handled by backend automation
        } catch (e) {
            console.warn('[NAV] fetchCalls error:', e.message);
            setCallsError(e?.message || 'Call feed unavailable; retrying');
        } finally {
            callsLoadingRef.current = false;
            setCallsRefreshing(false);
        }
    };



    const selfEntry = currentUser ? {
        ...currentUser,
        status: unitStatus,
        latitude: isLiveTracking && currentLocation ? currentLocation[0] : null,
        longitude: isLiveTracking && currentLocation ? currentLocation[1] : null,
        accuracy: gpsQuality?.accuracy ?? null,
        gps_quality_state: gpsQuality?.state || 'acquiring',
    } : null;
    const otherOnline = otherUnits.filter(u => u.last_updated && Date.now() - new Date(u.last_updated) < 12 * 3600000);
    const onlineUnits = selfEntry ? [selfEntry, ...otherOnline] : otherOnline;
    // Officer-safety rule: every authorized officer sees every recently active unit.
    const mapVisibleUnits = otherUnits;

    const criticalCalls = activeCalls.filter(isCriticalCall);
    const unassignedCalls = activeCalls.filter(c => !c.assigned_units?.length && !c.source);
    const displayedCalls = showOnlyCriticalCalls ? criticalCalls : activeCalls;
    const activeNavStep = navSteps[navStepIndex] || null;
    const nextNavStep = navSteps[navStepIndex + 1] || null;
    const navDistanceLabel = navTurnDistanceFeet < 1000
        ? `${Math.max(0, Math.round(navTurnDistanceFeet / 50) * 50)} ft`
        : `${(navTurnDistanceFeet / 5280).toFixed(navTurnDistanceFeet >= 5280 ? 1 : 2)} mi`;
    const navEtaLabel = (isLiveTracking || routePreviewOnly)
        ? new Date(Date.now() + navDurationMinutes * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : 'GPS lost';

    const getUnitNumberFromId = (userId) => {
        if (currentUser?.id === userId) return currentUser.unit_number || currentUser.full_name?.split(' ')[0] || 'UNIT';
        const unit = otherUnits.find(u => u.id === userId);
        return unit?.unit_number || unit?.full_name?.split(' ')[0] || 'UNIT';
    };

    const mapToolActions = [
                        {
                            key: 'fitunits',
                            onClick: fitAllUnits,
                            title: 'Zoom out to show ALL units on the map',
                            icon: <Users className="h-4 w-4" />,
                            active: false,
                            disabled: mapVisibleUnits.length === 0,
                        },
                        {
                            key: 'recenter',
                            onClick: recenter,
                            title: 'Center on my current location',
                            icon: <Crosshair className="h-4 w-4" />,
                            active: isLiveTracking,
                        },
                        {
                            key: 'search',
                            onClick: () => {
                                setMapToolsPanel(null); setShowCallSidebar(false); setShowAddressSearch(open => !open);
                                if (showAddressSearch) {
                                    setAddressResults([]);
                                    setAddressQuery('');
                                    setMapPickMode(false);
                                    setMapSelectedDestination(null);
                                }
                            },
                            title: showAddressSearch ? 'Close address search' : 'Search for a destination',
                            icon: showAddressSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />,
                            active: showAddressSearch,
                        },
                        {
                            key: 'home',
                            onClick: () => {setMapToolsPanel(null);setShowCallSidebar(false);showHomeLocation();},
                            title: 'Show my saved Home address',
                            icon: <Home className="h-4 w-4" />,
                            active: mapSelectedDestination?.label === 'Home',
                            disabled: isNavigating,
                        },
                        {
                            key: 'pick',
                            onClick: () => {
                                setMapToolsPanel(null); setShowAddressSearch(true);
                                destinationRequestRef.current += 1;
                            setAddressSearching(false);
                            setMapSelectedDestination(null);
                            setShowCallSidebar(false);
                            setShowUnmapped(false);
                            setMapPickMode(enabled => !enabled);
                                setAddressResults([]);
                                setAddressSearchError('');
                            },
                            title: mapPickMode ? 'Cancel map destination selection' : 'Pick a destination directly on the map',
                            icon: <MapPin className="h-4 w-4" />,
                            active: mapPickMode,
                            disabled: isNavigating,
                        },
                        {
                            key: 'calls',
                            onClick: () => setShowActiveCalls(visible => !visible),
                            title: showActiveCalls ? 'Hide calls from map' : 'Show calls on map',
                            icon: showActiveCalls ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
                            active: showActiveCalls,
                        },
                        {
                            key: 'theme',
                            onClick: () => setMapTheme(mapTheme === 'night' ? 'day' : 'night'),
                            title: mapTheme === 'night' ? 'Use day map' : 'Use night map',
                            icon: <Layers className="h-4 w-4" />,
                            active: mapTheme === 'night',
                        },
                        {
                            key: 'tomtom-main',
                            onClick: () => {
                                if(tomTomMainMapFailed){setUseTomTomMainMap(true);setTomTomMainMapFailed(false);setTomTomRecoveryAttempt(n=>n+1);setTomTomRetryAt(0);}
                                else setUseTomTomMainMap(value=>!value);
                            },
                            title: useTomTomMainMap ? 'Use backup offline/CAD map' : 'Use TomTom as main map',
                            icon: <Layers className="h-4 w-4" />,
                            active: useTomTomMainMap && !tomTomMainMapFailed,
                        },
                        {
                            key: 'tomtom-traffic',
                            onClick: () => setShowTomTomTraffic(value => !value),
                            title: showTomTomTraffic ? 'Hide TomTom route traffic' : 'Show TomTom route traffic',
                            icon: <Layers className="h-4 w-4" />,
                            active: showTomTomTraffic && navTrafficSegments.length > 0,
                            disabled: navTrafficSegments.length === 0,
                        },
                        {
                            key: 'heatmap',
                            onClick: () => setShowHeatmap(visible => !visible),
                            title: showHeatmap ? 'Hide call heatmap' : 'Show call heatmap',
                            icon: <Flame className="h-4 w-4" />,
                            active: showHeatmap,
                            disabled: activeCalls.length === 0,
                        },
                    ];

    const mapContent = (
        <div style={mapFullscreen ? { position: "fixed", inset: 0, zIndex: 2147483000, height: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" } : undefined} className="pf-navigation-workspace relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#07101a]">

            {/* ══ MAP BASE LAYER ══ */}
            <div className="absolute inset-0">
                {useTomTomMainMap && isOnline && !tomTomMainMapFailed ? (
                  <Suspense fallback={<div role="status" className="absolute inset-0 flex items-center justify-center bg-slate-950 text-sm text-white">Loading TomTom live map…</div>}>
                    <TomTomSdkMapPreview
                      key={'tomtom-gps-'+tomTomRecoveryAttempt}
                      embedded allowBlankMapFallback
                      currentLocation={isNavigating ? (navigationDisplayLocation || currentLocation) : currentLocation}
                      activeCalls={showActiveCalls ? activeCalls : []}
                      otherUnits={mapVisibleUnits}
                      route={navRoute}
                      destination={navDestination}
                      heading={heading}
                      speedMph={speed}
                      recenterRevision={recenterRevision}
                      selectedPin={mapSelectedDestination}
                      searchPins={showAddressSearch ? addressResults : []}
                      mapPickEnabled={mapPickMode}
                      facilityFilters={jurisdictionFilters}
                      showPoliceStations={jurisdictionFilters.showPoliceStations}
                      showFireStations={jurisdictionFilters.showFireStations}
                      showJails={jurisdictionFilters.showJails}
                      onSelectFacility={facility=>{
                        setMapSelectedDestination(facility);
                        setShowAddressSearch(true);
                      }}
                      mapTheme={mapTheme}
                      navigation={isNavigating && activeNavStep ? {instruction:formatInstruction(activeNavStep), distance:navDistanceLabel, eta:navEtaLabel, provider:navRouteProvider} : null}
                      onMapUnavailable={markTomTomUnavailable}
                      onMapReady={markTomTomReady}
                      onSelectPoint={coords=>{
                        setMapSelectedDestination({coords,name:`${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`,address:`${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`,label:'TomTom map location'});
                        setShowAddressSearch(true);
                      }}
                      onCallClick={call=>{setSelectedCall(call);setShowCallSidebar(true);}}
                    />
                  </Suspense>
                ) : <MapView
                    currentLocation={isNavigating ? (navigationDisplayLocation || currentLocation) : currentLocation}
                    destination={navDestination} route={navRoute} trafficSegments={showTomTomTraffic ? navTrafficSegments : []}
                    useOfflineTiles={!isOnline}
                    activeCalls={showActiveCalls ? activeCalls : []}
                    heading={heading}
                    locationHistory={isLiveTracking ? locationHistory : []}
                    unitName={unitName || currentUser?.unit_number}
                    flashAssignedEnroute={flashSelfAssignedEnroute && isLiveTracking}
                    otherUnits={mapVisibleUnits}
                    currentUserId={currentUser?.id}
                    speed={speed}
                    mapCenter={mapCenter}
                    fitBounds={fitBounds}
                    isNavigating={isNavigating}
                    gpsFollowEnabled={(isNavigating || followMyLocation) && isLiveTracking && gpsQuality?.state === 'live'}
                    recenterRevision={recenterRevision}
                    upcomingManeuverDistance={navTurnDistanceFeet}
                    baseMapType={jurisdictionFilters.baseMapType}
                    jurisdictionFilters={jurisdictionFilters}
                    showPoliceStations={jurisdictionFilters.showPoliceStations}
                    showFireStations={jurisdictionFilters.showFireStations}
                    showJails={jurisdictionFilters.showJails}
                    onNavigateToJail={(destination) => startNavigationToPoint(destination)}
                    onNavigateToPoint={(destination) => startNavigationToPoint(destination)}
                    searchPin={mapSelectedDestination}
                    searchPins={showAddressSearch ? addressResults : []}
                    mapPickEnabled={mapPickMode}
                    onMapPick={selectMapLocation}
                    mapTheme={mapTheme}
                    showHeatmap={showHeatmap}
                    allCalls={activeCalls}
                    onCallClick={(call) => {
                        setMapToolsPanel(null); setShowAddressSearch(false); setSelectedCall(call); setShowCallSidebar(true); setCallSidebarCollapsed(false); setCallDistrict(null);
                        if (call.latitude && call.longitude) lookupDistrict(call.latitude, call.longitude).then(d => setCallDistrict(d));
                    }}
                >
                    <OfficerDistressMarker autoCenter={false} />
                </MapView>}
                {useTomTomMainMap && (tomTomMainMapFailed || !isOnline) && <div role="status" className="pointer-events-auto absolute bottom-3 left-3 z-[1205] flex max-w-[calc(100%-24px)] flex-wrap items-center gap-2 rounded-xl border border-amber-600/70 bg-slate-950/95 px-3 py-2 text-xs text-amber-100 shadow-lg">
                  <span>TomTom {isOnline ? 'temporarily unavailable · automatic recovery scheduled' : 'waiting for internet'} · Backup CAD map active</span>
                </div>}
            </div>

            <div ref={toolbarRef} className="absolute left-0 right-0 top-0 z-[1010]">
                <LiveMapToolbar user={currentUser} status={unitStatus} saving={statusSaving} onStatusChange={handleStatusChange}
                    onBack={() => navigate('/CommandDashboard')} onRecenter={recenter}
                    onRefreshCalls={() => { clearBase44ReadCacheMatching('function:getActiveDispatchCalls:'); clearBase44ReadCacheMatching('entity:DispatchCall:'); clearActiveDispatchCallMemoryCache(); fetchCalls(); }} callsRefreshing={callsRefreshing}
                    callsStatus={callsError || (callsCheckedAt ? 'Calls checked ' + formatEasternTime(callsCheckedAt) : 'Loading calls')}
                    criticalCount={criticalCalls.length}
                    fullscreen={mapFullscreen} onToggleFullscreen={toggleMapFullscreen}
                    gpsLabel={!isLiveTracking && (externalReceiver.connected || externalReceiver.connecting) ? (externalReceiver.lastFixAt ? 'External antenna connected · Waiting for fresh satellite fix' : 'External antenna connected · No satellite fix yet') : !isLiveTracking && externalReceiver.portGranted ? 'External antenna authorized · Reconnecting receiver' : isLiveTracking ? `${gpsFixSource === 'external_serial' ? 'External antenna' : 'Device GPS'} · ${Math.round(Number(gpsQuality?.accuracy || 0))} m` : gpsQuality?.state === 'denied' ? 'Allow location access' : gpsQuality?.state === 'acquiring' ? 'Acquiring GPS…' : 'GPS signal lost · last known position'}
                    gpsActive={isLiveTracking} online={isOnline} speed={speed} unitCount={onlineUnits.length} callCount={activeCalls.length} unassignedCount={unassignedCalls.length} />

            </div>

            {isNavigating && navDestination && (
                <div style={{ top: toolbarHeight + 12 }} className="pf-route-guidance pointer-events-auto absolute left-3 right-3 z-[1215] md:right-auto md:w-[560px]">
                    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#06100d] shadow-[0_22px_70px_rgba(0,0,.72)]">
                        {routePreviewOnly && <div role="status" className="border-b border-amber-600/50 bg-amber-950 px-4 py-2 text-xs font-semibold text-amber-200">Route preview · Live GPS is not available. Directions will not advance automatically until GPS is enabled.</div>}
                        {(routing || navOffRoute) && (
                            <div className="flex items-center gap-2 border-b border-amber-500/30 bg-[#2a1a05] px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">
                                <RotateCcw className={`h-3.5 w-3.5 ${routing ? 'animate-spin' : ''}`} />
                                {routing ? 'Rerouting…' : 'Off route · recalculating'}
                            </div>
                        )}
                        <div className="flex min-h-[132px] items-stretch">
                            <div className="flex w-[118px] shrink-0 flex-col items-center justify-center bg-[#17a566] px-3 py-4 text-white">
                                {maneuverIconForStep(activeNavStep, 'h-11 w-11 stroke-[2.8]')}
                                <div className="mt-2 text-2xl font-black leading-none">{navDistanceLabel}</div>
                            </div>
                            <div className="min-w-0 flex-1 bg-[#0a1612] px-5 py-4">
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">
                                    <span>Next maneuver</span>
                                    <span className="rounded border border-emerald-700/60 bg-emerald-950/40 px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-emerald-100">{navRouteProvider === 'TomTom' ? 'TomTom turn-by-turn' : 'Fallback turn-by-turn'}</span>
                                </div>
                                <div className="mt-1 text-[22px] font-black leading-[1.12] text-white">{formatInstruction(activeNavStep)}</div>
                                {nextNavStep && (
                                    <div className="mt-3 flex items-center gap-2 border-t border-slate-700 pt-3 text-xs text-slate-100">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-emerald-300">{maneuverIconForStep(nextNavStep, 'h-4 w-4')}</span>
                                        <span className="min-w-0 truncate"><span className="mr-1 font-black text-emerald-300">THEN</span>{formatInstruction(nextNavStep)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 border-t border-slate-800 bg-[#030806] px-4 py-3">
                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                <div><div className="text-base font-black text-white">{navEtaLabel}</div><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">ETA</div></div>
                                <div className="h-8 w-px bg-slate-700" />
                                <div><div className="text-base font-black text-white">{isLiveTracking || routePreviewOnly ? `${navDurationMinutes} min` : '—'}</div><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{navDistanceMiles.toFixed(1)} mi {isLiveTracking || routePreviewOnly ? 'left' : 'at last fix'}</div></div>
                                <div className="hidden min-w-0 sm:block"><div className="max-w-[185px] truncate text-xs font-black text-white">{navDestination.name}</div><div className="text-[9px] font-black uppercase tracking-wide text-slate-500">Destination</div></div>
                            </div>

                            <button type="button" onClick={toggleNavigationVoice} className={`flex h-10 w-10 items-center justify-center rounded-full border ${navVoiceMuted ? 'border-slate-600 bg-slate-900 text-slate-400' : 'border-emerald-500 bg-emerald-950 text-emerald-200'}`} title={navVoiceMuted ? 'Turn navigation voice on' : 'Mute navigation voice'}>{navVoiceMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
                            <button type="button" onClick={recenter} className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-500 bg-blue-950 text-blue-200" title="Recenter navigation"><LocateFixed className="h-4 w-4" /></button>
                            <button type="button" onClick={stopInAppNavigation} className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500 bg-red-950 text-red-300" title="End navigation"><Square className="h-3.5 w-3.5 fill-current" /></button>
                        </div>
                    </div>
                    <PatrolSpeedSigns speed={speed} limit={roadSpeedLimit} live={isLiveTracking}
                      qualified={speedSignQualified} estimated={roadSpeedLimitEstimated}
                      road={roadSpeedLimitRoad} status={roadSpeedLimitStatus} source={roadSpeedLimitSource} />
                </div>
            )}

            {!isNavigating && currentLocation && (gpsQuality?.state === 'live' || Number(speed) > 0) && (
                <div style={{ top: toolbarHeight + 12 }} className="pf-idle-speed pointer-events-none absolute left-3 z-[1214]">
                    <PatrolSpeedSigns speed={speed} limit={roadSpeedLimit} live={isLiveTracking}
                      qualified={speedSignQualified} estimated={roadSpeedLimitEstimated}
                      road={roadSpeedLimitRoad} status={roadSpeedLimitStatus} source={roadSpeedLimitSource} />
                </div>
            )}


            {patrolSpeedMonitor.level==='critical' && <div role="status" aria-live="polite" className="sr-only">Critical speeding warning: more than ten miles per hour over the mapped speed limit.</div>}
            {patrolSpeedMonitor.level==='warning' && <div role="status" aria-live="polite" className="sr-only">Speed warning: more than five miles per hour over the mapped speed limit.</div>}
            {mapPickMode && <div style={{ top: toolbarHeight + 8 }} className="pointer-events-none absolute left-3 right-24 z-[1220] rounded-lg bg-emerald-950/95 p-3 text-sm text-emerald-100" role="status">Tap the map to drop a pin. Drag to move the map. Tap Pick Point again to cancel.</div>}
            {/* Street address search and destination routing */}
            {showAddressSearch && !mapPickMode && (
                <div style={{ top: toolbarHeight + 12 }} className={`pf-map-search-panel pointer-events-auto absolute z-[1220] overflow-x-hidden overflow-y-auto rounded-xl ${isNavigating ? 'pf-search-routing' : ''}`}>
                    <div className="pf-address-search-heading flex items-center justify-between gap-2 px-2 py-2 text-sm font-bold text-white"><span>Find destination</span><button type="button" className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-white" onClick={() => { setShowAddressSearch(false); setAddressResults([]); setAddressQuery(''); }} aria-label="Close destination search"><X className="h-4 w-4" /></button></div>
                    <form onSubmit={searchAddress} className="flex items-center gap-2 rounded-xl border border-[#45637f] bg-[#07111f] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
                        <Search className="ml-2 h-4 w-4 text-slate-400" />
                        <input
                            autoFocus
                            value={addressQuery}
                            onChange={(event) => setAddressQuery(event.target.value)}
                            placeholder="Search an address, building, or place"
                            className="h-9 flex-1 bg-transparent px-1 text-sm text-white outline-none placeholder:text-slate-500"
                        />
                        <button type="submit" disabled={addressSearching || addressQuery.trim().length < 3}
                            className="flex h-9 items-center gap-1 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50">
                            <Search className="h-4 w-4" /> {addressSearching ? 'SEARCHING' : 'SEARCH'}
                        </button>
                    </form>
                    <details className="pf-manual-origin mt-2 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-200">
                        <summary className="cursor-pointer font-semibold text-amber-200">{isLiveTracking ? 'Set a different starting address' : 'No GPS fix · Enter a starting address for route preview'}</summary>
                        <label htmlFor="pf-manual-origin-input" className="mt-2 block pb-1 font-semibold">Starting address</label>
                        <input id="pf-manual-origin-input" value={manualOriginQuery} onChange={event => setManualOriginQuery(event.target.value)} placeholder="Street, city, state, ZIP" className="h-10 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500" />
                        <span className="mt-1 block text-[10px] text-slate-400">Route previews do not require GPS. Live turn-by-turn guidance needs an accurate receiver fix.</span>
                    </details>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <button type="button" onClick={() => showHomeLocation()} disabled={addressSearching || isNavigating}
                            className="flex items-center justify-center gap-1.5 rounded-lg border border-cyan-600/50 bg-cyan-950/70 px-3 py-2 text-[10px] font-black text-cyan-100 hover:bg-cyan-900/70 disabled:cursor-not-allowed disabled:opacity-40">
                            <Home className="h-3.5 w-3.5" /> HOME
                        </button>
                        <button type="button" onClick={() => {
                            destinationRequestRef.current += 1;
                            setAddressSearching(false);
                            setMapSelectedDestination(null);
                            setShowCallSidebar(false);
                            setShowUnmapped(false);
                            setMapPickMode(enabled => !enabled);
                            setShowAddressSearch(true);
                            setAddressResults([]);
                            setAddressSearchError('');
                        }} disabled={isNavigating}
                            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-black ${mapPickMode ? 'border-emerald-400 bg-emerald-600 text-white' : 'border-emerald-600/50 bg-emerald-950/70 text-emerald-100 hover:bg-emerald-900/70'} disabled:opacity-40`}>
                            <MapPin className="h-3.5 w-3.5" /> {mapPickMode ? 'CLICK MAP' : 'PICK ON MAP'}
                        </button>
                        <button type="button" onClick={()=>showHomeLocation({navigate:true})} disabled={addressSearching || isNavigating}
                            className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/50 bg-blue-900/80 px-3 py-2 text-[10px] font-black text-blue-100 hover:bg-blue-800 disabled:opacity-40 sm:col-span-1">
                            <Navigation2 className="h-3.5 w-3.5" /> NAVIGATE HOME
                        </button>
                    </div>
                    {mapPickMode && (
                        <div className="mt-2 rounded-lg border border-emerald-500/60 bg-emerald-950/85 px-3 py-2 text-xs font-bold text-emerald-100">
                            Click or tap any point on the map. Pathfinder will identify the street/place and drop a destination pin there.
                        </div>
                    )}
                    {!homeAddress && (
                        <div className="mt-2 text-[10px] text-slate-500">Add your address, city, state, and ZIP in your Pathfinder profile to enable Home navigation.</div>
                    )}
                    {!isLiveTracking && (externalReceiver.connected || externalReceiver.portGranted || externalReceiver.connecting) && (
                        <details className="mt-2 rounded-lg border border-amber-600/50 bg-amber-950/40 p-2 text-xs text-amber-100">
                            <summary className="cursor-pointer font-bold">GPS antenna status · {externalReceiver.connected ? 'Connected' : 'Not connected'} · {externalReceiver.lastFixAt && gpsStatusClock - Date.parse(externalReceiver.lastFixAt) < 30000 ? 'Fix received' : 'No current fix'}</summary>
                            <div className="mt-1">COM port: {externalReceiver.connected ? 'Open' : externalReceiver.connecting ? 'Connecting' : 'Not connected'} · Baud: {externalReceiver.baudRate || 4800}</div>
                            <div>Serial data: {externalReceiver.lastDataAt && gpsStatusClock - Date.parse(externalReceiver.lastDataAt) < 15000 ? 'Receiving bytes' : 'No recent data received'}</div>
                            <div>Satellite fix: {externalReceiver.lastFixAt && gpsStatusClock - Date.parse(externalReceiver.lastFixAt) < 30000 ? 'Received, but not yet usable for navigation' : 'No recent valid position'}</div>
                            {externalReceiver.satellites != null && <div>Satellites: {externalReceiver.satellites}</div>}
                            {externalReceiver.error && <div className="mt-1 font-bold text-amber-200">{externalReceiver.error}</div>}
                            <div className="mt-1 text-amber-200/80">{!externalReceiver.connected ? 'Select the GPS receiver again.' : !externalReceiver.lastDataAt || gpsStatusClock - Date.parse(externalReceiver.lastDataAt) >= 15000 ? 'Port is open but GPS data is silent. Check the selected COM port and baud rate in the GPS menu.' : 'Serial bytes are arriving. If a fix never appears, check satellite reception or the receiver NMEA protocol.'}</div>
                            <button type="button" onClick={recoverExternalReceiver} disabled={gpsRecovering} className="mt-2 rounded-md border border-cyan-500 bg-cyan-900 px-3 py-2 font-semibold text-white disabled:opacity-50">{gpsRecovering ? 'Connecting…' : 'Reconnect / Select Antenna'}</button>
                        </details>
                    )}
                    {addressSearchError && (
                        <div role="alert" className="mt-2 rounded-lg border border-amber-500/60 bg-amber-950/70 p-3 text-xs text-amber-100">{addressSearchError}</div>
                    )}
                    {!mapSelectedDestination && addressResults.length === 0 && recentDestinations.length > 0 && !addressQuery.trim() && <div className="pf-recent-destinations mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-600 bg-slate-950 p-3">
                        <h3 className="text-sm font-bold text-white">Recent destinations · this device</h3>
                        {recentDestinations.map(item => <button type="button" key={item.key} onClick={() => { setMapSelectedDestination(item); setAddressQuery(item.address || item.name); }} className="block min-h-11 w-full border-b border-slate-800 py-2 text-left text-sm text-white"><strong className="block">{item.name}</strong><span className="block text-xs text-slate-300">{item.address}</span><span className="text-xs text-slate-400">Last routed {new Date(item.visitedAt).toLocaleString()}</span></button>)}
                    </div>}
                    {mapSelectedDestination && (
                        <div className="pf-selected-destination mt-2 rounded-xl border border-emerald-500/50 bg-[#071b19]/95 p-3 shadow-lg">
                            <div className="flex items-start gap-2">
                                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] font-black uppercase tracking-wide text-emerald-300">{mapSelectedDestination.label || 'Selected Location'}</div>
                                    <div className="mt-1 text-sm font-bold text-white">{mapSelectedDestination.name}</div>{mapSelectedDestination.address !== mapSelectedDestination.name && <div className="mt-1 text-xs leading-relaxed text-slate-300">{mapSelectedDestination.address}</div>}
                                </div>
                            </div>

                            <button type="button" onClick={() => startNavigationToPoint(mapSelectedDestination)} disabled={routing}
                                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-black text-white hover:bg-blue-600 disabled:opacity-50">
                                <Navigation2 className="h-4 w-4" /> NAVIGATE HERE
                            </button>
                        </div>
                    )}
                    {(addressQuery.trim().length >= 3 || navigationFallbackAddress) && (
                        <button type="button" className="mt-2 rounded-lg border border-emerald-600/60 bg-emerald-950/90 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navigationFallbackAddress || addressQuery.trim())}&travelmode=driving`, '_blank', 'noopener,noreferrer')}>
                            Open driving directions in Google Maps
                        </button>
                    )}
                    {addressResults.length > 0 && (
                        <div className="pf-address-results relative z-[1220] mt-2 max-h-[55vh] overflow-y-auto rounded-xl border border-[#45637f] bg-[#07111f] shadow-[0_24px_70px_rgba(0,0,0,0.8)]">
                            <div className="border-b border-[#1e2d4a] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Select a destination · pins are shown on the map
                            </div>
                            {addressResults.map((result, index) => (
                                <button key={`${result.name}-${index}`} onClick={() => { setMapSelectedDestination(result); setAddressResults([]); }}
                                    className="flex w-full items-start gap-3 border-b border-[#1e2d4a] px-4 py-3 text-left hover:bg-[#142336] last:border-b-0">
                                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
                                    <span className="min-w-0 text-xs leading-relaxed text-slate-100"><span className="block font-bold">{result.name}</span><span className="block text-slate-400">{result.address}</span>{result.label && <span className="block text-cyan-300">{result.label}</span>}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ══ UNMAPPED CALLS PANEL ══ */}
            {unmappedCalls.length > 0 && (
                <div style={{ top: toolbarHeight }} className="absolute right-14 z-[1005] pointer-events-auto">
                    <button
                        onClick={() => setShowUnmapped(v => !v)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-900/80 border border-yellow-500/50 rounded-b-lg text-yellow-400 font-mono text-[10px] font-bold backdrop-blur-sm"
                    >
                        <AlertTriangle className="w-3 h-3" />
                        {unmappedCalls.length} UNMAPPED
                    </button>
                    <AnimatePresence>
                        {showUnmapped && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="w-72 bg-[#0a0e1a] border border-[#1e2d4a] rounded-b-lg shadow-xl overflow-hidden"
                            >
                                <div className="px-3 py-2 border-b border-[#1e2d4a] flex items-center justify-between bg-[#0d1220]">
                                    <span className="text-yellow-400 font-mono text-[10px] font-bold">Unmapped calls</span>
                                    <button
                                        onClick={() => autoGeocodeUnmapped(unmappedCalls)}
                                        disabled={isGeocoding}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded text-yellow-300 text-[9px] font-mono font-bold hover:bg-yellow-500/30 transition-all disabled:opacity-50"
                                    >
                                        <MapPin className="w-2.5 h-2.5" />
                                        {isGeocoding ? 'GEOCODING...' : 'GEOCODE ALL'}
                                    </button>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {unmappedCalls.map(call => (
                                        <div key={call.id} className="px-3 py-2 border-b border-[#0f1520] text-[10px] font-mono">
                                            <div className="text-white font-bold truncate">{call.incident}</div>
                                            <div className="text-slate-500 truncate">{call.location}</div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <MapToolDock actions={mapToolActions} panel={mapToolsPanel} onPanelChange={panel=>{
              setMapToolsPanel(panel); if(panel){setShowCallSidebar(false);setShowAddressSearch(false);setMapPickMode(false);}
            }} filters={jurisdictionFilters} onFiltersChange={changeMapIconFilters} top={toolbarHeight+12}/>

            {showCallSidebar && selectedCall && <MapCallPanel
              call={selectedCall} currentUser={currentUser} district={callDistrict}
              collapsed={callSidebarCollapsed} onCollapse={setCallSidebarCollapsed}
              onClose={()=>setShowCallSidebar(false)} top={toolbarHeight+12}
              onLocate={()=>{if(validPosition(selectedCall.latitude,selectedCall.longitude)){setMapCenter([Number(selectedCall.latitude),Number(selectedCall.longitude)]);setShowActiveCalls(true);}}}
              onNavigate={()=>{setShowCallSidebar(false);startInAppNavigation();}} routing={routing} assigning={assigning}
              onAssign={handleSelfAssign} onUnassign={handleSelfUnassign} onStreetView={openInAppStreetView}
              onExternalMap={()=>window.open('https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(validPosition(selectedCall.latitude,selectedCall.longitude)?selectedCall.latitude+','+selectedCall.longitude:selectedCall.location||'')+'&travelmode=driving','_blank','noopener,noreferrer')}
              unitLabel={getUnitNumberFromId}
            />}

            {streetViewUrl && (
                <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/75 p-3 sm:p-6" onClick={() => setStreetViewUrl('')}>
                    <div className="flex h-[min(88vh,760px)] w-[min(96vw,1100px)] flex-col overflow-hidden rounded-2xl border border-[#3b5570] bg-[#07111f] shadow-[0_30px_100px_rgba(0,0,0,.8)]" onClick={event => event.stopPropagation()}>
                        <div className="flex flex-none items-center gap-3 border-b border-[#263c52] bg-[#0d1725] px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-black tracking-[0.16em] text-white">Street view</div>
                                <div className="text-[10px] text-slate-500">Call location · In-app map view</div>
                            </div>
                            <button type="button" onClick={() => setStreetViewUrl('')} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#38516b] text-slate-300 hover:bg-[#17283b] hover:text-white" aria-label="Close Street View">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 bg-black">
                            <iframe title="Street View" src={streetViewUrl} className="h-full w-full border-0" allow="fullscreen" referrerPolicy="no-referrer-when-downgrade" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
    return mapFullscreen ? createPortal(mapContent, document.body) : mapContent;
}
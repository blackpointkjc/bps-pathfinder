import AddressCallHistory from '@/components/map/AddressCallHistory';
import { cadReference } from '@/lib/cadReference';
import PropertyCallLinkControl from '@/components/dispatch/PropertyCallLinkControl';
import { cadDestination } from '@/lib/cadNavigation';
import { incidentPriority } from '@/lib/incidentPriority';
import IncidentPrioritySelect from '@/components/dispatch/IncidentPrioritySelect';
import { canEditIncidentPriority } from '@/lib/dispatchPermissions';
import { comparePersonnel } from '@/utils/rankPolicy';
import { hasSupervisorAccess } from '@/lib/supervisorAccess';
import React, { useState, useEffect } from 'react';
import { base44, getBase44RequestHealth } from '@/api/base44Client';
import { toast } from 'sonner';
import { Shield, Radio, Map as MapIcon, Plus, Search, Clock3, MessageSquarePlus, AlertTriangle, History, Megaphone, Activity, Users, Wifi, Keyboard, Navigation, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { lookupDistrict } from '@/utils/districtLookup';
import { createPageUrl } from '../utils';
import { findPropertyMatch, monitoredPropertiesFromLocations, stopAllAlerts } from '@/utils/alertUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import NewCallAlert from '@/components/dispatch/NewCallAlert';
import { useNavigate } from 'react-router-dom';
import { MapContainer } from 'react-leaflet';
import ActiveCallMarkers from '@/components/map/ActiveCallMarkers';
import OtherUnitsLayer from '@/components/map/OtherUnitsLayer';
import CreateCallDialog from '@/components/dispatch/CreateCallDialog';
import CallHistory from './CallHistory';
import MessagingPanel from '@/components/dispatch/MessagingPanel';
import CadVoiceBroadcastButton from '@/components/dispatch/CadVoiceBroadcastButton';
import UnitAssignmentPanel from '@/components/dispatch/UnitAssignmentPanel';
import CADUnitStatusBoard from '@/components/dispatch/CADUnitStatusBoard';
import 'leaflet/dist/leaflet.css';
import { formatEasternDateTime, formatEasternTime, parseServerTimestamp } from '@/lib/easternTime';
import { findDirectoryUser, getAppDirectory, listDirectoryLocations } from '@/lib/appDirectory';
import { cleanIncident } from '@/utils/callUtils';
import { applyOfficerLocationEvent, getOfficerLocationSnapshot, subscribeOfficerLocationChanges } from '@/lib/officerLocationHub';
import PathfinderTileLayer, { MapThemeToggle, usePathfinderMapTheme } from '@/components/map/PathfinderTileLayer';
import DispatcherShiftReports from './DispatcherShiftReports';
import { withRequestTimeout } from '@/lib/requestTimeout';
import { clearActiveDispatchCallMemoryCache, loadActiveDispatchCallRows, readLastGoodCalls } from '@/lib/activeDispatchCalls';
import { applyDispatchCallEvent, subscribeDispatchCallChanges } from '@/lib/dispatchCallRealtime';

const DISPATCH_CALL_CACHE_KEY = 'bps-cad-active-calls-v4';

function readCachedDispatchCalls() { return readLastGoodCalls(); }

export default function DispatchCenter({embedded=false}) {
    const workstationRef=React.useRef(null);
    const statusBarRef=React.useRef(null);
    useEffect(()=>{
        if(embedded||!workstationRef.current)return;
        const host=workstationRef.current;
        const measure=()=>host.style.setProperty('--cad-standalone-height',`${Math.max(280,window.innerHeight-Math.max(0,host.getBoundingClientRect().top)-8)}px`);
        measure();window.addEventListener('resize',measure);
        return()=>window.removeEventListener('resize',measure);
    },[embedded]);
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [unitLoadStatus, setUnitLoadStatus] = useState('loading');
    const [activeCalls, setActiveCalls] = useState(() => readCachedDispatchCalls());
    const [callDistrict, setCallDistrict] = useState(null);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(activeCalls.length === 0);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPriorCalls, setShowPriorCalls] = useState(false);
    const [showDispatchLog, setShowDispatchLog] = useState(false);
    const [showMessaging, setShowMessaging] = useState(false);
    const [unreadDispatchMessages, setUnreadDispatchMessages] = useState(0);
    const [sortOrder, setSortOrder] = useState('desc');
    const [showMap, setShowMap] = useState(false);
    const [mobileView, setMobileView] = useState('calls');
    const [monitoredProperties, setMonitoredProperties] = useState([]);
    const [companyPropertyBoundaries,setCompanyPropertyBoundaries]=useState([]);
    const [persistedPropertyCallIds,setPersistedPropertyCallIds]=useState([]);
    const [pendingAlertCall, setPendingAlertCall] = useState(null);
    const [queueFilter, setQueueFilter] = useState('agency');
    const [supervisorWorking,setSupervisorWorking]=useState(false);
    const [statusWorking,setStatusWorking]=useState(false);
    const [dispatchFeedback,setDispatchFeedback]=useState('');
    const [cadAssignmentRows,setCadAssignmentRows]=useState([]);
    const [queueSearch, setQueueSearch] = useState('');
    const [callNotes, setCallNotes] = useState([]);
    const selectedNoteCallRef=React.useRef('');
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [systemTime, setSystemTime] = useState(() => new Date());
    const [welfareChecks, setWelfareChecks] = useState([]);
    const [welfareWorking, setWelfareWorking] = useState(false);
    const [mapTheme, setMapTheme] = usePathfinderMapTheme();

    const rankLastName = (name) => {
        const raw = String(name || '').trim();
        if (!raw) return 'Dispatch';
        const match = units.find(u => [u.full_name, u.email, u.username].filter(Boolean).some(v => String(v).toLowerCase() === raw.toLowerCase()));
        if (!match) {
            if(raw==='Dispatch'||raw==='CAD')return raw;
            if(/^(Colonel|Lt Colonel|Lieutenant Colonel|Major|Captain|Lieutenant|Sergeant|Sgt|Corporal|Officer)\s+/i.test(raw))return raw;
            return raw.includes('@')?'Dispatch':`Officer ${raw.split(/\s+/).pop()}`;
        }
        const last = String(match.last_name || match.full_name || '').trim().split(/\s+/).pop();
        const rank = String(match.rank || match.title || '').trim();
        return [rank||'Officer', last].filter(Boolean).join(' ') || 'Officer';
    };
    const knownCallIdsRef = React.useRef(null);
    const activeCallsLoadingRef = React.useRef(false);
    const lastActiveCallsLoadRef = React.useRef(0);

    useEffect(() => {
        const clockInterval = setInterval(() => setSystemTime(new Date()), 1000);
        return () => clearInterval(clockInterval);
    }, []);

    useEffect(() => {
        const handleKeyboardShortcuts = (event) => {
            const tag = event.target?.tagName?.toLowerCase();
            const isTyping = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable;
            if (isTyping) return;
            if (event.key === '/') {
                event.preventDefault();
                document.getElementById('cad-queue-search')?.focus();
            }
            if (event.key.toLowerCase() === 'n') setShowCreateDialog(true);
            if (event.key.toLowerCase() === 'm') setShowMap(value => !value);
            if (event.key === 'Escape') {
                setShowMap(false);
                setSelectedCall(null);
                setShowMessaging(false);
                setShowDispatchLog(false);
            }
        };
        window.addEventListener('keydown', handleKeyboardShortcuts);
        return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
    }, []);

    useEffect(() => {
        init();
        loadMonitoredProperties();

        // GRAC ingestion is owned by the scheduled backend automation plus guarded visible-screen sync.
        // Dispatch Center reads persisted calls and reacts to realtime entity changes.
        const unsubscribeCalls = subscribeDispatchCallChanges(event => {
            if (!event?.data && event?.type !== 'delete') {
                loadActiveCalls();
                return;
            }
            setActiveCalls(current => {
                const next = applyDispatchCallEvent(current, event, { hideClosed: true, limit: 200 });
                try {
                    window.localStorage.setItem(DISPATCH_CALL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), calls: next }));
                } catch {}
                return next;
            });
            // The detail/assignment pane must track the same live call record.
            // Previously it held the object selected minutes ago, so newly
            // assigned units still displayed as "Assigned Units (0)".
            setSelectedCall(current => {
                if (!current) return current;
                const eventId = String(event?.id || event?.data?.id || '');
                if (String(current.id) !== eventId) return current;
                return String(event.type).toLowerCase() === 'delete' ? null : { ...current, ...(event.data || {}) };
            });
            lastActiveCallsLoadRef.current = Date.now();
        });
        const scheduleUnitRefresh = (event) => {
            // ActiveOfficer realtime carries the changed unit row. Paint it directly
            // and do not immediately follow the event with another getOnDutyUnits
            // network request; that duplicate read was a major source of 429s.
            setUnits(current => applyOfficerLocationEvent(current, event)
                .filter(unit => unit?.id && (unit.email || unit.officer_email))
                .map(unit => ({
                    ...unit,
                    email: unit.email || unit.officer_email,
                    label: unit.unit_number ? `Unit ${unit.unit_number}` : rankLastName(unit.full_name || unit.officer_name || unit.officer_email),
                }))
                .sort(comparePersonnel));
        };
        const unsubscribeUnits = subscribeOfficerLocationChanges(scheduleUnitRefresh);
        const localInterval = setInterval(async () => {
            if (document.visibilityState !== 'visible') return;
            // App-wide CadSourceSyncMonitor owns upstream ingestion. This screen
            // only refreshes persisted calls; running ingestion here duplicates
            // expensive backend work and causes 429s across every workspace.
            clearActiveDispatchCallMemoryCache();
            lastActiveCallsLoadRef.current = 0;
            loadActiveCalls(true);
        }, 20000);

        // Visible Dispatch Center screens share the guarded upstream sync lock.
        // Repaint immediately after persisted writes complete so the queue does
        // not wait for a slow fallback timer.
        const onCadIngestFinished = () => {
            clearActiveDispatchCallMemoryCache();
            lastActiveCallsLoadRef.current = 0;
            void loadActiveCalls(true);
        };
        window.addEventListener('bps-cad-ingest-finished', onCadIngestFinished);

        const unitsInterval = setInterval(() => {
            if (document.visibilityState === 'visible') loadUnits();
        }, 2 * 60 * 1000);
        const secondaryInterval = setInterval(loadMonitoredProperties, 5 * 60 * 1000);
        const onStatusChanged = (event) => {
            const detail = event?.detail || {};
            if (detail.email && detail.status) {
                setUnits(current => current
                    .map(unit => String(unit.email || unit.officer_email || '').toLowerCase() === String(detail.email).toLowerCase()
                        ? { ...unit, status: detail.status, last_updated: detail.last_updated || new Date().toISOString() }
                        : unit)
                    .filter(unit => unit?.id && (unit.email || unit.officer_email)));
            }
            // Realtime status event already updated the visible row. The two-minute
            // fallback reconciliation below will recover any missed related fields.
        };
        let wakeRefreshTimer;
        const onOperationalResume = () => {
            window.clearTimeout(wakeRefreshTimer);
            wakeRefreshTimer = window.setTimeout(() => {
                lastActiveCallsLoadRef.current = 0;
                loadActiveCalls(true);
                loadUnits();
            }, 300);
        };
        window.addEventListener('bps-officer-status-changed', onStatusChanged);
        window.addEventListener('bps-operational-resume', onOperationalResume);
        window.addEventListener('online', onOperationalResume);
        window.addEventListener('pageshow', onOperationalResume);

        return () => {
            unsubscribeCalls?.();
            unsubscribeUnits?.();
            window.clearTimeout(wakeRefreshTimer);
            clearInterval(localInterval);
            window.removeEventListener('bps-cad-ingest-finished', onCadIngestFinished);
            clearInterval(unitsInterval);
            clearInterval(secondaryInterval);
            window.removeEventListener('bps-officer-status-changed', onStatusChanged);
            window.removeEventListener('bps-operational-resume', onOperationalResume);
            window.removeEventListener('online', onOperationalResume);
            window.removeEventListener('pageshow', onOperationalResume);
        };
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return undefined;
        let active = true;
        const loadUnreadDispatchMessages = async () => {
            try {
                const records = await base44.entities.Message.filter({ recipient_id: 'dispatch', read: false }, '-created_date', 200);
                if (!active) return;
                const unread = (records || []).filter(message => message.teams_message_id && !message.draft && String(message.message || '').trim());
                setUnreadDispatchMessages(unread.length);
            } catch {
                if (active) setUnreadDispatchMessages(0);
            }
        };
        loadUnreadDispatchMessages();
        const unsubscribe = base44.entities.Message.subscribe(() => loadUnreadDispatchMessages());
        window.addEventListener('bps-unread-refresh', loadUnreadDispatchMessages);
        return () => {
            active = false;
            unsubscribe?.();
            window.removeEventListener('bps-unread-refresh', loadUnreadDispatchMessages);
        };
    }, [currentUser?.id]);

    const loadMonitoredProperties = async () => {
        try {
            const locations = await listDirectoryLocations('site_name');
            setMonitoredProperties(monitoredPropertiesFromLocations(locations || []));
            // Property queue filters must work for ALL active contracted sites,
            // not only sites which opted into automated property alerts.
            const everyActiveSite=(locations||[]).filter(row=>row.active!==false).map(row=>({
                ...row,property_monitoring_enabled:true,
                property_monitoring_polygon:Array.isArray(row.property_monitoring_polygon)&&row.property_monitoring_polygon.length>=3?row.property_monitoring_polygon:(row.geofence_polygon||[]),
                property_monitoring_radius_meters:Number(row.property_monitoring_radius_meters||row.geofence_radius_meters||100),
            }));
            setCompanyPropertyBoundaries(monitoredPropertiesFromLocations(everyActiveSite));
            // Prior persisted property links count even when agency GPS has no coordinates.
            try {
              const recentAlerts=await base44.entities.PropertyAlert.list('-created_date',450);
              setPersistedPropertyCallIds([...new Set((recentAlerts||[]).map(a=>String(a.callId||'')).filter(Boolean))]);
            } catch(error){console.warn('Property-alert link refresh unavailable',error?.message);}

        } catch (error) {
            console.error('Error loading monitored properties:', error);
        }
    };

    const init = async () => {
        try {
            const user = await withRequestTimeout(base44.auth.me(), 12000, 'Dispatch authentication');
            setCurrentUser(user);
            
            // Check every supported dispatch/CAD access path consistently.
            const roles = new Set((user.additional_roles || []).map(role => String(role).trim().toLowerCase()));
            const hasDispatchAccess = user.role === 'admin'
                || String(user.role || '').trim().toLowerCase() === 'dispatch'
                || user.dispatch_role === true
                || roles.has('dispatch')
                || roles.has('cad_access')
                || hasSupervisorAccess(user)
                || roles.has('full_access');
            
            if (!hasDispatchAccess) {
                toast.error('Unauthorized - Dispatch access required');
                navigate(createPageUrl('CommandDashboard'));
                return;
            }

            // Active calls are the first-render payload. Paint the queue before
            // starting the heavier live-unit snapshot so GPS/roster latency can
            // never hold Dispatch Center behind its full-page spinner.
            // Start unit discovery without waiting for the call-feed network request.
            // A slow or failed CAD feed must not leave assignment stuck on Loading units.
            void loadUnits();
            await loadActiveCalls(true);
            setLoading(false);
        } catch (error) {
            console.error('Error initializing:', error);
            toast.error('Failed to load dispatch center');
        } finally {
            setLoading(false);
        }
    };

    const loadUnits = async (force = false) => {
        setUnitLoadStatus(current => current === 'ready' && !force ? 'ready' : 'loading');
        try {
            // Dispatch actions must use the user-backed canonical roster. The
            // lightweight location-only feed is appropriate for maps, but its row ID
            // is an ActiveOfficer session ID; CallAssignment and the officer queue
            // require the immutable User id. The full snapshot returns live status,
            // GPS, profile fields, and user IDs together.
            const [payload, directorySnapshot] = await Promise.all([
                getOfficerLocationSnapshot({ force }),
                getAppDirectory().catch(() => null),
            ]);
            const roster = [...(payload.units || payload.users || [])];
            const ids = new Set(roster.map(row => String(row.user_id || row.id)));
            for (const person of directorySnapshot?.users || []) {
                const operational = Array.isArray(person.additional_roles) && person.additional_roles.includes('officer');
                if (!operational || !person.id || !person.email || ids.has(String(person.id)) || roster.some(row => String(row.email || row.officer_email || '').toLowerCase() === String(person.email).toLowerCase())) continue;
                roster.push({ ...person, session_active: false, presence_online: false, connection_stale: true, roster_source: 'directory_fallback', status: person.status || 'Status unconfirmed' });
            }
            const eligibleUnits = roster
                .filter(unit => unit?.id && unit.status)
                .map(unit => ({
                    ...unit,
                    email: unit.email || unit.officer_email,
                    label: unit.unit_number ? `Unit ${unit.unit_number}` : rankLastName(unit.full_name || unit.officer_name || unit.officer_email),
                }))
                .sort(comparePersonnel);
            setUnits(eligibleUnits);
            setUnitLoadStatus('ready');
        } catch (error) {
            console.error('Error loading canonical CAD units:', error);
            // If the expensive full roster times out, recover using one live
            // ActiveOfficer read and the shared cached directory. Join against
            // immutable User IDs: session IDs must never be sent to assignment.
            // During a real 429 cooldown, do not make extra fallback requests.
            if (!getBase44RequestHealth().rateLimitedUntil) {
                try {
                    const [live, directory] = await Promise.all([
                        getOfficerLocationSnapshot({ locationOnly: true }),
                        getAppDirectory(),
                    ]);
                    const recovered = (live.units || []).map(session => {
                        const user = findDirectoryUser(directory.users || [], session.officer_email || session.email);
                        if (!user?.id) return null;
                        return {
                            ...user, ...session, id: user.id, user_id: user.id,
                            active_officer_id: session.id,
                            email: user.email,
                            officer_email: user.email,
                            additional_roles: user.additional_roles || [],
                            rank: user.rank || session.rank || '',
                            last_name: user.last_name || session.last_name || '',
                            full_name: user.full_name || session.officer_name || '',
                            session_active: session.session_active === true,
                            status: session.status || user.status || 'Status pending',
                            label: session.unit_number || user.unit_number ? `Unit ${session.unit_number || user.unit_number}` : [user.rank||'Officer',user.last_name||String(user.full_name||'').split(/\s+/).pop()].filter(Boolean).join(' '),
                        };
                    }).filter(unit => unit?.id && unit.email);
                    if (recovered.length || !(live.units || []).some(session => session.session_active && session.status !== 'Out of Service')) {
                        setUnits(recovered);
                        setUnitLoadStatus('ready');
                        return;
                    }
                } catch (fallbackError) {
                    console.warn('Dispatch lightweight unit-roster fallback failed:', fallbackError);
                }
            }
            setUnitLoadStatus('error');
            // Preserve any previously confirmed roster instead of turning an
            // API failure into a false report that there are zero field units.
        }
    };

    const loadActiveCalls = async (force = false) => {
       const now = Date.now();
       if (activeCallsLoadingRef.current || (!force && now - lastActiveCallsLoadRef.current < 3000)) return;
       activeCallsLoadingRef.current = true;
       try {
            let calls = await loadActiveDispatchCallRows(100);
            // Source ingestion is owned by one guarded timer, not triggered by
            // each feed reader; simultaneous retries previously competed for locks.

            // Show one stable row per upstream call. Prefer the record that already has a B-series CAD number.
            const uniqueCalls = new Map();
            for (const call of calls || []) {
                const descriptionKey = String(call.description || '').match(/\[GRAC:([^\]]+)\]/)?.[1];
                const key = call.external_call_id || descriptionKey || call.id;
                const current = uniqueCalls.get(key);
                const currentHasIdentifier = Boolean(current?.agency_cad_number || current?.bps_reference || current?.call_id);
                const candidateHasIdentifier = Boolean(call?.agency_cad_number || call?.bps_reference || call?.call_id);
                const currentHasOfficialCad = Boolean(current?.official_cad_verified && (current?.agency_cad_number || current?.call_id));
                const candidateHasOfficialCad = Boolean(call?.official_cad_verified && (call?.agency_cad_number || call?.call_id));
                if (!current || (!currentHasIdentifier && candidateHasIdentifier) || (!currentHasOfficialCad && candidateHasOfficialCad)) uniqueCalls.set(key, call);
            }
            const recentCalls = [...uniqueCalls.values()].filter(call =>
                !['cleared','cancelled','canceled','closed','completed','resolved'].includes(String(call.status || '').toLowerCase()) && call.manual_dismissed !== true
            );

            recentCalls.sort((a, b) => {
                const timeA = parseServerTimestamp(a.time_received || a.created_date)?.getTime() || 0;
                const timeB = parseServerTimestamp(b.time_received || b.created_date)?.getTime() || 0;
                return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
            });

            // Detect new calls and play alert
            const currentIds = new Set(recentCalls.map(c => c.id));
            if (knownCallIdsRef.current === null) {
                // First load — just record IDs, don't alert
                knownCallIdsRef.current = currentIds;
            } else {
                const newCallIds = [...currentIds].filter(id => !knownCallIdsRef.current.has(id));
                if (newCallIds.length > 0) {
                    const newCall = recentCalls.find(c => newCallIds.includes(c.id));
                    const propertyMatch = newCall ? findPropertyMatch(newCall, monitoredProperties) : null;
                    if (propertyMatch) setPendingAlertCall(newCall);
                }
                knownCallIdsRef.current = currentIds;
            }

            console.log('📞 Dispatch active calls:', recentCalls.length);
            setActiveCalls(recentCalls);
            // Don't leave an incident assignable after it clears or leaves the live queue.
            setSelectedCall(current => current ? (recentCalls.find(call => call.id === current.id) || null) : null);
            try {
                window.localStorage.setItem(DISPATCH_CALL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), calls: recentCalls }));
            } catch {
                // Last-good cache is only a recovery aid; live Base44 data remains authoritative.
            }
            lastActiveCallsLoadRef.current = Date.now();
         } catch (error) {
             console.error('Error loading active calls:', error);
         } finally {
             activeCallsLoadingRef.current = false;
         }
    };

    const loadCallNotes = async (callId) => {
        if (!callId) {setCallNotes([]);return;}
        try {
            const response = await withRequestTimeout(base44.functions.invoke('sharedCadTimeline', {call_id:callId,action:'read'}),16000,'Shared CAD notes');
            const payload=response?.data||response||{};
            if(!payload.success)throw new Error(payload.error||'Shared call notes could not load');
            if(selectedNoteCallRef.current===String(callId))setCallNotes(Array.isArray(payload.notes)?payload.notes:[]);
        } catch(error) {
            console.warn('Unable to load shared call notes:',error);
            toast.error(error?.response?.data?.error||error?.message||'Shared CAD notes temporarily unavailable');
            // Preserve last known call notes. An API failure is not an empty log.
        }
    };

    const loadWelfareChecks = async (callId) => {
        if (!callId) return setWelfareChecks([]);
        try {
            const rows = await base44.entities.OfficerWelfareCheck.filter({ call_id: callId }, '-requested_at', 50);
            setWelfareChecks(rows || []);
        } catch {
            setWelfareChecks([]);
        }
    };

    const handleSelectCall = (call) => {
        setSelectedCall(call);
        selectedNoteCallRef.current=String(call?.id||'');
        setCallNotes([]);
        if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('detail');
        setCallDistrict(null);
        loadCallNotes(call?.id);
        loadWelfareChecks(call?.id);
        if (call?.latitude && call?.longitude) {
            lookupDistrict(call.latitude, call.longitude).then(d => setCallDistrict(d));
        }
    };

    // Keep the selected call's shared note stream live. Field officers and dispatch
    // write to the same CallNote entity, so either side sees the other's update
    // without reselecting or refreshing the call.
    useEffect(() => {
        if (!selectedCall?.id) return undefined;
        const refreshNotes = () => loadCallNotes(selectedCall.id);
        const refreshWelfare = () => loadWelfareChecks(selectedCall.id);
        let unsubscribe;
        let welfareUnsubscribe;
        let statusUnsubscribe;
        try {
            unsubscribe = base44.entities.CallNote.subscribe(event => {
                if (String(event?.data?.call_id || '') === String(selectedCall.id)) refreshNotes();
            });
            statusUnsubscribe=base44.entities.CallStatusLog.subscribe(event=>{
                if(String(event?.data?.call_id||'')===String(selectedCall.id))refreshNotes();
            });
        } catch { /* polling below is fallback */ }
        try {
            welfareUnsubscribe = base44.entities.OfficerWelfareCheck.subscribe(event => {
                if (String(event?.data?.call_id || '') === String(selectedCall.id)) refreshWelfare();
            });
        } catch { /* polling below is fallback */ }
        const timer = setInterval(() => {if(document.visibilityState==='visible'){refreshNotes();refreshWelfare();}}, 20000);
        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
            if (typeof statusUnsubscribe === 'function') statusUnsubscribe();
            if (typeof welfareUnsubscribe === 'function') welfareUnsubscribe();
            clearInterval(timer);
        };
    }, [selectedCall?.id]);

    const updateCallStatus = async (newStatus) => {
        if (!selectedCall || selectedCall.status === newStatus || statusWorking) return;
        setStatusWorking(true); setDispatchFeedback('Updating Call Status…');
        try {
            const result = await base44.functions.invoke('updateCadCallStatus', {
                call_id: selectedCall.id,
                status: newStatus,
            });
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);
            setDispatchFeedback(`Call Updated: ${newStatus}`); setSelectedCall(previous=>previous?{...previous,status:newStatus}:previous);
            toast.success(`Call marked ${newStatus}`);
            if (['Cleared', 'Cancelled'].includes(newStatus)) setSelectedCall(null);
            clearActiveDispatchCallMemoryCache();lastActiveCallsLoadRef.current=0;
            await loadActiveCalls(true);
        } catch (error) {
            console.error('Status update failed:', error);
            setDispatchFeedback(error?.response?.data?.error||error?.message||'Unable To Update Call Status');
            toast.error(error?.response?.data?.error||error?.message||'Unable to update call status');
        } finally {setStatusWorking(false);}
    };

    const requestWelfareForSelectedCall = async () => {
        if (!selectedCall?.id || welfareWorking) return;
        setWelfareWorking(true);
        try {
            const response = await base44.functions.invoke('manageOfficerWelfare', { action:'request', call_id:selectedCall.id });
            const payload = response?.data || response || {};
            if (payload.error) throw new Error(payload.error);
            toast.success(`${payload.checks?.length || 0} welfare check${payload.checks?.length === 1 ? '' : 's'} active for assigned officer(s).`);
            await loadWelfareChecks(selectedCall.id);
        } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'Unable to request welfare check');
        } finally {
            setWelfareWorking(false);
        }
    };

    const markWelfareCheckedIn = async (check) => {
        if (!check?.id || welfareWorking) return;
        setWelfareWorking(true);
        try {
            const response = await base44.functions.invoke('manageOfficerWelfare', {
                action: 'ok',
                check_id: check.id,
                note: 'Dispatch confirmed officer welfare by radio.',
            });
            const payload = response?.data || response || {};
            if (payload.error) throw new Error(payload.error);
            toast.success(`${check.officer_display_name || 'Officer'} checked in by radio.`);
            await loadWelfareChecks(selectedCall?.id);
        } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'Unable to record welfare check-in');
        } finally {
            setWelfareWorking(false);
        }
    };

    const requestSupervisorForSelectedCall = async () => {
        if (!selectedCall?.id || supervisorWorking) return;
        setSupervisorWorking(true);setDispatchFeedback('Requesting Supervisor…');
        try {
            const response = await base44.functions.invoke('requestSupervisorAssist', { call_id: selectedCall.id });
            const payload = response?.data || response || {};
            if (payload.error) throw new Error(payload.error);
            setDispatchFeedback(payload.assigned ? `${payload.supervisor?.name||'Supervisor'} Assigned To Call` : payload.reason || 'Supervisor Request Recorded');
            if (payload.pending || payload.request_recorded) {
                toast.success(payload.reason || 'Supervisor request recorded and awaiting an eligible supervisor.');
                await loadCallNotes(selectedCall.id);
            } else if (!payload.assigned) toast.warning(payload.reason || 'No eligible supervisor is available right now.');
            else {
                toast.success(`${payload.supervisor?.name || 'Supervisor'} assigned as closest available supervisor.`);
                await loadCallNotes(selectedCall.id);
                await loadActiveCalls();
            }
        } catch (error) {
            setDispatchFeedback(error?.response?.data?.error || error?.message || 'Unable To Request Supervisor');
            toast.error(error?.response?.data?.error || error?.message || 'Unable to request supervisor');
        } finally {setSupervisorWorking(false);}
    };

    const addCallNote = async () => {
        const text=noteText.trim(),callId=selectedCall?.id;
        if (!callId || !text || savingNote) return;
        setSavingNote(true);
        try {
            const response=await withRequestTimeout(base44.functions.invoke('sharedCadTimeline',{action:'post',call_id:callId,note:text}),16000,'Post CAD note');
            const payload=response?.data||response||{};
            if(!payload.success)throw new Error(payload.error||'The CAD server did not save this note');
            setNoteText('');
            if(selectedNoteCallRef.current===String(callId))setCallNotes(current=>[...current,{...payload.note,kind:'note',created_date:payload.note?.created_date||new Date().toISOString()}]);
            void loadCallNotes(callId);
            toast.success('Shared CAD note saved for dispatch and all assigned units.');
        } catch(error) {
            console.error('Shared CAD note creation failed:',error);
            toast.error(error?.response?.data?.error||error?.message||'CAD note could not be saved. Retry; your text was retained.');
        } finally {setSavingNote(false);}
    };

    const handleCallCreated = async (createdCall) => {
        if (!createdCall?.id) return;
        // Show the saved call immediately instead of waiting on a full CAD reload.
        setActiveCalls(current => {
            const without = (current || []).filter(call => String(call.id) !== String(createdCall.id));
            return [createdCall, ...without];
        });
        setShowCreateDialog(false);
        toast.success('Call created and dispatched');
        // Reconcile quietly in the background after the modal has closed.
        loadActiveCalls().catch(() => null);
    };

    // Dispatch progress filters aggregate verified responder assignments, NOT
    // the individual officer queue status or the upstream agency's call state.
    useEffect(()=>{
        let live=true,timer;
        const reconcile=async()=>{
            try{
                const rows=await base44.entities.CallAssignment.list('-assigned_at',500);
                if(live)setCadAssignmentRows(Array.isArray(rows)?rows:[]);
            }catch(error){console.warn('CAD assignment filter snapshot unavailable:',error?.message);}
        };
        reconcile();
        const update=()=>{clearTimeout(timer);timer=setTimeout(reconcile,800);};
        let unsub;
        try{unsub=base44.entities.CallAssignment.subscribe(update);}catch{}
        const fallback=setInterval(()=>{if(document.visibilityState==='visible')reconcile();},45000);
        return()=>{live=false;clearTimeout(timer);clearInterval(fallback);unsub?.();};
    },[]);
    const propertyCallProgress=call=>{
        const active=cadAssignmentRows.filter(row=>String(row.call_id)===String(call.id)&&!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()));
        if(active.some(row=>String(row.status||'').toLowerCase()==='on_scene'))return 'On Scene';
        if(active.some(row=>['enroute','en_route'].includes(String(row.status||'').toLowerCase())))return 'Enroute';
        if(active.length||(call.assigned_units||[]).length)return 'Dispatched';
        return String(call.status||'New');
    };

    // Re-sort calls when sortOrder changes
    useEffect(() => {
        const sorted = [...activeCalls].sort((a, b) => {
            const timeA = parseServerTimestamp(a.time_received || a.created_date)?.getTime() || 0;
            const timeB = parseServerTimestamp(b.time_received || b.created_date)?.getTime() || 0;
            return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });
        setActiveCalls(sorted);
    }, [sortOrder]);

    const handleUpdate = async () => {
        // Force a fresh read; the ordinary 30-second throttle previously made
        // assignment confirmation reuse the old detail-pane object.
        clearActiveDispatchCallMemoryCache();
        lastActiveCallsLoadRef.current = 0;
        await Promise.all([loadActiveCalls(true), loadUnits()]);
    };

    const priorityBg = (priority) => {
        if (priority === 'critical') return 'bg-red-700 text-white';
        if (priority === 'high') return 'bg-orange-600 text-white';
        if (priority === 'medium') return 'bg-yellow-600 text-black';
        return 'bg-slate-600 text-slate-200';
    };

    const isPulsePointCall = (call) => String(call?.source_channel || call?.external_call_id || call?.source || '').toLowerCase().includes('pulsepoint');
    const pulsePointCalls = activeCalls.filter(isPulsePointCall);

    const propertyAlertCalls=activeCalls.filter(call =>
        Boolean(call.property_alert_id||call.property_id||call.matched_property_id||call.property_name||call.property_site)
        ||persistedPropertyCallIds.includes(String(call.id))
        ||Boolean(findPropertyMatch(call,companyPropertyBoundaries)));
    const propertyCallIds=new Set(propertyAlertCalls.map(call=>String(call.id)));
    const matchesQueue = (call,filter) => {
        if (filter==='agency') return true;
        if (!propertyCallIds.has(String(call.id))) return false;
        const activeAssignments=cadAssignmentRows.filter(row=>String(row.call_id)===String(call.id)&&!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()));
        if(filter==='all')return true;
        if(filter==='unassigned')return !call.assigned_units?.length&&!activeAssignments.length;
        if(filter==='priority')return ['critical','high'].includes(incidentPriority(call));
        const normalize=value=>String(value||'').toLowerCase().replace(/[ _-]/g,'');
        return normalize(propertyCallProgress(call))===normalize(filter);
    };
    const allCalls=activeCalls.filter(call=>matchesQueue(call,queueFilter)&&[call.call_id,call.bps_reference,call.agency_cad_number,call.incident,call.location,call.caller_name].filter(Boolean).join(' ').toLowerCase().includes(queueSearch.toLowerCase()));

    const statusUnits = units.filter(unit => Boolean(unit.status));
    const availableUnits = statusUnits.filter(unit => unit.status === 'Available');
    const activeUnits = statusUnits.filter(unit => unit.status !== 'Out of Service');
    const unassignedCalls = propertyAlertCalls.filter(call => !call.assigned_units?.length);
    const priorityCalls = propertyAlertCalls.filter(call => ['critical', 'high'].includes(incidentPriority(call)));
    // "Old/wait" time is a Pathfinder property-monitoring metric only. General
    // GRAC/agency calls must never make this timer old or red.
    const callAgeMinutes = (call) => Math.max(0, Math.floor((systemTime.getTime() - (parseServerTimestamp(call.time_received || call.created_date)?.getTime() || systemTime.getTime())) / 60000));
    const oldestPropertyCallMinutes = propertyAlertCalls.length
        ? Math.max(...propertyAlertCalls.map(callAgeMinutes))
        : 0;

    const handleAcknowledge = () => {
        stopAllAlerts();
        setPendingAlertCall(null);
    };



    return (
        <div ref={workstationRef} className={"bps-command-page cad-command-workstation relative flex h-full min-h-0 flex-col overflow-hidden bg-[#060b12] font-mono text-white "+(!embedded?' cad-dispatch-standalone':'')}>
            <NewCallAlert call={pendingAlertCall} onAcknowledge={handleAcknowledge} />

            {/* ══ TOP SYSTEM BAR ══ */}
            <div className="flex min-h-12 flex-none flex-wrap items-center gap-2 border-b border-cyan-950/80 bg-gradient-to-r from-[#08111d] via-[#0b1725] to-[#08111d] px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,.28)] md:flex-nowrap md:gap-3 md:px-4">
                <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#f5a623]" />
                    <div className="min-w-0">
                        <h1 className="text-sm font-bold leading-snug text-white">BPS / dispatch control</h1>
                        <p className="mt-0.5 text-[10px] leading-snug text-slate-300">BPS CAD · Computer-Aided Dispatch</p>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-1" />
                    <span className="text-cyan-200 text-[10px]">{loading ? 'SYNCING' : 'CAD FEED'}</span>
                </div>
                <div className="flex-1" />
                <div className="dispatch-actions flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:h-9 [&_button]:shrink-0 [&_button]:whitespace-nowrap [&_button]:rounded-lg [&_button]:px-3 [&_button]:text-[10px] [&_button]:font-bold">
                    <button onClick={() => setShowCreateDialog(true)}
                        className="flex items-center gap-1 rounded-lg border border-blue-700 bg-[#163153] text-white hover:bg-blue-900">
                        <Plus className="w-3 h-3" /> NEW CALL
                    </button>

                    <button onClick={() => {
                        setShowMap(true);
                    }}
                        className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${showMap || mobileView === 'map' ? 'border-blue-500/40 bg-blue-900/20 text-blue-400' : 'border-slate-600 text-slate-500'}`}>
                        <MapIcon className="w-2.5 h-2.5" /> MAP
                    </button>
                    <button onClick={() => setShowPriorCalls(!showPriorCalls)}
                        className={`px-2 py-1 border rounded text-[10px] ${
                            showPriorCalls ? 'border-amber-500/40 text-amber-400' : 'border-slate-600 text-slate-400 hover:text-white'
                        }`}>
                        {showPriorCalls ? 'BACK TO ACTIVE' : 'CALL / PROPERTY HISTORY'}
                    </button>
                    <button onClick={() => setShowDispatchLog(true)} className="flex items-center gap-1 rounded border border-blue-600/60 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-950/40 hover:text-white"><ClipboardList className="h-2.5 w-2.5" /> DISPATCH LOG</button>
                    <button onClick={() => {
                        const params = new URLSearchParams({ new: '1' });
                        if (selectedCall?.id) {
                            params.set('call_id', selectedCall.id);
                            params.set('call_number', selectedCall.agency_cad_number || selectedCall.bps_reference || selectedCall.call_id || selectedCall.id);
                        }
                        navigate(cadDestination('BOLOAlerts',params));
                    }} className="flex items-center gap-1 px-2 py-1 border border-amber-600/60 text-amber-400 hover:text-white rounded text-[10px]"><Megaphone className="w-2.5 h-2.5" /> NEW BOLO</button>
                    <CadVoiceBroadcastButton user={currentUser} />
                    <button onClick={() => setShowMessaging(!showMessaging)}
                        className={`relative flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${showMessaging ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-200' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                        <MessageSquarePlus className="w-2.5 h-2.5" /> MSG
                        {unreadDispatchMessages > 0 && (
                            <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black leading-none text-white shadow-lg ring-2 ring-[#08111d]">
                                {unreadDispatchMessages > 99 ? '99+' : unreadDispatchMessages}
                            </span>
                        )}
                    </button>
                    {currentUser?.role === 'admin' && (
                        <button onClick={() => navigate(createPageUrl('AdminPortal'))}
                            className="flex items-center gap-1 px-2 py-1 border border-slate-600 text-slate-400 hover:text-white rounded text-[10px]">
                            <Shield className="w-2.5 h-2.5" /> ADMIN
                        </button>
                    )}
                    <OfficerDistressButton currentUser={currentUser} className="text-[10px]" />

                </div>
            </div>

            {showDispatchLog && (
                <section className="absolute inset-0 z-[130] flex min-h-0 flex-col overflow-hidden bg-[#060b12]" aria-label="Dispatcher Shift Log">
                    <div className="flex flex-none items-center gap-3 border-b border-blue-900/70 bg-[#08111d] px-4 py-3">
                        <ClipboardList className="h-4 w-4 text-blue-300" />
                        <div>
                            <div className="text-xs font-black tracking-[0.14em] text-white">Dispatcher shift log</div>
                            <div className="text-[9px] text-slate-500">Inner Dispatch Center workspace</div>
                        </div>
                        <button type="button" onClick={() => setShowDispatchLog(false)} className="ml-auto rounded border border-slate-600 px-3 py-2 text-[10px] font-black text-slate-200 hover:bg-slate-800">
                            BACK TO LIVE DISPATCH
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <DispatcherShiftReports embedded />
                    </div>
                </section>
            )}


            {/* ══ COMMAND STATUS STRIP ══ */}
            <div className="dispatch-kpis grid flex-none grid-cols-3 gap-2 border-b border-[#1e2d4a] bg-[#080d16] p-2 xl:grid-cols-6">
                {[
                    { label: 'ACTIVE CALLS', value: activeCalls.length, tone: 'text-cyan-300', icon: Activity },
                    { label: 'PULSEPOINT', value: pulsePointCalls.length, tone: pulsePointCalls.length ? 'text-red-300' : 'text-slate-300', icon: Radio },
                    { label: 'PROPERTY UNASSIGNED', value: unassignedCalls.length, tone: unassignedCalls.length ? 'text-amber-300' : 'text-slate-300', icon: AlertTriangle },
                    { label: 'PROPERTY PRIORITY', value: priorityCalls.length, tone: priorityCalls.length ? 'text-red-400' : 'text-slate-300', icon: Shield },
                    { label: 'UNITS ACTIVE', value: activeUnits.length, tone: 'text-blue-300', icon: Users },
                    { label: 'AVAILABLE', value: availableUnits.length, tone: 'text-emerald-300', icon: Navigation },
                    { label: 'PROPERTY OLDEST', value: propertyAlertCalls.length ? `${oldestPropertyCallMinutes}m` : '—', tone: oldestPropertyCallMinutes >= 15 ? 'text-red-400' : 'text-slate-300', icon: Clock3 },
                ].map(({ label, value, tone, icon: Icon }) => (
                    <div key={label} className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#26384c] bg-[#0d1420] px-2 py-2 text-center shadow-lg">
                        <Icon className={`hidden h-3 w-3 shrink-0 sm:block ${tone}`} />
                        <div className="min-w-0"><div className={`text-sm font-black leading-none ${tone}`}>{value}</div><div className="mt-0.5 truncate text-[7px] font-bold tracking-[0.1em] text-slate-500">{label}</div></div>
                    </div>
                ))}
            </div>

            <div className="flex-none border-b border-[#1e2d4a] bg-[#08111d] px-2 py-2 xl:hidden">
                <div className="cad-mobile-view-tabs flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1.5" aria-label="Dispatch mobile panels">
                    {[
                        ['calls','CALLS'], ['detail','DETAIL'], ['assignment','ASSIGN'], ['units','UNITS'], ['map','MAP']
                    ].map(([value,label]) => (
                        <button type="button" key={value} aria-pressed={value==='map'?showMap:mobileView===value} onClick={() => value==='map'?setShowMap(true):setMobileView(value)} className={`min-h-11 min-w-[76px] flex-1 shrink-0 rounded-lg border px-2 text-[10px] font-black tracking-wide ${(value==='map'?showMap:mobileView===value) ? 'border-blue-500 bg-blue-500/15 text-blue-200 shadow-[0_0_0_1px_rgba(59,130,246,.15)]' : 'border-slate-700 bg-[#0b1320] text-slate-300'}`}>{label}</button>
                    ))}
                </div>
            </div>

            {/* ══ QUEUE CONTROLS ══ */}
            <div className={`${mobileView === 'calls' ? 'flex' : 'hidden'} cad-queue-controls flex-none flex-wrap items-center gap-2 border-b border-[#1e2d4a] bg-[#0a0e1a] px-2 py-1.5 xl:flex xl:flex-wrap xl:px-3`}>
                <div className="relative w-full min-w-0 sm:w-auto sm:min-w-52 md:w-56">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input id="cad-queue-search" value={queueSearch} onChange={e => setQueueSearch(e.target.value)} placeholder="Search CAD, incident, address...  [/]"
                        className="w-full h-7 pl-7 pr-2 bg-[#111827] border border-[#263653] rounded text-[10px] text-white outline-none focus:border-blue-500" />
                </div>
                <div className="cad-queue-filter-strip flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-1" aria-label="Filter dispatch calls">
                    {[
                        ['all','PROPERTY CALLS'], ['unassigned','UNASSIGNED'], ['priority','PRIORITY'], ['New','NEW'], ['Dispatched','DISPATCHED'], ['Enroute','EN ROUTE'], ['On Scene','ON SCENE'], ['agency','ALL ACTIVE CALLS']
                    ].map(([value,label]) => (
                        <button type="button" key={value} aria-pressed={queueFilter===value} onClick={() => {setQueueFilter(value);setMobileView('calls');}} className={`shrink-0 whitespace-nowrap rounded border px-2.5 py-2 text-[10px] ${queueFilter === value ? 'border-blue-400 text-blue-300 bg-blue-500/10' : 'border-slate-700 text-slate-300 hover:text-white'}`}>{label} ({activeCalls.filter(call=>matchesQueue(call,value)).length})</button>
                    ))}
                </div>
                <div className="flex-1" />
                <span className="text-[10px] text-slate-500">SORT:</span>
                <button onClick={() => setSortOrder('desc')} className={`px-2 py-0.5 rounded text-[10px] border ${
                    sortOrder === 'desc' ? 'border-[#f5a623] text-[#f5a623] bg-[#f5a623]/10' : 'border-slate-700 text-slate-500'
                }`}>Newest</button>
                <button onClick={() => setSortOrder('asc')} className={`px-2 py-0.5 rounded text-[10px] border ${
                    sortOrder === 'asc' ? 'border-[#f5a623] text-[#f5a623] bg-[#f5a623]/10' : 'border-slate-700 text-slate-500'
                }`}>Oldest</button>
                <span className="ml-3 text-[10px] text-slate-500">SHOWING: <span className="text-white font-bold">{allCalls.length}</span> / {queueFilter==='agency'?activeCalls.length:propertyAlertCalls.length}</span>
            </div>

            {/* ══ MAIN GRID ══ */}
            {showPriorCalls ? (
                <div className="dispatch-prior-calls flex-1 overflow-auto p-3">
                    <CallHistory embedded />
                </div>
            ) : (
                <div className="dispatch-main flex-1 min-h-0 flex flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">

                    {/* ═══ LEFT: ACTIVE CALLS TABLE ═══ */}
                    <div className={`${mobileView === 'calls' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col border-b border-[#1e2d4a] xl:flex xl:min-h-0 xl:w-[320px] xl:flex-none xl:border-b-0 xl:border-r 2xl:w-[380px]`}> 
                        {/* Police Calls */}
                        <div className="flex-none px-3 py-1.5 bg-[#0d1220] border-b border-[#1e2d4a] flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
                            <span className="text-[10px] font-bold text-[#f5a623] tracking-widest">{queueFilter==='agency'?'All active calls':'Company property calls'}</span>
                            <span className="ml-auto text-[10px] bg-red-500/20 text-red-200 px-2 rounded-full border border-red-500/40">PP {pulsePointCalls.length}</span>
                            <span className="text-[10px] bg-[#f5a623]/20 text-[#f5a623] px-2 rounded-full border border-[#f5a623]/30">{allCalls.length}</span>
                        </div>
                        {/* Table header */}
                        <div className="dispatch-call-headings flex-none grid grid-cols-12 px-2 py-1 bg-[#111827] border-b border-[#1e2d4a] text-[9px] text-slate-500 uppercase">
                            <div className="col-span-2">PRI</div>
                            <div className="col-span-5">Incident</div>
                            <div className="col-span-5">TIME</div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {allCalls.length === 0 ? (
                                <div className="text-[10px] text-slate-500 text-center py-4">{loading ? 'Loading Current Calls…' : queueSearch ? 'No Calls Match This Search' : queueFilter==='agency' ? 'No Active Calls' : 'No Property Calls Match This Filter'}</div>
                            ) : allCalls.map(call => {
                                const pulsePoint = isPulsePointCall(call);
                                return (
                                <div key={call.id} role="button" tabIndex={0} aria-label={'Open incident '+(call.bps_reference||call.call_id||call.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();handleSelectCall(call);}}} onClick={() => handleSelectCall(call)}
                                    className={`dispatch-call-card group grid grid-cols-12 cursor-pointer border-b px-2 py-2.5 transition-all ${
                                        selectedCall?.id === call.id
                                            ? pulsePoint ? 'bg-red-950/70 border-l-2 border-l-red-400 border-red-700/70' : 'bg-[#1a3a5c] border-l-2 border-l-[#3b82f6] border-[#172536]'
                                            : pulsePoint ? 'border-red-900/70 bg-red-950/25 hover:bg-red-900/35' : 'border-[#172536] hover:bg-[#111827]'
                                    }`}>
                                    <div className="col-span-2">
                                        <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${priorityBg(incidentPriority(call))}`}>
                                            {{critical:'P1',high:'P2',medium:'P3',low:'P4'}[incidentPriority(call)]}
                                        </span>
                                    </div>
                                    <div className="col-span-5">
                                        <div className={`text-[9px] font-mono font-bold truncate ${pulsePoint ? 'text-red-200' : call.official_cad_verified ? 'text-[#7ec1ff]' : 'text-[#f5c451]'}`}>{pulsePoint ? 'PP' : (call.agency_cad_number || (call.official_cad_verified ? call.call_id : '') || call.bps_reference || call.call_id || 'ASSIGNING…')}</div>
                                        <div className="truncate text-[11px] font-bold leading-tight text-white group-hover:text-cyan-100">{cleanIncident(call)}</div>
                                        <div className="mt-1 truncate text-[9px] text-slate-400">{call.location}</div>
                                        {propertyCallIds.has(String(call.id))&&<div className="mt-1 text-[9px] font-bold text-cyan-300">PROPERTY STATUS: {propertyCallProgress(call).toUpperCase()}</div>}
                                        <div className={`mt-1 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-black tracking-wide ${pulsePoint ? 'border border-red-500/40 bg-red-500/20 text-red-100' : 'text-slate-600'}`}>
                                            {pulsePoint ? 'PULSEPOINT' : (call.agency || 'AGENCY N/A')}
                                        </div>
                                    </div>
                                    <div className="col-span-5 text-[9px] text-slate-400 text-right pr-1">
                                        <div>{formatEasternTime(call.time_received || call.created_date)}</div>
                                        {findPropertyMatch(call, monitoredProperties) ? (
                                            <div className={`mt-1 font-bold ${callAgeMinutes(call) >= 15 ? 'text-red-400' : 'text-slate-600'}`}>
                                                {callAgeMinutes(call)} MIN AGO · PROPERTY
                                            </div>
                                        ) : (
                                            <div className={`mt-1 font-bold ${pulsePoint ? 'text-red-200' : 'text-slate-700'}`}>{pulsePoint ? 'PULSEPOINT CALL' : 'AGENCY CALL'}</div>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>

                    </div>

                    {/* ═══ CENTER: MAP + CALL DETAIL ═══ */}
                    <div className={`${mobileView === 'detail' || mobileView === 'map' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 min-w-0 flex-col border-b border-[#1e2d4a] xl:flex xl:min-h-0 xl:border-b-0 xl:border-r`}> 
                        {/* Call Detail */}
                        <div className={`${mobileView === 'map' ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col border-b border-[#1e2d4a] xl:flex`}> 
                            {selectedCall ? (
                                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                                    <div className="px-3 md:px-4 py-2 bg-[#0d1220] border-b border-[#1e2d4a] flex flex-wrap items-center gap-2 md:gap-3">
                                        <span className="text-[#f5a623] font-bold text-xs">
                                            {isPulsePointCall(selectedCall) ? 'PP · '+(cadReference(selectedCall)||'Reference Pending') : selectedCall.official_cad_verified ? `AGENCY CAD #${selectedCall.agency_cad_number || selectedCall.call_id}` : `BPS REF ${selectedCall.bps_reference || selectedCall.call_id || 'ASSIGNING…'}`}
                                        </span>
                                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${priorityBg(incidentPriority(selectedCall))}`}>{incidentPriority(selectedCall).toUpperCase()}</span>
                                        {canEditIncidentPriority(currentUser) && <IncidentPrioritySelect call={selectedCall} priority={incidentPriority(selectedCall)} onSave={async(call,priority)=>{
                                            const response=await base44.functions.invoke('updateCadCallPriority',{call_id:call.id,priority});
                                            if(response?.data?.error)throw new Error(response.data.error);
                                            setActiveCalls(previous=>previous.map(row=>row.id===call.id?{...row,priority,priority_override:true}:row));
                                            setSelectedCall(previous=>previous?.id===call.id?{...previous,priority,priority_override:true}:previous);
                                        }}/>}
                                        <span className="text-[10px] text-slate-400">{selectedCall.status}</span>
                                        {isPulsePointCall(selectedCall) && <span className="rounded border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-[9px] font-black text-red-100">PulsePoint</span>}
                                        <span className="w-full md:w-auto md:ml-auto text-[9px] text-slate-500">
                                            RECV: {formatEasternDateTime(selectedCall.time_received || selectedCall.created_date)} ET
                                        </span>
                                    </div>
                                    <div className="px-3 md:px-4 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                                        <div><span className="text-slate-500">INCIDENT: </span><span className="text-white font-bold">{cleanIncident(selectedCall)}</span></div>
                                        <div><span className="text-slate-500">AGENCY: </span><span className="text-white">{selectedCall.agency || '—'}</span></div>
                                        <div><span className="text-slate-500">PRIORITY: </span><span className="text-white">{incidentPriority(selectedCall).toUpperCase()}</span></div>
                                        <div className="col-span-2"><span className="text-slate-500">LOCATION: </span><span className="text-white">{selectedCall.location}</span></div>
                                        {selectedCall.caller_name && <div><span className="text-slate-500">CALLER: </span><span className="text-white">{selectedCall.caller_name}</span></div>}
                                        {selectedCall.caller_phone && <div><span className="text-slate-500">PHONE: </span><span className="text-white">{selectedCall.caller_phone}</span></div>}
                                        <div><span className="text-slate-500">DISTRICT/PCT: </span><span className="text-white">{callDistrict !== null ? callDistrict : selectedCall.zone || '—'}</span></div>
                                    </div>
                                    <div className="px-4 pb-2"><AddressCallHistory address={selectedCall.location} excludeCallId={selectedCall.id} /></div>
                                    {selectedCall.hazards && (
                                        <div className="mx-4 mb-2 flex items-start gap-2 rounded border border-red-500/40 bg-red-950/40 p-2 text-[10px] text-red-200">
                                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-none" />
                                            <div><span className="font-bold">SAFETY ALERT: </span>{selectedCall.hazards}</div>
                                        </div>
                                    )}
                                    {selectedCall.description && (
                                        <div className="px-4 pb-2">
                                            <div className="text-[9px] text-slate-500 mb-1">Narrative</div>
                                            <div className="text-[10px] text-slate-300 bg-[#111827] rounded p-2 leading-relaxed">{selectedCall.description}</div>
                                        </div>
                                    )}
                                    <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[9px] text-slate-500 mr-1">Call status</span>
                                        {['New','Dispatched','Enroute','On Scene','Cleared'].map(status => (
                                            <button key={status} onClick={() => updateCallStatus(status)} disabled={statusWorking || selectedCall.status === status}
                                                className={`px-2 py-1 rounded border text-[9px] ${selectedCall.status === status ? 'border-blue-400 bg-blue-500/20 text-blue-200' : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white'}`}>
                                                {status.toUpperCase()}
                                            </button>
                                        ))}
                                        <button disabled={statusWorking} onClick={() => updateCallStatus('Cancelled')} className="px-2 py-1 rounded border border-red-700 text-[9px] text-red-400 hover:bg-red-950/50">Cancel</button>
                                        <button disabled={supervisorWorking} onClick={requestSupervisorForSelectedCall} className="px-2 py-1 rounded border border-purple-600 bg-purple-950/40 text-[9px] font-bold text-purple-200 hover:bg-purple-900/50">{supervisorWorking?'REQUESTING…':'REQUEST SUPERVISOR'}</button>{dispatchFeedback&&<p role="status" className="w-full rounded border border-cyan-700 p-2 text-xs text-cyan-200">{dispatchFeedback}</p>}
                                        <button onClick={requestWelfareForSelectedCall} disabled={welfareWorking} className="px-2 py-1 rounded border border-red-600 bg-red-950/40 text-[9px] font-bold text-red-200 hover:bg-red-900/50 disabled:opacity-50">{welfareWorking ? 'SENDING…' : 'WELFARE CHECK'}</button>
                                    </div>
                                    {welfareChecks.length > 0 && (
                                        <div className="px-4 pb-2">
                                            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500">
                                                <span>Officer welfare</span>
                                                <span className="text-cyan-300">Automatic check every 10 minutes</span>
                                            </div>
                                            <div className="space-y-1">
                                                {welfareChecks.slice(0,5).map(check => (
                                                    <div key={check.id} className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-[9px] ${check.status === 'pending' ? 'border-red-600/50 bg-red-950/30 text-red-200' : check.status === 'ok' ? 'border-emerald-600/40 bg-emerald-950/20 text-emerald-200' : 'border-amber-600/40 bg-amber-950/20 text-amber-200'}`}>
                                                        <span className="font-black">{check.officer_display_name || 'Officer'}</span>
                                                        <span>· {String(check.status || '').replaceAll('_',' ').toUpperCase()}</span>
                                                        {check.status === 'pending' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => markWelfareCheckedIn(check)}
                                                                disabled={welfareWorking}
                                                                className="ml-auto rounded border border-emerald-500/60 bg-emerald-950/50 px-2 py-1 font-black text-emerald-200 hover:bg-emerald-900/60 disabled:opacity-50"
                                                            >
                                                                RADIO CHECK-IN
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="px-3 md:px-4 pb-3 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
                                        <div>
                                            <div className="text-[9px] text-slate-400 mb-1 flex items-center gap-1"><History className="w-3 h-3" /> SHARED CAD TIMELINE · DISPATCH & ASSIGNED OFFICERS</div>
                                            <div className="bg-[#111827] border border-[#263653] rounded max-h-64 min-h-32 overflow-y-auto">
                                                {callNotes.length === 0 ? <div className="p-2 text-[9px] text-slate-600">No shared notes or verified CAD activity yet.</div> : callNotes.map(note => (
                                                    <div key={note.id} className="px-2 py-1.5 border-b border-[#1e2d4a] last:border-0 text-[9px]">
                                                        <div className="flex gap-2 text-slate-500"><span className="text-blue-300">{rankLastName(note.author_name)}</span><span>{formatEasternTime(note.created_date)} ET{note.kind==='activity'?' · CAD EVENT':''}</span></div>
                                                        <div className="text-slate-200 mt-0.5">{note.note}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <PropertyCallLinkControl call={selectedCall}/>
                                            <div className="text-[9px] text-slate-500 mb-1">Add dispatch note</div>
                                            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCallNote(); } }}
                                                placeholder="Type update, then Enter..." className="w-full h-16 resize-none bg-[#111827] border border-[#263653] rounded p-2 text-[10px] text-white outline-none focus:border-blue-500" />
                                            <button onClick={addCallNote} disabled={savingNote || !noteText.trim()} className="w-full mt-1 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded text-[9px] font-bold">
                                                {savingNote ? 'SAVING...' : 'POST TO CAD LOG'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-16 text-[10px] text-slate-600">
                                    SELECT A CALL TO VIEW DETAILS
                                </div>
                            )}
                        </div>


                    </div>

                    {/* ═══ RIGHT: UNITS / ASSIGNMENT ═══ */}
                    <div className={`${mobileView === 'assignment' || mobileView === 'units' ? 'flex' : 'hidden'} min-h-0 w-full flex-1 flex-col bg-[#08111b] xl:flex xl:w-[320px] xl:flex-none 2xl:w-[360px]`}>
                        {selectedCall && mobileView !== 'units' ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex flex-none items-center gap-2 border-b border-[#1e2d4a] bg-[#0d1220] px-3 py-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                    <span className="text-[10px] font-black tracking-[.16em] text-blue-300">Unit assignment</span>
                                    <span className="ml-auto rounded-md border border-blue-800/60 bg-blue-950/40 px-2 py-1 text-[8px] font-black text-blue-200">Call selected</span>
                                </div>
                                <div className="min-h-0 flex-1 p-3">
                                    <UnitAssignmentPanel call={selectedCall} calls={activeCalls} units={units} allAssignments={cadAssignmentRows} unitLoadStatus={unitLoadStatus} onRetryUnits={() => loadUnits(true)} onUpdate={handleUpdate} />
                                </div>
                            </div>
                        ) : mobileView === 'assignment' ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex flex-none items-center gap-2 border-b border-[#1e2d4a] bg-[#0d1220] px-3 py-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                    <span className="text-[10px] font-black tracking-[.16em] text-blue-300">Unit assignment</span>
                                </div>
                                <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                                    <div className="max-w-[260px] rounded-xl border border-dashed border-slate-700 bg-[#09121e] p-5 text-center text-xs text-slate-400">Select an active call, then return to Assignment to dispatch a unit.</div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <CADUnitStatusBoard units={statusUnits} compact currentUser={currentUser} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showMap && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm md:p-6" onClick={() => setShowMap(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Live tactical map" className="flex h-[calc(100dvh-24px)] w-[calc(100vw-16px)] max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-blue-800/60 bg-[#07101c] shadow-2xl md:h-[82dvh] md:w-[88vw]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 border-b border-[#1e2d4a] bg-[#0d1220] px-4 py-3">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            <span className="text-xs font-black tracking-widest text-emerald-300">Live tactical map</span>
                            <div className="ml-auto flex items-center gap-2"><MapThemeToggle theme={mapTheme} onChange={setMapTheme} /><button onClick={() => setShowMap(false)} className="rounded border border-slate-700 px-3 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800">CLOSE</button></div>
                        </div>
                        <div className="min-h-0 flex-1">
                            <MapContainer center={[37.5407, -77.4360]} zoom={11} className="h-full w-full" zoomControl={true}>
                                <PathfinderTileLayer theme={mapTheme} />
                                <ActiveCallMarkers calls={activeCalls} onCallClick={handleSelectCall} />
                                <OtherUnitsLayer units={units} currentUserId={null} />
                                <OfficerDistressMarker autoCenter={true} />
                            </MapContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ BOTTOM STATUS BAR — horizontal scroll keeps every metric accessible on phones ══ */}
            <div className="cad-bottom-status-wrap flex flex-none items-center border-t border-[#1e2d4a] bg-[#0d1220] text-[10px] text-slate-300">
                <button type="button" className="cad-status-scroll-button shrink-0 border-r border-[#26384c] px-2 text-cyan-200 lg:hidden" aria-label="Scroll CAD status left" onClick={() => statusBarRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ChevronLeft className="h-4 w-4" /></button>
                <div ref={statusBarRef} role="region" aria-label="CAD status bar — scroll horizontally for more information" tabIndex={0} className="cad-bottom-status min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
                    <div className="flex min-w-max items-center gap-4 whitespace-nowrap px-3 py-2">
                        <span className="flex shrink-0 items-center gap-1.5"><Wifi className="h-3 w-3 text-emerald-400" /> CAD NETWORK: <span className="font-bold text-emerald-400">Connected</span></span>
                        <span className="shrink-0">CALLS: <span className="text-white">{allCalls.length}</span></span>
                        <span className="shrink-0">UNITS ACTIVE: <span className="text-green-400">{activeUnits.length}</span></span>
                        <span className="shrink-0">UNASSIGNED: <span className="text-yellow-400">{allCalls.filter(c => !c.assigned_units?.length).length}</span></span>
                        <span className="hidden shrink-0 items-center gap-1 text-slate-400 md:flex lg:ml-auto"><Keyboard className="h-3 w-3" /> N NEW CALL · / SEARCH · M MAP · ESC CLEAR</span>
                        <span className="shrink-0 font-bold text-green-400">{systemTime.toLocaleTimeString('en-US', { hour12: false })} ET</span>
                    </div>
                </div>
                <button type="button" className="cad-status-scroll-button shrink-0 border-l border-[#26384c] px-2 text-cyan-200 lg:hidden" aria-label="Scroll CAD status right" onClick={() => statusBarRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ChevronRight className="h-4 w-4" /></button>
            </div>

            {/* Messaging Panel */}
            <MessagingPanel
                currentUser={currentUser}
                units={units}
                isOpen={showMessaging}
                onClose={() => setShowMessaging(false)}
            />

            {/* Create Call Dialog */}
            {showCreateDialog && (
                <CreateCallDialog
                    units={units}
                    currentUser={currentUser}
                    onClose={() => setShowCreateDialog(false)}
                    onCreated={handleCallCreated}
                />
            )}
        </div>
    );
}
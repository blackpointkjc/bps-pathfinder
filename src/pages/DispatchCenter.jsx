import GracFeedIndicator from '@/components/dispatch/cad/GracFeedIndicator';
import usePropertyAssignmentCalls from '@/hooks/usePropertyAssignmentCalls';
import {needsPropertyAssignment,assignedCadUnitIds,isVerifiedPropertyCall} from '@/lib/cadWorkspaceModel';
import CadCloneIncidentDialog from '@/components/dispatch/cad/CadCloneIncidentDialog';
import CadRecommendationList from '@/components/dispatch/cad/CadRecommendationList';
import '@/components/dispatch/cad/unified-cad-grid.css';
import {useAuth} from '@/lib/AuthContext';
import {canAccessDispatchCenter} from '@/lib/dispatchPermissions';
import {cadScaleValue,readCadDisplaySettings} from '@/lib/cadDisplaySettings';
import '@/components/dispatch/cad/dispatch-readable.css';
import '@/components/dispatch/cad-center-terminal.css';
import '@/components/dispatch/cad-workstations.css';
import '@/components/dispatch/tactical-console.css';
import TacticalCommandMap from '@/components/dispatch/TacticalCommandMap';
import AIRewriteField from '@/components/AIRewriteField';
import AddressCallHistory from '@/components/map/AddressCallHistory';
import PropertyCallLinkControl from '@/components/dispatch/PropertyCallLinkControl';
import { cadDestination } from '@/lib/cadNavigation';
import { incidentPriority,priorityCode } from '@/lib/incidentPriority';
import IncidentPrioritySelect from '@/components/dispatch/IncidentPrioritySelect';
import { canEditIncidentPriority } from '@/lib/dispatchPermissions';
import { comparePersonnel } from '@/utils/rankPolicy';
import React, { useState, useEffect } from 'react';
import { base44, getBase44RequestHealth, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { toast } from 'sonner';
import { Shield, Radio, Map as MapIcon, Plus, Search, MessageSquarePlus, AlertTriangle, History, Megaphone, Wifi, Keyboard, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { lookupDistrict } from '@/utils/districtLookup';
import { createPageUrl } from '../utils';
import { findPropertyMatch, monitoredPropertiesFromLocations, stopAllAlerts } from '@/utils/alertUtils';
import OfficerDistressButton from '@/components/dispatch/OfficerDistressButton';
import OfficerDistressMarker from '@/components/map/OfficerDistressMarker';
import NewCallAlert from '@/components/dispatch/NewCallAlert';
import { useNavigate,useLocation } from 'react-router-dom';
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
import TomTomSdkMapPreview from '@/components/map/LazyTomTomMap';
import DispatcherShiftReports from './DispatcherShiftReports';
import { withRequestTimeout } from '@/lib/requestTimeout';
import { clearActiveDispatchCallMemoryCache, loadActiveDispatchCallRows, readLastGoodCalls,dedupeOperationalCalls,saveLastGoodCalls,getActiveDispatchCallReadTime } from '@/lib/activeDispatchCalls';
import { applyDispatchCallEvent, subscribeDispatchCallChanges } from '@/lib/dispatchCallRealtime';


function readCachedDispatchCalls() { return readLastGoodCalls(); }

export default function DispatchCenter({embedded=false}) {
 const {user,isLoadingAuth}=useAuth();
 if(isLoadingAuth)return <div role="status" className="p-6 text-slate-200">Checking dispatch authorization…</div>;
 if(!canAccessDispatchCenter(user))return <section className="p-6 text-slate-200" role="alert"><h1 className="text-xl font-bold">Dispatch access required</h1><p>This workstation is restricted to personnel assigned the dispatch role.</p></section>;
 return <DispatchWorkspace embedded={embedded}/>;
}

function DispatchWorkspace({embedded=false}) {
    const [standaloneScale,setStandaloneScale]=useState(()=>readCadDisplaySettings().scale);
    const zoom=embedded?1:cadScaleValue(standaloneScale);
    useEffect(()=>{const sync=()=>setStandaloneScale(readCadDisplaySettings().scale);window.addEventListener('storage',sync);window.addEventListener('bps-cad-display-changed',sync);return()=>{window.removeEventListener('storage',sync);window.removeEventListener('bps-cad-display-changed',sync);};},[]);
    const workstationRef=React.useRef(null);
    const statusBarRef=React.useRef(null);
    useEffect(()=>{
        if(embedded||!workstationRef.current)return;
        const host=workstationRef.current;
        const measure=()=>host.style.setProperty('--cad-standalone-height',`${Math.max(280,window.innerHeight-Math.max(0,host.getBoundingClientRect().top)-8)/zoom}px`);
        measure();window.addEventListener('resize',measure);
        return()=>window.removeEventListener('resize',measure);
    },[embedded,zoom]);
    const navigate = useNavigate();
    const location=useLocation();
    const [currentUser, setCurrentUser] = useState(null);
    const [units, setUnits] = useState([]);
    const [unitLoadStatus, setUnitLoadStatus] = useState('loading');
    const [activeCalls, setActiveCalls] = useState(() => readCachedDispatchCalls());
    const [callsLoadWarning, setCallsLoadWarning] = useState('');
    const [callDistrict, setCallDistrict] = useState(null);
    const [selectedCall, setSelectedCall] = useState(null);
    const [loading, setLoading] = useState(activeCalls.length === 0);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [intakeSource,setIntakeSource]=useState('dispatch');
    const [cloneOpen,setCloneOpen]=useState(false);
    const [showPriorCalls, setShowPriorCalls] = useState(false);
    const [showDispatchLog, setShowDispatchLog] = useState(false);
    const [showMessaging, setShowMessaging] = useState(false);
    const [unreadDispatchMessages, setUnreadDispatchMessages] = useState(0);
    const [sortOrder, setSortOrder] = useState('desc');
    const [showMap, setShowMap] = useState(false);
    const [dockMap,setDockMap]=useState(false);
    const [detailTab,setDetailTab]=useState('incident');
    const [dispatchTomTomFailed,setDispatchTomTomFailed]=useState(false);
    const [useDispatchTomTom,setUseDispatchTomTom]=useState(true);
    const [mobileView, setMobileView] = useState('calls');
    const [monitoredProperties, setMonitoredProperties] = useState([]);
    const [pendingAlertCall, setPendingAlertCall] = useState(null);
    const [queueFilter, setQueueFilter] = useState('agency');
    const [toolsOpen,setToolsOpen]=useState(false);
    const [supervisorWorking,setSupervisorWorking]=useState(false);
    const [statusWorking,setStatusWorking]=useState(false);
    const [dispatchFeedback,setDispatchFeedback]=useState('');
    const [cadAssignmentRows,setCadAssignmentRows]=useState([]);
    const {ids:verifiedPropertyIds,error:propertyFeedError}=usePropertyAssignmentCalls(activeCalls);
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
            if (event.key.toLowerCase() === 'n'&&!event.ctrlKey&&!event.metaKey&&!event.altKey) {setShowCreateDialog(true);setMobileView('detail');setShowPriorCalls(false);setShowDispatchLog(false);}
            if (event.key.toLowerCase() === 'm'&&!event.ctrlKey&&!event.metaKey&&!event.altKey) setShowMap(value => !value);
            if (event.key === 'Escape') {
                setShowMap(false);
                setSelectedCall(null);
                setMobileView('calls');
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
                const next = applyDispatchCallEvent(current, event, { hideClosed: true, limit: 500 });
                try {
                    saveLastGoodCalls(next,getActiveDispatchCallReadTime()||Date.now());
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
        const localInterval = setInterval(() => {
            if (document.visibilityState !== 'visible' || !navigator.onLine) return;
            // Realtime paints calls first; this short reconciliation is the safety net
            // for a dropped websocket event or a browser reconnect.
            if(Date.now()-lastActiveCallsLoadRef.current < 4_000)return;
            void loadActiveCalls();
        }, 15_000);

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
        const secondaryInterval = setInterval(loadMonitoredProperties, 60 * 1000);
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

        } catch (error) {
            console.error('Error loading monitored properties:', error);
        }
    };

    const init = async () => {
        try {
            const user = await withRequestTimeout(base44.auth.me(), 12000, 'Dispatch authentication');
            setCurrentUser(user);

            if (!canAccessDispatchCenter(user)) {
                toast.error('Unauthorized - Dispatch role required');
                navigate(createPageUrl('CommandDashboard'),{replace:true});
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
            let calls = await loadActiveDispatchCallRows(500);
            // Source ingestion is owned by one guarded timer, not triggered by
            // each feed reader; simultaneous retries previously competed for locks.

            const recentCalls=dedupeOperationalCalls(calls);

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
            setCallsLoadWarning('');
            setActiveCalls(recentCalls);
            // Don't leave an incident assignable after it clears or leaves the live queue.
            setSelectedCall(current => current ? (recentCalls.find(call => call.id === current.id) || null) : null);
            try {
                saveLastGoodCalls(recentCalls,getActiveDispatchCallReadTime()||Date.now());
            } catch {
                // Last-good cache is only a recovery aid; live Base44 data remains authoritative.
            }
            lastActiveCallsLoadRef.current = Date.now();
         } catch (error) {
             console.error('Error loading active calls:', error);
             setCallsLoadWarning('Active dispatch data is temporarily unavailable. Showing last confirmed calls if available; automatic retry will resume after the API cooldown.');
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
            if(selectedNoteCallRef.current===String(callId))setWelfareChecks(rows || []);
        } catch {
            if(selectedNoteCallRef.current===String(callId))setWelfareChecks([]);
        }
    };

    const handleSelectCall = (call) => {
        setSelectedCall(call);
        setDetailTab('incident');
        selectedNoteCallRef.current=String(call?.id||'');
        setCallNotes([]);
        setWelfareChecks([]);
        setMobileView('detail');
        setCallDistrict(null);
        loadCallNotes(call?.id);
        loadWelfareChecks(call?.id);
        if (call?.latitude && call?.longitude) {
            lookupDistrict(call.latitude, call.longitude).then(d => {if(selectedNoteCallRef.current===String(call.id))setCallDistrict(d);}).catch(()=>{});
        }
    };

    // Deep-link selected CAD calls from Live Command, including Help Me calls.
    const initialDeepLinkConsumed=React.useRef('');
    useEffect(()=>{
        const id=new URLSearchParams(location.search).get('call_id');
        if(!id || initialDeepLinkConsumed.current===id)return;
        const match=activeCalls.find(row=>String(row.id)===String(id));
        if(!match)return;
        initialDeepLinkConsumed.current=id;
        handleSelectCall(match);
    },[activeCalls,location.search]);

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
            if (payload.error || !payload.success) throw new Error(payload.error || 'CAD did not confirm status update');
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
        toast.success('Incident saved');
        handleSelectCall(createdCall);
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


    const propertyAlertCalls=activeCalls.filter(call=>isVerifiedPropertyCall(call,verifiedPropertyIds));
    const propertyCallIds=new Set(propertyAlertCalls.map(call=>String(call.id)));
    const matchesQueue = (call,filter) => {
        if (filter==='agency') return true;
        if(filter==='all')return propertyCallIds.has(String(call.id));
        const activeAssignments=cadAssignmentRows.filter(row=>String(row.call_id)===String(call.id)&&!['cleared','cancelled','canceled'].includes(String(row.status||'').toLowerCase()));
        if(filter==='assigned')return assignedCadUnitIds(call).length>0||!!activeAssignments.length;
        if(filter==='unassigned')return needsPropertyAssignment(call,propertyCallIds,new Set(activeAssignments.length?[String(call.id)]:[]));
        if(filter==='priority')return ['critical','high'].includes(incidentPriority(call));
        const normalize=value=>String(value||'').toLowerCase().replace(/[ _-]/g,'');
        return normalize(call.status)===normalize(filter);
    };
    const allCalls=activeCalls.filter(call=>matchesQueue(call,queueFilter)&&[call.call_id,call.bps_reference,call.agency_cad_number,call.incident,call.location,call.caller_name].filter(Boolean).join(' ').toLowerCase().includes(queueSearch.toLowerCase())).sort((a,b)=>{const ta=parseServerTimestamp(a.time_received||a.created_date)?.getTime()||0,tb=parseServerTimestamp(b.time_received||b.created_date)?.getTime()||0;return sortOrder==='desc'?tb-ta:ta-tb;});

    const statusUnits = units.filter(unit => Boolean(unit.status));
    const availableUnits = statusUnits.filter(unit => unit.status === 'Available');
    const activeUnits = statusUnits.filter(unit => unit.status !== 'Out of Service');
    const unassignedCalls = activeCalls.filter(call => matchesQueue(call,'unassigned'));
    const priorityCalls = activeCalls.filter(call => ['critical', 'high'].includes(incidentPriority(call)));
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
        <div ref={workstationRef} style={!embedded?{zoom,'--dispatch-zoom':zoom}:undefined} data-high-zoom={!embedded&&zoom>1.24} className={"bps-command-page cad-command-workstation pf-cad-workspace pf-dispatch-workspace tac-console tac-dispatch dispatch-v3 dispatch-workspace-v4 relative flex h-full min-h-0 flex-col overflow-hidden text-white "+(!embedded?' cad-dispatch-standalone':'')}>
            <NewCallAlert call={pendingAlertCall} onAcknowledge={handleAcknowledge} />

            {/* ══ TOP SYSTEM BAR ══ */}
            <div className="pf-dispatch-heading tac-header flex flex-none flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#f5a623]" />
                    <div className="min-w-0">
                        <h1 className="pf-dispatch-title">Dispatch Center</h1>
                        <p className="mt-0.5 text-[10px] leading-snug text-slate-300">Select an incident, review details, assign responding units</p>
                    </div>
                    <span className={"w-1.5 h-1.5 rounded-full ml-1 "+(callsLoadWarning?"bg-amber-400":loading?"bg-blue-400":"bg-green-400")} />
                    <span className="text-cyan-200 text-[10px]">{loading ? 'SYNCING' : callsLoadWarning?'DEGRADED':'CAD FEED'}</span><GracFeedIndicator/>
                </div>
                
                <div className="flex-1" />
                <div className="dispatch-actions flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:h-9 [&_button]:shrink-0 [&_button]:whitespace-nowrap [&_button]:rounded-lg [&_button]:px-3 [&_button]:text-[10px] [&_button]:font-bold">
                    <button type="button" onClick={()=>{for(const prefix of ['function:getActiveDispatchCalls:','function:getOnDutyUnits:','function:sharedCadTimeline:'])clearBase44ReadCacheMatching(prefix);void loadActiveCalls(true);void loadUnits(true);if(selectedCall?.id){void loadCallNotes(selectedCall.id);void loadWelfareChecks(selectedCall.id);}}} className="pf-cad-button">Refresh</button>
                    <button onClick={() => {setIntakeSource('dispatch');setShowCreateDialog(true);setMobileView('detail');setShowPriorCalls(false);setShowDispatchLog(false);}}
                        className="flex items-center gap-1 rounded-lg border border-blue-700 bg-[#163153] text-white hover:bg-blue-900">
                        <Plus className="w-3 h-3" /> New incident
                    </button>
                    <button type="button" onClick={()=>{setIntakeSource('field');setShowCreateDialog(true);setMobileView('detail');setShowPriorCalls(false);setShowDispatchLog(false);}}>Field initiated</button>

                    <button onClick={() => {
                        setShowMap(true);
                    }}
                        className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${showMap || mobileView === 'map' ? 'border-blue-500/40 bg-blue-900/20 text-blue-400' : 'border-slate-600 text-slate-500'}`}>
                        <MapIcon className="w-2.5 h-2.5" /> Map
                    </button>
                    <button type="button" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(v=>!v)} className="pf-cad-button">More tools {toolsOpen?'−':'+'}</button>
                    <div className="dispatch-v3-more" hidden={!toolsOpen}>
                    {currentUser?.role==='admin'&&<button onClick={() => setShowPriorCalls(!showPriorCalls)}
                        className={`px-2 py-1 border rounded text-[10px] ${
                            showPriorCalls ? 'border-amber-500/40 text-amber-400' : 'border-slate-600 text-slate-400 hover:text-white'
                        }`}>
                        {showPriorCalls ? 'BACK TO ACTIVE' : 'CALL / PROPERTY HISTORY'}
                    </button>}
                    <button onClick={() => setShowDispatchLog(true)} className="flex items-center gap-1 rounded border border-blue-600/60 px-2 py-1 text-[10px] text-blue-300 hover:bg-blue-950/40 hover:text-white"><ClipboardList className="h-2.5 w-2.5" /> Dispatch log</button>
                    <button onClick={() => {
                        const params = new URLSearchParams({ new: '1' });
                        if (selectedCall?.id) {
                            params.set('call_id', selectedCall.id);
                            params.set('call_number', selectedCall.agency_cad_number || selectedCall.bps_reference || selectedCall.call_id || selectedCall.id);
                        }
                        navigate(cadDestination('BOLOAlerts',params));
                    }} className="flex items-center gap-1 px-2 py-1 border border-amber-600/60 text-amber-400 hover:text-white rounded text-[10px]"><Megaphone className="w-2.5 h-2.5" /> New BOLO</button>
                    <CadVoiceBroadcastButton user={currentUser} />
                    <button onClick={() => setShowMessaging(!showMessaging)}
                        className={`relative flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${showMessaging ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-200' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                        <MessageSquarePlus className="w-2.5 h-2.5" /> Messages
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
                    </div>
                    <OfficerDistressButton currentUser={currentUser} className="text-[10px]" />

                </div>
            </div>

            {showDispatchLog && (
                <section className="relative z-[130] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#060b12]" aria-label="Dispatcher Shift Log">
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


            {!showDispatchLog && <>
            <div className="dispatch-v4-summary"><span><i data-tone="warning"/> Waiting <b>{unassignedCalls.length}</b></span><span>Other live <b>{activeCalls.length-unassignedCalls.length}</b></span><span>Priority <b>{priorityCalls.length}</b></span><span>Available units <b>{availableUnits.length}</b></span>{(callsLoadWarning||propertyFeedError)&&<span role="alert">{callsLoadWarning||propertyFeedError}</span>}</div>

            <div className="dispatch-v3-mobile flex-none border-b border-[#1e2d4a] bg-[#08111d] px-2 py-2">
                <div className="cad-mobile-view-tabs flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1.5" aria-label="Dispatch mobile panels">
                    {[
                        ['calls','Calls'], ['detail','Details'], ['assignment','Assign'], ['units','Units'], ['map','Map']
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
                        ['agency','All calls'], ['unassigned','Waiting'], ['assigned','Assigned'], ['priority','Priority'], ['all','Property']
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
                <span className="ml-3 text-[10px] text-slate-500">SHOWING: <span className="text-white font-bold">{allCalls.length}</span> / {activeCalls.length}</span>
            </div>

            {/* ══ MAIN GRID ══ */}
            {showPriorCalls && currentUser?.role==='admin' ? (
                <div className="dispatch-prior-calls flex-1 overflow-auto p-3">
                    <button type="button" className="pf-cad-button" onClick={()=>setShowPriorCalls(false)}>Back to live dispatch</button><CallHistory embedded />
                </div>
            ) : (
                <div data-mobile-view={mobileView} data-selected={!!selectedCall||showCreateDialog} className="dispatch-main dispatch-v3-grid dispatch-v4-grid pf-dispatch-grid tac-dispatch-grid flex-1 min-h-0">

                    {/* ═══ LEFT: ACTIVE CALLS TABLE ═══ */}
                    <div className={`${mobileView === 'calls' ? 'flex' : 'hidden'} pf-dispatch-list min-h-0 w-full flex-1 flex-col xl:flex xl:min-h-0 xl:flex-none`}>
                        <header className="dispatch-v3-panel-head"><b>Incident queue</b><span>{allCalls.length} calls</span></header>
                        <div className="dispatch-v3-queue-scroll dispatch-v4-queue-lanes">{[['Waiting for assignment',allCalls.filter(c=>matchesQueue(c,'unassigned'))],['Other live / responding incidents',allCalls.filter(c=>!matchesQueue(c,'unassigned'))]].map(([label,items])=><section key={label} className="dispatch-v3-queue-group"><h3>{label} <span>{items.length}</span></h3>{items.map(call=><button key={call.id} type="button" className="dispatch-v3-call" data-priority={incidentPriority(call)} aria-pressed={selectedCall?.id===call.id} onClick={()=>{if(showCreateDialog){if(!window.confirm('Discard unsaved draft and open this incident?'))return;setShowCreateDialog(false);}handleSelectCall(call);}}><div className="dispatch-v3-call-top"><span className="dispatch-v3-priority">{{critical:'P1',high:'P2',medium:'P3',low:'P4'}[incidentPriority(call)]}</span><strong>{cleanIncident(call)}</strong><time>{callAgeMinutes(call)}m</time></div><p>{call.location||'Location pending'}</p><div className="dispatch-v3-call-meta"><span>{call.agency_cad_number||call.bps_reference||call.call_id||'Reference pending'}</span><span>{call.status||'New'}</span>{propertyCallIds.has(String(call.id))&&<span>Property</span>}</div>{call.hazards&&<span className="dispatch-v3-hazard">Safety alert: {call.hazards}</span>}</button>)}{!items.length&&<p className="dispatch-v3-empty">{loading?'Loading incidents…':callsLoadWarning?'Feed delayed. Last received data shown.':'No matching calls'}</p>}</section>)}</div>

                    </div>

                    {/* ═══ CENTER: MAP + CALL DETAIL ═══ */}
                    <div className={`${mobileView === 'detail' || mobileView === 'map' ? 'flex' : 'hidden'} pf-dispatch-detail min-h-0 w-full flex-1 min-w-0 flex-col xl:flex xl:min-h-0`}>
                        <div className="tac-dispatch-center-tools"><span>{showCreateDialog?'New incident':'Incident workspace'}</span><div><button type="button" onClick={()=>{if(showCreateDialog&&!window.confirm('Discard unsaved draft?'))return;setShowCreateDialog(false);setSelectedCall(null);setMobileView('calls');}}>Close workspace</button><button type="button" aria-pressed={dockMap} onClick={()=>setDockMap(x=>!x)}>{dockMap?'Hide map':'Dock tactical map'}</button><button type="button" onClick={()=>setShowMap(true)}>Full map</button></div></div>
                        {dockMap&&!showMap&&!showCreateDialog&&<TacticalCommandMap compact calls={activeCalls} units={units} onCallClick={handleSelectCall}/>}
                        {/* Call Detail */}
                        <div className={`${mobileView === 'map' ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col border-b border-[#1e2d4a] xl:flex`}>
                            {showCreateDialog?<div className="cc-workspace-v2 dispatch-v4-intake"><CreateCallDialog inline source={intakeSource} units={units} currentUser={currentUser} onClose={()=>{setShowCreateDialog(false);setMobileView(selectedCall?'detail':'calls');}} onCreated={handleCallCreated}/></div>:selectedCall ? (
                                <div className="pf-dispatch-detail-scroll dispatch-v3-detail min-h-0 flex-1 overflow-y-auto overscroll-contain"><div className="pf-dispatch-pane-heading"><span>Incident details</span><div className="flex gap-2 flex-wrap"><button type="button" className="pf-cad-button" onClick={()=>setCloneOpen(true)}>Clone incident</button><button type="button" className="pf-cad-button" onClick={()=>setMobileView('calls')}>Back to calls</button><button type="button" className="pf-cad-primary" onClick={()=>setMobileView('assignment')}>Assign units</button></div></div>
                                    <div className="px-3 md:px-4 py-2 bg-[#0d1220] border-b border-[#1e2d4a] flex flex-wrap items-center gap-2 md:gap-3">
                                        <span className="text-[#f5a623] font-bold text-xs">
                                            {selectedCall.official_cad_verified ? `AGENCY CAD #${selectedCall.agency_cad_number || selectedCall.call_id}` : `BPS REF ${selectedCall.bps_reference || selectedCall.call_id || 'ASSIGNING…'}`}
                                        </span>
                                        <span data-priority={incidentPriority(selectedCall)} className={`cad-selected-priority text-[9px] px-2 py-0.5 rounded font-bold ${priorityBg(incidentPriority(selectedCall))}`}>{priorityCode(selectedCall)} · {incidentPriority(selectedCall).toUpperCase()}</span>
                                        {canEditIncidentPriority(currentUser) && <IncidentPrioritySelect call={selectedCall} priority={incidentPriority(selectedCall)} onSave={async(call,priority)=>{
                                            const response=await base44.functions.invoke('updateCadCallPriority',{call_id:call.id,priority});
                                            if(response?.data?.error)throw new Error(response.data.error);
                                            setActiveCalls(previous=>previous.map(row=>row.id===call.id?{...row,priority,priority_override:true}:row));
                                            setSelectedCall(previous=>previous?.id===call.id?{...previous,priority,priority_override:true}:previous);
                                        }}/>}
                                        <span className="text-[10px] text-slate-400">{selectedCall.status}</span>
                                        <span className="w-full md:w-auto md:ml-auto text-[9px] text-slate-500">
                                            RECV: {formatEasternDateTime(selectedCall.time_received || selectedCall.created_date)} ET
                                        </span>
                                    </div>
                                    <div className="tac-segment tac-dispatch-tabs" role="group" aria-label="Incident detail views">{[['incident','Incident'],['activity','CAD log / notes'],['all','All details']].map(([id,label])=><button type="button" key={id} aria-pressed={detailTab===id} onClick={()=>setDetailTab(id)}>{label}</button>)}</div>
                                    <div hidden={detailTab==='activity'} className="tac-incident-facts"><button type="button" className="tac-log-jump" onClick={()=>setDetailTab('activity')}><History size={15}/> CAD log · {callNotes.length} entries <ChevronRight size={14}/></button>
                                    <div data-priority={incidentPriority(selectedCall)} className="pf-dispatch-facts px-3 md:px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                        <h2 className="col-span-full text-xl font-bold text-white">{cleanIncident(selectedCall)}</h2>

                                        <div><span className="text-slate-500">AGENCY: </span><span className="text-white">{selectedCall.agency || '—'}</span></div>
                                        <div><span className="text-slate-500">PRIORITY: </span><span className="text-white">{priorityCode(selectedCall)} · {incidentPriority(selectedCall).toUpperCase()}</span></div>
                                        <div className="col-span-2"><span className="text-slate-500">LOCATION: </span><span className="text-white">{selectedCall.location}</span></div>
                                        {selectedCall.caller_name && <div><span className="text-slate-500">CALLER: </span><span className="text-white">{selectedCall.caller_name}</span></div>}
                                        {selectedCall.caller_phone && <div><span className="text-slate-500">PHONE: </span><span className="text-white">{selectedCall.caller_phone}</span></div>}
                                        <div><span className="text-slate-500">DISTRICT/PCT: </span><span className="text-white">{callDistrict !== null ? callDistrict : selectedCall.zone || '—'}</span></div>
                                    </div>
                                    {!['closed','cleared','cancelled','canceled','resolved','completed'].includes(String(selectedCall.status||'').toLowerCase())&&<div className="px-4 pb-2"><AddressCallHistory address={selectedCall.location} excludeCallId={selectedCall.id} /></div>}
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
                                    <div className="pf-dispatch-status-actions px-4 pb-2 flex items-center gap-2 flex-wrap">
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
                                    </div>
                                    <div hidden={detailTab==='incident'} className="tac-dispatch-activity">
                                    <div className="pf-dispatch-note-layout px-3 md:px-4 pb-3 grid grid-cols-1 gap-3">
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
                                            <AIRewriteField value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCallNote(); } }}
                                                placeholder="Type update, then Enter..." className="w-full h-16 resize-none bg-[#111827] border border-[#263653] rounded p-2 text-[10px] text-white outline-none focus:border-blue-500" />
                                            <button onClick={addCallNote} disabled={savingNote || !noteText.trim()} className="w-full mt-1 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded text-[9px] font-bold">
                                                {savingNote ? 'SAVING...' : 'POST TO CAD LOG'}
                                            </button>
                                        </div>
                                    </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="dispatch-v3-empty flex items-center justify-center p-6 text-center">
                                    Select an incident on the left to review its address, hazards and response actions. Then assign units on the right.
                                </div>
                            )}
                        </div>


                    </div>

                    {/* ═══ RIGHT: UNITS / ASSIGNMENT ═══ */}
                    <div className={`${mobileView === 'assignment' || mobileView === 'units' ? 'flex' : 'hidden'} pf-dispatch-units min-h-0 w-full flex-1 flex-col xl:flex xl:flex-none`}>
                        {selectedCall && !showCreateDialog && mobileView !== 'units' ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex flex-none items-center gap-2 border-b border-[#1e2d4a] bg-[#0d1220] px-3 py-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                    <span className="pf-dispatch-pane-title">Assign units</span>
                                    <span className="ml-auto rounded-md border border-blue-800/60 bg-blue-950/40 px-2 py-1 text-[8px] font-black text-blue-200">Call selected</span>
                                </div>
                                <div className="min-h-0 flex-1 p-3 overflow-y-auto">
                                    <details className="dispatch-v4-recommend"><summary>Recommended units</summary><CadRecommendationList key={selectedCall.id} call={selectedCall} units={units} onAssigned={handleUpdate}/></details>
                                    <UnitAssignmentPanel call={selectedCall} calls={activeCalls} units={units} allAssignments={cadAssignmentRows} unitLoadStatus={unitLoadStatus} onRetryUnits={() => loadUnits(true)} onUpdate={handleUpdate} />
                                </div>
                            </div>
                        ) : mobileView === 'assignment' ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex flex-none items-center gap-2 border-b border-[#1e2d4a] bg-[#0d1220] px-3 py-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                    <span className="pf-dispatch-pane-title">Assign units</span>
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
                            <span className="text-xs font-black tracking-widest text-emerald-300">TomTom dispatch tactical map</span>
                            <div className="ml-auto flex items-center gap-2"><button type="button" onClick={()=>{setUseDispatchTomTom(x=>!x);setDispatchTomTomFailed(false)}} className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-200">{useDispatchTomTom?'Backup map':'TomTom map'}</button><MapThemeToggle theme={mapTheme} onChange={setMapTheme} /><button onClick={() => setShowMap(false)} className="rounded border border-slate-700 px-3 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-800">CLOSE</button></div>
                        </div>
                        <div className="relative min-h-0 flex-1">
                            {useDispatchTomTom && !dispatchTomTomFailed && navigator.onLine ? <TomTomSdkMapPreview showDistress centerDistress embedded allowBlankMapFallback mapTheme={mapTheme} activeCalls={activeCalls} otherUnits={units} onCallClick={handleSelectCall} onMapUnavailable={()=>setDispatchTomTomFailed(true)}/> : <MapContainer center={[37.5407, -77.4360]} zoom={11} className="h-full w-full" zoomControl={true}>
                                <PathfinderTileLayer theme={mapTheme} />
                                <ActiveCallMarkers calls={activeCalls} onCallClick={handleSelectCall} />
                                <OtherUnitsLayer units={units} currentUserId={null} />
                                <OfficerDistressMarker autoCenter={true} />
                            </MapContainer>}
                            {useDispatchTomTom && dispatchTomTomFailed&&<div role="status" className="absolute bottom-3 left-3 z-[200] rounded-lg border border-amber-600 bg-slate-950/95 px-3 py-2 text-xs text-amber-200">TomTom temporarily unavailable · Showing backup map <button onClick={()=>setDispatchTomTomFailed(false)} className="ml-2 underline">Retry TomTom</button></div>}
                        </div>
                    </div>
                </div>
            )}

            {/* ══ BOTTOM STATUS BAR — horizontal scroll keeps every metric accessible on phones ══ */}
            <div className="cad-bottom-status-wrap flex flex-none items-center border-t border-[#1e2d4a] bg-[#0d1220] text-[10px] text-slate-300">
                <button type="button" className="cad-status-scroll-button shrink-0 border-r border-[#26384c] px-2 text-cyan-200 lg:hidden" aria-label="Scroll CAD status left" onClick={() => statusBarRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}><ChevronLeft className="h-4 w-4" /></button>
                <div ref={statusBarRef} role="region" aria-label="CAD status bar — scroll horizontally for more information" tabIndex={0} className="cad-bottom-status min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
                    <div className="flex min-w-max items-center gap-4 whitespace-nowrap px-3 py-2">
                        <span className="flex shrink-0 items-center gap-1.5"><Wifi className="h-3 w-3 text-emerald-400" /> CAD NETWORK: <span className="font-bold text-slate-300">{loading?'Syncing':callsLoadWarning?'Degraded':'Feed ready'}</span></span>
                        <span className="shrink-0">CALLS: <span className="text-white">{allCalls.length}</span></span>
                        <span className="shrink-0">UNITS ACTIVE: <span className="text-green-400">{activeUnits.length}</span></span>
                        <span className="shrink-0">WAITING PROPERTY: <span className="text-yellow-400">{unassignedCalls.length}</span></span>
                        <span className="hidden shrink-0 items-center gap-1 text-slate-400 md:flex lg:ml-auto"><Keyboard className="h-3 w-3" /> N NEW CALL · / SEARCH · M MAP · ESC CLEAR</span>
                        <span className="shrink-0 font-bold text-green-400">{systemTime.toLocaleTimeString('en-US', { hour12: false })} ET</span>
                    </div>
                </div>
                <button type="button" className="cad-status-scroll-button shrink-0 border-l border-[#26384c] px-2 text-cyan-200 lg:hidden" aria-label="Scroll CAD status right" onClick={() => statusBarRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}><ChevronRight className="h-4 w-4" /></button>
            </div>

            </>}
            {selectedCall&&<CadCloneIncidentDialog open={cloneOpen} onOpenChange={setCloneOpen} call={selectedCall} onCloned={handleCallCreated}/>}
            {/* Messaging Panel */}
            <MessagingPanel
                currentUser={currentUser}
                units={units}
                isOpen={showMessaging}
                onClose={() => setShowMessaging(false)}
            />


        </div>
    );
}
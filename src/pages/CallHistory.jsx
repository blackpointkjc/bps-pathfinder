import {useAuth as useCadHistoryAuth} from '@/lib/AuthContext';
import {canAccessCadAdminPages} from '@/lib/dispatchPermissions';
import {CadTerminalHeader,CadMetricStrip,CadPanelBar,CadRefresh} from '@/components/dispatch/CadTerminal';
import '@/components/dispatch/cad-center-terminal.css';
import {recoverPropertyHistory} from '@/lib/propertyHistoryRecovery';
import { addressHistoryPattern } from '../../base44/functions/_shared/addressHistoryMatch.js';
import { isValidCallRecord, isVisibleActiveCall } from '../../base44/functions/_shared/callFeedPolicy.js';
import { cadReference } from '@/lib/cadReference';
import { cadDestination } from '@/lib/cadNavigation';
import PropertyCallLinkControl from '@/components/dispatch/PropertyCallLinkControl';
import { useState, useEffect, useRef } from 'react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { toast } from 'sonner';
import { RefreshCw, History, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { formatEasternDateTime, parseServerTimestamp } from '@/lib/easternTime';
import { withRequestTimeout } from '@/lib/requestTimeout';
import { loadActiveDispatchCallRows, readLastGoodCalls } from '@/lib/activeDispatchCalls';
import { findPropertyMatch, monitoredPropertiesFromLocations } from '@/utils/alertUtils';
import {createReportCallLink} from '@/lib/reportCallLinking';

const AGENCY_COLORS = {
    RPD: 'bg-blue-800 text-blue-200 border-blue-700',
    CCPD: 'bg-blue-900 text-blue-300 border-blue-800',
    HPD: 'bg-purple-900 text-purple-300 border-purple-800',
    HCPD: 'bg-purple-900 text-purple-300 border-purple-800',
    CCFD: 'bg-red-900 text-red-300 border-red-800',
    RFD: 'bg-red-900 text-red-300 border-red-800',
    EMS: 'bg-yellow-900 text-yellow-300 border-yellow-800',
    BPS: 'bg-gold/20 text-gold border-gold/30',
};

const historyCallStatus=row=>row?.time_cleared?'Cleared':row?.time_on_scene?'On Scene':row?.status||'New';
const sentenceCase=(value)=>{
    const raw=String(value||'').trim();
    if(!raw)return '—';
    return raw.replace(/\s+,/g,',').replace(/,([^\s])/g,', $1').toLowerCase().replace(/\b[a-z]/g,a=>a.toUpperCase())
        .replace(/\bd\.o\.a\./gi,'D.O.A.').replace(/\bems\b/gi,'EMS')
        .replace(/\bcad\b/gi,'CAD').replace(/\brpd\b/gi,'RPD')
        .replace(/\brfd\b/gi,'RFD').replace(/\bgrac\b/gi,'GRAC');
};
const STATUS_COLORS = {
    New: 'bg-red-900/60 text-red-300 border-red-700/50',
    Pending: 'bg-orange-900/60 text-orange-300 border-orange-700/50',
    Dispatched: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/50',
    Enroute: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/50',
    'On Scene': 'bg-blue-900/60 text-blue-300 border-blue-700/50',
    Cleared: 'bg-green-900/60 text-green-300 border-green-700/50',
    Closed: 'bg-slate-700 text-slate-400 border-slate-600',
    Cancelled: 'bg-slate-700 text-slate-500 border-slate-600',
};

function parseServerDate(value) {
    return parseServerTimestamp(value);
}

function fmtDT(dateStr) {
    return formatEasternDateTime(dateStr, { second: '2-digit', hour12: true });
}

function agencyKey(agency) {
    if (!agency) return '';
    for (const k of Object.keys(AGENCY_COLORS)) {
        if (agency.includes(k)) return k;
    }
    return '';
}

function escapePrintHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export default function CallHistory(){const {user,isLoadingAuth}=useCadHistoryAuth();if(isLoadingAuth)return null;return canAccessCadAdminPages(user)?<AdminCallHistory/>:<p role="alert">Administrator access required.</p>;}
function AdminCallHistory() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const referenceRowsRef=useRef(rows); referenceRowsRef.current=rows;
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState(()=>new URLSearchParams(window.location.search).get('q')||'');
    const searchRef=useRef(search);searchRef.current=search;
    const [throughDate, setThroughDate] = useState('');
    const throughDateRef = useRef(throughDate); throughDateRef.current = throughDate;
    const [fromDate, setFromDate] = useState('');
    const fromDateRef = useRef(fromDate); fromDateRef.current = fromDate;
    const [agencyFilter, setAgencyFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [propertyFilter, setPropertyFilter] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).get('class')?.toLowerCase() === 'property' ? 'PROPERTY' : 'ALL';
        } catch {
            return 'ALL';
        }
    });
    const [sortField, setSortField] = useState('time');
    const [sortDir, setSortDir] = useState('desc');
    const [expandedId, setExpandedId] = useState(null);
    const [callDetails,setCallDetails]=useState({});
    const detailRequests=useRef(new Map());
    const loadDetails=(row,force=false)=>{
      const key=String(row.id);
      if(detailRequests.current.has(key))return;
      if(!force&&callDetails[key]?.data&&!callDetails[key]?.error&&!callDetails[key]?.data?.warnings?.length)return;
      const request=Symbol();detailRequests.current.set(key,request);
      setCallDetails(old=>({...old,[key]:{...old[key],loading:true,error:''}}));
      if(force)clearBase44ReadCacheMatching('function:getCallHistoryFeed:');
      void withRequestTimeout(base44.functions.invoke('getCallHistoryFeed',{action:'call_details',call_id:row.original_call_id||row.id,call_number:cadReference(row)}),35000,'Selected call activity').then(response=>{
        const result=response?.data||response||{};if(result.error||!result.success)throw Error(result.error||'Call details unavailable');
        setCallDetails(old=>({...old,[key]:{loading:false,data:result,error:''}}));
      }).catch(error=>setCallDetails(old=>({...old,[key]:{...old[key],loading:false,error:error?.message||'Call activity unavailable'}}))).finally(()=>detailRequests.current.delete(key));
    };
    const expandCall=row=>{if(expandedId===row.id){setExpandedId(null);return;}setExpandedId(row.id);loadDetails(row);};
    const [linkingCallId,setLinkingCallId]=useState(null);
    const [existingReportNumber,setExistingReportNumber]=useState('');
    const [linkBusy,setLinkBusy]=useState(false);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const intervalRef = useRef(null);
    const realtimeTimerRef = useRef(null);
    const loadInFlightRef = useRef(false);
    const historyAuthorizedRef=useRef(false);
    const lastServerReadRef=useRef(0);
    const pendingSearchRef=useRef(false);
    const monitoredPropertiesRef = useRef([]);
    const propertyBoundariesReadAtRef = useRef(0);
    const cursorRef = useRef(null);
    const cursorQueryRef=useRef('');
    const [nextCursor, setNextCursor] = useState(null);
    const [historyWarning, setHistoryWarning] = useState('');
    const pagesLoadedRef = useRef(0);
    const filtersRef = useRef({agency:agencyFilter,status:statusFilter,call_class:propertyFilter});
    filtersRef.current = {agency:agencyFilter,status:statusFilter,call_class:propertyFilter};
    const filtersMountedRef = useRef(false);
    useEffect(() => {
      if (!filtersMountedRef.current) { filtersMountedRef.current = true; return; }
      setRefreshing(true);
      setRows([]);setNextCursor(null);
      void loadAll(true);
    }, [agencyFilter, statusFilter, propertyFilter]);

    const decorateRealtimePropertyMatch = (row) => {
        if (!row) return row;
        if (row._propertyCall && (row._propertyName || row._propertyAlert?.propertyName)) return row;
        const match = findPropertyMatch(row, monitoredPropertiesRef.current || []);
        if (!match) return row;
        return {
            ...row,
            _propertyCall: true,
            _propertyProvisional: !row._propertyAlert,
            _propertyName: match.property?.name || row._propertyName || '',
            _propertyId: match.property?.id || row._propertyId || '',
            _propertyDistanceMeters: Number.isFinite(Number(match.distanceMeters)) ? Number(match.distanceMeters) : null,
        };
    };

    const applyRealtimeDispatchEvent = (event) => {
        const type = String(event?.type || '').toLowerCase();
        const record = event?.data || event?.record || null;
        if (!record || type === 'delete' || !isValidCallRecord(record)) return;
        const stamp = parseServerDate(record.time_received || record.created_date)?.getTime() || 0;
        if (stamp < Date.now() - 90 * 86400000 || stamp > Date.now() + 120000) return;
        if (fromDateRef.current && stamp < new Date(fromDateRef.current+'T00:00:00').getTime()) return;
        if (throughDateRef.current && stamp > new Date(throughDateRef.current+'T23:59:59.999').getTime()) return;
        if (filtersRef.current.agency !== 'ALL' && record.agency !== filtersRef.current.agency) return;
        if (filtersRef.current.status !== 'ALL' && record.status !== filtersRef.current.status) return;
        if (searchRef.current && ![record.incident,record.location,record.call_id,record.bps_reference,record.agency_cad_number].some(value=>String(value||'').toLowerCase().includes(searchRef.current.toLowerCase()))) return;
        const liveRow = decorateRealtimePropertyMatch({ ...record, _source: 'active' });
        if(filtersRef.current.call_class==='PROPERTY'&&!liveRow._propertyCall&&!referenceRowsRef.current.some(row=>row._propertyCall&&(row.id===record.id||row.original_call_id===record.id)))return;
        setRows(current => {
            const next = [...current];
            const index = next.findIndex(row => String(row.id || '') === String(record.id || '') || String(row.original_call_id || '') === String(record.id || ''));
            if (index >= 0) {
                const existing = next[index];
                next[index] = {
                    ...existing,
                    ...liveRow,
                    _propertyCall: Boolean(existing._propertyCall || liveRow._propertyCall),
                    _propertyAlert: existing._propertyAlert || liveRow._propertyAlert || null,
                    _propertyName: existing._propertyName || liveRow._propertyName || existing._propertyAlert?.propertyName || '',
                    _propertyId: existing._propertyId || liveRow._propertyId || '',
                    _propertyLifecycle: existing._propertyLifecycle || liveRow._propertyLifecycle || '',
                    _propertyDistanceMeters: existing._propertyDistanceMeters ?? liveRow._propertyDistanceMeters ?? null,
                };
            } else {
                next.unshift(liveRow);
            }
            return next;
        });
        setLastRefresh(new Date());
    };

    useEffect(() => {
        init();
        intervalRef.current = setInterval(() => {
            if (document.visibilityState === 'visible') loadAll();
        }, 120000);

        const subscriptions = [];
        const scheduleRealtimeRefresh = (entity, delay = 900) => {
            // Realtime tells us the underlying data changed. Clear only the CAD
            // history caches affected by that event so reconciliation cannot return
            // stale PropertyAlert/history data.
            clearBase44ReadCacheMatching(`entity:${entity}:`);
            clearBase44ReadCacheMatching('function:getCallHistoryFeed:');
            if (entity === 'PropertyAlert') clearBase44ReadCacheMatching('entity:PropertyAlert:');
            if(realtimeTimerRef.current)return;
            realtimeTimerRef.current = window.setTimeout(() => {
                realtimeTimerRef.current=null;
                if (document.visibilityState === 'visible') loadAll();
            },Math.max(delay,90000-(Date.now()-lastServerReadRef.current)));
        };
        try {
            const unsubscribe = base44.entities.DispatchCall.subscribe(event => {
                // Paint the CAD call immediately from the realtime payload. The
                // backend history fetch below is reconciliation only.
                applyRealtimeDispatchEvent(event);
                scheduleRealtimeRefresh('DispatchCall', 1500);
            });
            if (typeof unsubscribe === 'function') subscriptions.push(unsubscribe);
        } catch {}
        for (const entity of ['CallHistory', 'PropertyAlert', 'PropertyCallLink', 'Location']) {
            try {
                const unsubscribe = base44.entities[entity].subscribe(() => scheduleRealtimeRefresh(entity, 900));
                if (typeof unsubscribe === 'function') subscriptions.push(unsubscribe);
            } catch {}
        }
        const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(intervalRef.current);
            window.clearTimeout(realtimeTimerRef.current);
            subscriptions.forEach(unsubscribe => unsubscribe());
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    const init = async () => {
        try {
            const user = await withRequestTimeout(base44.auth.me(), 12000, 'Call history authentication');
            const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
            if (['client','student','visitor'].some(role=>roles.has(role)||String(user.user_type||'').toLowerCase()===role||String(user.role||'').toLowerCase()===role)) {navigate(createPageUrl('CommandDashboard'));return;}
            if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('dispatch') && !user.dispatch_role && !roles.has('cad_access') && !roles.has('full_access')) {
                toast.error('Access required');
                navigate(createPageUrl('CommandDashboard'));
                return;
            }
        } catch { navigate(createPageUrl('CommandDashboard')); return; }
        historyAuthorizedRef.current=true;
        // After access is verified, show recently confirmed operational calls
        // immediately instead of hiding the whole history screen behind a
        // 10-15 second archive query. Refresh with authoritative history below.
        const recent = readLastGoodCalls().filter(isVisibleActiveCall);
        if(recent.length&&filtersRef.current.call_class!=='PROPERTY'){
            setRows(recent.map(call=>({...call,_source:'active',_historyFallback:true})));
            setLoading(false);
            setHistoryWarning('Showing recently saved live CAD calls while the historical archive loads.');
        }
        await loadAll();
    };

    const loadAll = async (force=false, append=false) => {
        if(!historyAuthorizedRef.current)return;
        if(loadInFlightRef.current){if(force)pendingSearchRef.current=true;return;}
        if (!force && !append && pagesLoadedRef.current > 1) return;
        if (!force && !append && Date.now()-lastServerReadRef.current<45000) return;
        const queryKey=JSON.stringify([searchRef.current,fromDateRef.current,throughDateRef.current,filtersRef.current]);
        if(append&&cursorQueryRef.current!==queryKey)append=false;
        if (append && !cursorRef.current) return;
        lastServerReadRef.current=Date.now();
        loadInFlightRef.current = true;
        try {
            // Keep a current in-memory copy of monitored property boundaries so
            // active CAD rows can be classified immediately even before the
            // durable PropertyAlert write arrives.
            if(!propertyBoundariesReadAtRef.current || Date.now()-propertyBoundariesReadAtRef.current > 5*60_000){
              propertyBoundariesReadAtRef.current=Date.now();
              void withRequestTimeout(base44.entities.Location.list('site_name',300),10000,'Property monitoring boundaries')
                .then(locations=>{monitoredPropertiesRef.current=monitoredPropertiesFromLocations(locations||[]);})
                .catch(error=>{
                  propertyBoundariesReadAtRef.current=0;
                  console.warn('[HISTORY] Property boundaries unavailable',error?.message);
                });
            }

            const request={search:searchRef.current,include_details:false,...filtersRef.current,since:fromDateRef.current?new Date(fromDateRef.current+'T00:00:00').toISOString():undefined,until:throughDateRef.current?new Date(new Date(throughDateRef.current+'T00:00:00').setDate(new Date(throughDateRef.current+'T00:00:00').getDate()+1)-1).toISOString():undefined,page_size:40,cursor:append?cursorRef.current:null};
            const propertyMode=request.call_class==='PROPERTY';
            const recover=()=>recoverPropertyHistory({entities:base44.entities,...request,cursor:request.cursor?.direct_property?request.cursor:null,pageSize:40});
            let payload;
            if(propertyMode&&request.cursor?.direct_property)payload=await recover();
            else {
              try {
                const result=await withRequestTimeout(base44.functions.invoke('getCallHistoryFeed',request),35000,'Call history request');
                payload=result?.data||result||{};
                if(!Array.isArray(payload.rows)&&payload?.data&&typeof payload.data==='object')payload=payload.data;
                if(payload.error)throw Error(payload.error);
                // A preview may be serving a previous backend implementation.
                // Never apply the general CAD cursor to the property registry.
                if(propertyMode&&(payload.property_history_version!==2||payload.call_class!=='PROPERTY'||!Array.isArray(payload.rows)||payload.rows.some(row=>!row._propertyCall)||(!payload.rows.length&&!request.cursor))){
                  if(request.cursor)throw Error('Property history source changed; refresh the property history.');
                  payload=await recover();
                }
              }catch(error){
                if(!propertyMode||request.cursor)throw error;
                payload=await recover();
              }
            }
            if(queryKey!==JSON.stringify([searchRef.current,fromDateRef.current,throughDateRef.current,filtersRef.current])){pendingSearchRef.current=true;return;}
            if(payload.error)throw Error(payload.error);
            let feedRows = Array.isArray(payload.rows) ? payload.rows : [];
            let liveFeedRecovered = false;
            // The archived-history query can return a misleading empty page
            // while the operational CAD board has verified current calls.
            // Recover those calls from the SAME shared feed as Dispatch Center,
            // never invent records or silently claim the archive is complete.
            if(!append && filtersRef.current.call_class!=='PROPERTY' && !feedRows.length && !payload.has_more && !searchRef.current.trim()
                && filtersRef.current.agency==='ALL' && filtersRef.current.status==='ALL'
                && !fromDateRef.current && !throughDateRef.current){
              let currentCalls = readLastGoodCalls().filter(isVisibleActiveCall);
              if(!currentCalls.length){
                try{
                  currentCalls = (await withRequestTimeout(loadActiveDispatchCallRows(100),12000,'Live CAD history recovery'))
                    .filter(isVisibleActiveCall);
                }catch(error){console.warn('[HISTORY] Live CAD fallback unavailable',error?.message||error);}
              }
              if(currentCalls.length){
                feedRows = currentCalls.map(call=>({...call,_source:'active',_historyFallback:true}));
                liveFeedRecovered=true;
              }
            }
            // Independently classify the current CAD rows by live property geometry.
            // This makes Call History update immediately even if PropertyAlert
            // persistence is briefly delayed by ingestion or rate limiting.
            feedRows = feedRows.map(row => decorateRealtimePropertyMatch(row));
            cursorRef.current = payload.next_cursor || null;
            cursorQueryRef.current=queryKey;
            setNextCursor(cursorRef.current);
            pagesLoadedRef.current = append ? pagesLoadedRef.current + 1 : 1;
            setHistoryWarning(payload.property_recovery?'Showing saved property alerts directly. Status is the saved alert snapshot; refresh for full CAD enrichment.':liveFeedRecovered
                ? 'Showing verified live CAD calls. The historical archive feed returned no records; archive details may be incomplete.'
                : (payload.warnings || []).length ? 'Some history sources could not be loaded. Refresh to retry.' : payload.scan_incomplete ? 'More history remains to be searched. Select Load older calls to continue.' : '');
            setLoading(false);

            // Collapse active/archive copies by the original CAD entity id while
            // preserving property metadata from either copy. Prefer the active row
            // when it exists so current status remains authoritative.
            const mergedByCall = new Map();
            for (const row of (append ? [...referenceRowsRef.current, ...feedRows] : feedRows)) {
                const identity = String(row.original_call_id || (row._source === 'active' ? row.id : '') || row.call_id || row.id);
                const current = mergedByCall.get(identity);
                if (!current) {
                    mergedByCall.set(identity, row);
                    continue;
                }
                const preferRow = row._source === 'active' && current._source !== 'active';
                const primary = preferRow ? row : current;
                const secondary = preferRow ? current : row;
                mergedByCall.set(identity, {
                    ...secondary,
                    ...primary,
                    _assignedUnitDetails: primary._assignedUnitDetails?.length ? primary._assignedUnitDetails : (secondary._assignedUnitDetails || []),
                    assigned_units: primary.assigned_units?.length ? primary.assigned_units : (secondary.assigned_units || []),
                    _propertyCall: Boolean(primary._propertyCall || secondary._propertyCall),
                    _propertyAlert: primary._propertyAlert || secondary._propertyAlert || null,
                    _propertyName: primary._propertyName || secondary._propertyName || primary._propertyAlert?.propertyName || secondary._propertyAlert?.propertyName || '',
                    _propertyId: primary._propertyId || secondary._propertyId || '',
                    _propertyLifecycle: primary._propertyLifecycle || secondary._propertyLifecycle || '',
                    _propertyDistanceMeters: primary._propertyDistanceMeters ?? secondary._propertyDistanceMeters ?? null,
                });
            }
            setRows([...mergedByCall.values()]);
            setLastRefresh(new Date());
        } catch (e) {
            console.error('[HISTORY] feed load failed:', e);
            // A partial backend outage must not turn 34 verified dispatch
            // calls into a false zero-row history. Recover via the shared
            // active-call feed, which Dispatch Center already uses.
            let recovered=readLastGoodCalls().filter(isVisibleActiveCall);
            if(!recovered.length && !append){
              try {recovered=(await withRequestTimeout(loadActiveDispatchCallRows(100),12000,'Verified CAD history fallback')).filter(isVisibleActiveCall);}
              catch(error){console.warn('[HISTORY] Shared CAD fallback unavailable',error?.message||error);}
            }
            if(recovered.length && filtersRef.current.call_class!=='PROPERTY' && !searchRef.current.trim() && filtersRef.current.agency==='ALL' && filtersRef.current.status==='ALL'){
              const current=referenceRowsRef.current;
              const merged=new Map(current.map(item=>[String(item.original_call_id||item.id),item]));
              for(const row of recovered){
                const stamp=parseServerDate(row.time_received||row.created_date)?.getTime()||0;
                if(fromDateRef.current&&stamp<new Date(fromDateRef.current+'T00:00:00').getTime())continue;
                if(throughDateRef.current&&stamp>new Date(throughDateRef.current+'T23:59:59.999').getTime())continue;
                const key=String(row.original_call_id||row.id);
                merged.set(key,{...merged.get(key),...row,_source:'active',_historyFallback:true});
              }
              setRows([...merged.values()]);
              setLastRefresh(new Date());
              setHistoryWarning(`Showing ${recovered.length} verified current CAD calls while archived history is unavailable. Older records may be incomplete.`);
            } else {
              setHistoryWarning('Call History service is unavailable or throttled. Previous records remain visible if already loaded; retry after the API cooldown.');
            }
            // This is not an empty history search result; leave an explicit
            // warning rather than silently displaying zero records.
            console.warn('Call History request failed:',e?.message||'Unknown error');
            // Preserve the last confirmed feed during a transient timeout instead of
            // replacing valid call history with an empty screen.
        } finally {
            loadInFlightRef.current = false;
            setLoading(false);
            setRefreshing(false);
            if(pendingSearchRef.current){pendingSearchRef.current=false;window.setTimeout(()=>loadAll(true),0);}
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        clearBase44ReadCacheMatching('function:getCallHistoryFeed:');
        clearBase44ReadCacheMatching('entity:PropertyAlert:');
        clearBase44ReadCacheMatching('entity:DispatchCall:');
        clearBase44ReadCacheMatching('entity:CallHistory:');
        await loadAll(true);
    };

    const linkExistingIncidentReport=async row=>{
        const number=existingReportNumber.trim();
        if(!number)return toast.error('Enter the existing incident report number.');
        setLinkBusy(true);
        try{
            const reportRows=await base44.entities.IncidentReport.filter({report_number:number},'-created_date',10);
            if(reportRows.length!==1)throw new Error(reportRows.length?'Several reports match this number; contact command to reconcile.':'No incident report matches that number.');
            const report=reportRows[0];
            const callId=row.original_call_id||(row._source==='active'?row.id:'');
            if(!callId)throw new Error('Original CAD call ID missing. Cannot safely link to an archived record.');
            const callNumber=cadReference(row);
            await createReportCallLink({callId,callNumber,reportType:'IncidentReport',reportId:report.id,reportNumber:report.report_number||report.id});
            await base44.entities.IncidentReport.update(report.id,{linked_call_id:callId,linked_call_number:callNumber});
            const item={id:`linked-${report.id}`,report_type:'IncidentReport',report_id:report.id,report_number:report.report_number||report.id,call_number:callNumber};
            setRows(rows=>rows.map(candidate=>candidate.id===row.id?{...candidate,_linkedReports:[...(candidate._linkedReports||[]).filter(old=>old.report_id!==report.id),item]}:candidate));
            setCallDetails(old=>{const key=String(row.id),entry=old[key];return entry?.data?{...old,[key]:{...entry,data:{...entry.data,linked_reports:[...(entry.data.linked_reports||[]).filter(link=>link.report_id!==report.id),item]}}}:old;});
            setLinkingCallId(null);setExistingReportNumber('');
            toast.success(`Incident report ${number} linked to CAD ${callNumber}.`);
        }catch(error){toast.error(error?.response?.data?.error||error?.message||'Report linking failed');}
        finally{setLinkBusy(false);}
    };
    const openLinkedReport=link=>{
      const type=String(link.report_type||'').toLowerCase();
      const page=type.includes('daily')?'DailyActivityReports':type.includes('incident')?'IncidentReports':
        type.includes('trespass')?'TrespassingNotices':type.includes('complaint')?'CriminalComplaints':'IncidentReports';
      const params=new URLSearchParams({view_report_id:String(link.report_id),report_number:String(link.report_number||link.report_id)});
      navigate(`${createPageUrl(page)}?${params.toString()}`);
    };

    const openIncidentReport = (row) => {
        const received = parseServerDate(row.time_received || row.created_date) || new Date();
        const params = new URLSearchParams({
            from_call: 'true',
            call_id: row.original_call_id || row.id || '',
            call_number: cadReference(row),
            location: row.location || '',
            incident_type: 'other',
            incident_time: received.toTimeString().slice(0, 5),
            description: row.description || row.incident || '',
        });
        navigate(`${createPageUrl('IncidentReports')}?${params.toString()}`);
    };

    const handleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    };

    const printPropertyAlerts = () => {
        const q = search.toLowerCase();
        const addressPattern = addressHistoryPattern(search);
        const matchesAddress = row => Boolean(addressPattern) && new RegExp(addressPattern, 'i').test(String(row.location || ''));
        const propertyRows = rows.filter(row => {
            if (!row._propertyCall) return false;
            if (q && !matchesAddress(row) && ![
                row.incident,
                row.location,
                row.agency,
                row.call_id,
                row.bps_reference,
                row.agency_cad_number,
                row._propertyName,
                row._propertyAlert?.propertyName,
                row._propertyAlert?.description,
            ].some(value => String(value || '').toLowerCase().includes(q))) return false;
            if (agencyFilter !== 'ALL' && !row.agency?.includes(agencyFilter)) return false;
            if (statusFilter !== 'ALL' && historyCallStatus(row) !== statusFilter) return false;
            return true;
        }).sort((a, b) => {
            const aTime = parseServerDate(a.time_received || a.created_date)?.getTime() || 0;
            const bTime = parseServerDate(b.time_received || b.created_date)?.getTime() || 0;
            return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
        });

        if (!propertyRows.length) {
            toast.error('No property alerts match the current filters.');
            return;
        }

        const reportRows = propertyRows.map((row, index) => {
            const propertyName = row._propertyName || row._propertyAlert?.propertyName || 'Monitored property';
            const lifecycle = String(row._propertyLifecycle || row._propertyAlert?.lifecycle_status || row.status || '').replaceAll('_', ' ');
            const cad = cadReference(row) || 'Assigning CAD Reference…';
            const distance = Number.isFinite(Number(row._propertyDistanceMeters)) && Number(row._propertyDistanceMeters) > 0
                ? `${Math.round(Number(row._propertyDistanceMeters) / 0.3048)} ft`
                : 'Inside / not recorded';
            const notes = row._propertyAlert?.description || row.description || '';
            return `<tr>
                <td>${index + 1}</td>
                <td>${escapePrintHtml(fmtDT(row.time_received || row.created_date))}</td>
                <td>${escapePrintHtml(propertyName)}</td>
                <td>${escapePrintHtml(row.incident || 'Call for service')}</td>
                <td>${escapePrintHtml(row.location || '—')}</td>
                <td>${escapePrintHtml(row.agency || '—')}</td>
                <td>${escapePrintHtml(lifecycle || '—')}</td>
                <td>${escapePrintHtml(cad)}</td>
                <td>${escapePrintHtml(distance)}</td>
                <td>${escapePrintHtml(notes)}</td>
            </tr>`;
        }).join('');

        const generated = formatEasternDateTime(new Date().toISOString(), { year: 'numeric', second: '2-digit', hour12: true });
        const printWindow = window.open('', '_blank', 'width=1200,height=900');
        if (!printWindow) {
            toast.error('Allow pop-ups to print the property alert report.');
            return;
        }
        printWindow.document.open();
        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Property Alert Call History</title><style>
            @page { size: landscape; margin: 0.45in; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
            h1 { margin: 0 0 4px; font-size: 20px; }
            .meta { margin-bottom: 14px; color: #444; font-size: 10px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #bbb; padding: 6px; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
            th { background: #f0f0f0; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; }
            tr { break-inside: avoid; }
            th:nth-child(1), td:nth-child(1) { width: 3%; text-align: center; }
            th:nth-child(2), td:nth-child(2) { width: 10%; }
            th:nth-child(3), td:nth-child(3) { width: 12%; }
            th:nth-child(4), td:nth-child(4) { width: 12%; }
            th:nth-child(5), td:nth-child(5) { width: 15%; }
            th:nth-child(6), td:nth-child(6) { width: 6%; }
            th:nth-child(7), td:nth-child(7) { width: 8%; }
            th:nth-child(8), td:nth-child(8) { width: 10%; }
            th:nth-child(9), td:nth-child(9) { width: 8%; }
            th:nth-child(10), td:nth-child(10) { width: 16%; }
            .footer { margin-top: 10px; color: #555; font-size: 9px; }
        </style></head><body>
            <h1>Property Alert Call History</h1>
            <div class="meta">Generated ${escapePrintHtml(generated)} ET · ${propertyRows.length} record${propertyRows.length === 1 ? '' : 's'}</div>
            <table><thead><tr><th>#</th><th>Date / Time</th><th>Property</th><th>Incident</th><th>Location</th><th>Agency</th><th>Status</th><th>CAD / Ref.</th><th>Boundary</th><th>Details</th></tr></thead><tbody>${reportRows}</tbody></table>
            <div class="footer">Property alert history report. Use the print dialog to save as PDF.</div>
            <script>window.addEventListener('load',()=>{window.focus();window.print();});<\/script>
        </body></html>`);
        printWindow.document.close();
    };

    const agencies = ['ALL', 'RPD', 'CCPD', 'HPD', 'HCPD', 'RFD', 'CCFD', 'EMS', 'BPS', 'MONITORING'];
    const statuses = ['ALL', 'New', 'Pending', 'Dispatched', 'Enroute', 'On Scene', 'Cleared', 'Closed', 'Cancelled'];

    const filtered = rows.filter(r => {
        const q = search.toLowerCase();
        const addressPattern = addressHistoryPattern(search);
        const addressMatches = addressPattern && new RegExp(addressPattern, 'i').test(String(r.location || ''));
        if (q && !addressMatches && ![
            r.incident,
            r.location,
            r.agency,
            r.call_id,
            r.bps_reference,
            r.agency_cad_number,
            r._propertyName,
            r._propertyAlert?.propertyName,
            r._propertyAlert?.description,
        ].some(value => String(value || '').toLowerCase().includes(q))) return false;
        if (agencyFilter !== 'ALL' && !r.agency?.includes(agencyFilter)) return false;
        if (statusFilter !== 'ALL' && historyCallStatus(r) !== statusFilter) return false;
        const isPropertyCall = Boolean(r._propertyCall);
        if (propertyFilter === 'PROPERTY' && !isPropertyCall) return false;
        if (propertyFilter === 'PUBLIC' && isPropertyCall) return false;
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        let va, vb;
        if (sortField === 'time') { va = parseServerDate(a.time_received || a.created_date)?.getTime() || 0; vb = parseServerDate(b.time_received || b.created_date)?.getTime() || 0; }
        else if (sortField === 'incident') { va = a.incident || ''; vb = b.incident || ''; }
        else if (sortField === 'agency') { va = a.agency || ''; vb = b.agency || ''; }
        else if (sortField === 'status') { va = a.status || ''; vb = b.status || ''; }
        else { va = 0; vb = 0; }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <span className="text-slate-700 ml-1">↕</span>;
        return <span className="text-cyan-300 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    const activeCount = sorted.filter(r => r._source === 'active' && isVisibleActiveCall(r)).length;
    const archivedCount = sorted.length - activeCount;
    const propertyCount = sorted.filter(r => r._propertyCall).length;

    if (loading) return (
        <div className="h-full min-h-0 bg-slate-950 flex items-center justify-center">
            <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" /><p className="text-gold font-mono text-xs tracking-widest">Loading call history…</p></div>
        </div>
    );

    const selectedRecord=sorted.find(row=>row.id===expandedId);
    const renderRecordDetail=(row)=>{
      const detail=callDetails[String(row.id)]||{},activity=detail.data;
      const isActive=row._source==='active'&&isVisibleActiveCall(row);
      return (<div className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-slate-700 bg-slate-800/40 px-3 py-3 text-[10px] sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
                                    {(
                                        <div className="mb-1 sm:col-span-2 lg:col-span-3">
                                            <span className="text-slate-500 tracking-widest">NARRATIVE: </span>
                                            <span className="text-slate-300">{activity?.narrative||row.description||'No narrative recorded.'}</span>
                                        </div>
                                    )}
                                    {row.caller_name && <div><span className="text-slate-500">CALLER: </span><span className="text-white">{row.caller_name}</span></div>}
                                    {row.caller_phone && <div><span className="text-slate-500">PHONE: </span><span className="text-white">{row.caller_phone}</span></div>}
                                    {row.zone && <div><span className="text-slate-500">ZONE: </span><span className="text-white">{row.zone}</span></div>}
                                    {row.cross_street && <div><span className="text-slate-500">CROSS ST: </span><span className="text-white">{row.cross_street}</span></div>}
                                    <div className="sm:col-span-2 lg:col-span-3"><span className="text-slate-500">ASSIGNED OFFICERS / UNITS: </span><span className="font-bold text-emerald-300">{activity?.assignments?.length ? activity.assignments.map(unit=>unit.label+(unit.role?' ('+unit.role+')':'')).join(', ') : row._assignedUnitDetails?.length ? row._assignedUnitDetails.map(unit => unit.label).join(', ') : detail.loading?'Loading assignments…':'No assignment shown'}</span></div>
                                    {row._propertyCall && <div><span className="text-slate-500">Monitored property: </span><span className="font-bold text-amber-300">{sentenceCase(row._propertyName || row._propertyAlert?.propertyName || 'Monitored property')}</span></div>}
                                    {row._propertyCall && row._propertyLifecycle && <div><span className="text-slate-500">PROPERTY ALERT STATUS: </span><span className="text-white">{String(row._propertyLifecycle).replaceAll('_', ' ')}</span></div>}
                                    {row._propertyCall && Number.isFinite(Number(row._propertyDistanceMeters)) && Number(row._propertyDistanceMeters) > 0 && <div><span className="text-slate-500">BOUNDARY DISTANCE: </span><span className="text-white">{Math.round(Number(row._propertyDistanceMeters) / 0.3048)} ft</span></div>}
                                    {row.time_dispatched && <div><span className="text-slate-500">DISPATCHED: </span><span className="text-white">{fmtDT(row.time_dispatched)}</span></div>}
                                    {row.time_on_scene && <div><span className="text-slate-500">ON SCENE: </span><span className="text-white">{fmtDT(row.time_on_scene)}</span></div>}
                                    {row.time_cleared && <div><span className="text-slate-500">CLEARED: </span><span className="text-white">{fmtDT(row.time_cleared)}</span></div>}
                                    {row.ai_summary && (
                                        <div className="mt-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 sm:col-span-2 lg:col-span-3">
                                            <span className="text-gold text-[9px] tracking-widest">AI SUMMARY: </span>
                                            <span className="text-slate-300">{row.ai_summary}</span>
                                        </div>
                                    )}
                                    <section className="sm:col-span-2 lg:col-span-3 rounded-xl border border-cyan-800 bg-[#0a1320] p-4 text-sm">
                                      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-cyan-100">Call Notes &amp; Activity Timeline</h3><button type="button" disabled={detail.loading} onClick={()=>loadDetails(row,true)} className="rounded border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-100"><RefreshCw className={`mr-1 inline h-3 w-3 ${detail.loading?'animate-spin':''}`}/>Refresh activity</button></div>
                                      {detail.loading&&<p className="mt-2 text-cyan-300">Loading recorded call activity…</p>}
                                      {detail.error&&<p role="alert" className="mt-2 text-amber-200">{detail.error}. Select Refresh activity to retry.</p>}
                                      {activity?.warnings?.map(w=><p key={w} role="status" className="mt-1 text-xs text-amber-300">{w}</p>)}
                                      {activity&&<><div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300"><span>{activity.note_count} saved notes</span><span>{activity.log_count} CAD status records</span><span>{activity.assignments?.length||0} assignments</span></div>
                                      <div className="mt-3 rounded border border-slate-700 p-3"><h4 className="font-bold text-white">Recorded outcome / disposition</h4>{activity.disposition?<p className="mt-1 whitespace-pre-wrap text-slate-200">{activity.disposition}</p>:<p className="mt-1 text-xs text-slate-400">No separate final disposition recorded. Review clearance notes and individual assignments below.</p>}{activity.assignments?.map((a,i)=><div key={i} className="mt-2 border-t border-slate-700 pt-2 text-xs"><b>{a.label}</b> · {a.role} · {a.status}{a.description&&<p className="mt-1 whitespace-pre-wrap text-slate-300">{a.description}</p>}</div>)}</div>
                                      <div className="mt-4 space-y-2">{activity.timeline?.map(entry=><article key={entry.id} className="border-l-2 border-cyan-700 bg-slate-900/60 p-3"><div className="flex flex-wrap justify-between gap-2"><b className="capitalize text-cyan-100">{entry.title}</b><span className="text-xs text-slate-400">{fmtDT(entry.at)} ET</span></div><p className="mt-1 text-xs font-semibold text-slate-300">{entry.actor}</p>{entry.text&&<p className="mt-1 whitespace-pre-wrap break-words text-slate-200">{entry.text}</p>}</article>)}</div>
                                      {!activity.timeline?.length&&!activity.warnings?.length&&<p className="mt-3 text-slate-400">No saved activity found for this call.</p>}
                                      </>}
                                    </section>
                                    <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-700 bg-[#0a1320] p-3">
                                      <PropertyCallLinkControl call={row} onLinked={link=>setRows(current=>current.map(item=>item.id===row.id?{...item,_propertyCall:true,_propertyId:link.property_id,_propertyName:link.property_name,_propertyLinks:[...(item._propertyLinks||[]),link]}:item))}/>
                                      <p className="text-[11px] font-bold text-cyan-200">Reports linked to this call ({activity?.linked_reports?.length||row._linkedReports?.length||0})</p>
                                      {detail.loading&&<p className="text-xs text-cyan-300">Loading linked reports and recorded assignments…</p>}


                                      {activity && !activity.linked_reports?.length && !activity.warnings?.length && <p className="mt-1 text-xs text-slate-400">No report links recorded for this call.</p>}
                                      <div className="mt-2 flex flex-wrap gap-2">{(activity?.linked_reports||row._linkedReports||[]).map(link=><button key={link.id} type="button" onClick={event=>{event.stopPropagation();openLinkedReport(link);}} className="rounded-md border border-cyan-700 bg-cyan-950/30 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-900/40">Open {sentenceCase(String(link.report_type||'Report').replace(/([a-z])([A-Z])/g,'$1 $2'))} #{link.report_number||link.report_id}</button>)}</div>
                                      {linkingCallId===row.id&&<div className="mt-3 flex flex-wrap gap-2"><input value={existingReportNumber} onChange={e=>setExistingReportNumber(e.target.value)} placeholder="Existing incident report number" className="h-9 flex-1 rounded border border-slate-600 bg-slate-900 px-3 text-xs text-white"/><button disabled={linkBusy} onClick={event=>{event.stopPropagation();linkExistingIncidentReport(row);}} className="rounded bg-emerald-700 px-3 py-2 font-bold text-white">{linkBusy?'Linking…':'Link report'}</button><button onClick={event=>{event.stopPropagation();setLinkingCallId(null);}} className="rounded border border-slate-600 px-3 py-2">Cancel</button></div>}
                                    </div>
                                    <div className="mt-2 flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap lg:col-span-3">
                                        {isActive && (
                                            <button onClick={() => navigate(cadDestination('Navigation',new URLSearchParams({callId:row.original_call_id||row.id,...(row.latitude&&row.longitude?{lat:String(row.latitude),lng:String(row.longitude)}:{})})))}
                                                className="rounded border border-blue-600 bg-blue-700 px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-blue-600">
                                                VIEW ON MAP
                                            </button>
                                        )}
                                        <button
                                            onClick={(event) => { event.stopPropagation(); openIncidentReport(row); }}
                                            className="rounded border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
                                        >
                                            Create incident report
                                        </button>
                                        <button type="button" onClick={event=>{event.stopPropagation();setLinkingCallId(row.id);setExistingReportNumber('');}} className="rounded border border-cyan-700 bg-cyan-950/30 px-3 py-1.5 text-[10px] font-bold text-cyan-200">Link existing report</button>
                                    </div>
                                </div>
);
    };
    return (
        <div className="tac-console cad-terminal-page cad-history-terminal">
            <CadTerminalHeader title="Records / call history" icon={History} subtitle="Active, archived and property incident records"><button type="button" onClick={printPropertyAlerts}><Printer size={15}/> Property PDF</button><CadRefresh onClick={handleRefresh} busy={refreshing}/></CadTerminalHeader>
            <CadMetricStrip items={[{label:'Showing',value:sorted.length},{label:'Active',value:activeCount,tone:'ready'},{label:'Archived',value:archivedCount},{label:'Property',value:propertyCount,tone:'warning'}]}/>
            <form onSubmit={event=>{event.preventDefault();handleRefresh();}} className="cad-terminal-filter cad-history-search"><input aria-label="Search all CAD history" value={search} onChange={e=>setSearch(e.target.value)} placeholder="CAD / BPS number, incident or address" className="min-h-10 min-w-48 flex-1 rounded border border-slate-500 bg-slate-900 px-3 text-sm text-white"/><label className="text-xs text-slate-300">From <input type="date" aria-label="History start date" value={fromDate} onChange={event=>setFromDate(event.target.value)} className="min-h-10 rounded border border-slate-500 bg-slate-900 px-3 text-sm text-white"/></label><label className="text-xs text-slate-300">Through <input type="date" aria-label="History end date" value={throughDate} onChange={event=>setThroughDate(event.target.value)} className="min-h-10 rounded border border-slate-500 bg-slate-900 px-3 text-sm text-white"/></label><button type="submit" disabled={refreshing} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white disabled:opacity-50">{refreshing?'Searching…':'Search active & archived calls'}</button></form>
            {/* Filter Bar */}
            <div className="cad-terminal-filter cad-history-filters">
                {/* Agency filter */}
                <span className="text-[9px] text-slate-500 tracking-widest">AGENCY:</span>
                <div className="flex max-w-full gap-1 overflow-x-auto pb-1 md:overflow-visible md:pb-0">
                    {agencies.map(a => (
                        <button key={a} onClick={() => setAgencyFilter(a)}
                            className={`px-2 py-1 rounded border text-[9px] font-bold transition-all ${agencyFilter === a ? 'bg-gold/20 border-gold/50 text-gold' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                            {a}
                        </button>
                    ))}
                </div>

                <div className="w-px h-5 bg-slate-700" />

                <span className="text-[9px] text-slate-500 tracking-widest">CALL CLASS:</span>
                <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} className="bg-slate-800 border border-slate-700 text-[10px] text-white px-2 py-1.5 rounded focus:outline-none focus:border-gold">
                    <option value="ALL">All calls</option><option value="PROPERTY">Property calls</option><option value="PUBLIC">Public safety calls</option>
                </select>

                {/* Status filter */}
                <span className="text-[9px] text-slate-500 tracking-widest">STATUS:</span>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-[10px] text-white px-2 py-1.5 rounded focus:outline-none focus:border-gold">
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            <div className="cad-history-resultbar">
              <span>Last 90 days · {rows.length} {propertyFilter==='PROPERTY'?'property history records':'calls'} loaded</span>
              {nextCursor && <button type="button" disabled={refreshing} onClick={()=>{setRefreshing(true);void loadAll(true,true);}} className="min-h-10 rounded border border-cyan-600 bg-cyan-950 px-4 font-bold text-cyan-100 disabled:opacity-50">{refreshing?'Loading…':'Load older calls'}</button>}
              {historyWarning && <span role="status" className="text-amber-300">{historyWarning}</span>}
            </div>
            <div className="cad-terminal-split cad-history-split" data-detail={!!selectedRecord}>
              <section className="cad-terminal-panel"><CadPanelBar title="Record index"><select aria-label="Sort history records" value={sortField} onChange={e=>handleSort(e.target.value)}><option value="time">Date / time</option><option value="incident">Incident</option><option value="agency">Agency</option><option value="status">Status</option></select><button onClick={()=>handleSort(sortField)}>{sortDir==='asc'?'Ascending':'Descending'}</button></CadPanelBar>
              <div className="cad-terminal-scroll">
                {sorted.length===0?<p className="tac-empty">{nextCursor?'No matches in loaded records. Load older calls to continue.':historyWarning?'History may be incomplete. Retry.':'No records match filters.'}</p>:sorted.map(row=><button key={row.id} type="button" className="cad-history-strip" aria-pressed={expandedId===row.id} onClick={()=>expandCall(row)}><div><small>{cadReference(row)||'Reference pending'}</small><time>{fmtDT(row.time_received||row.created_date)}</time></div><strong>{sentenceCase(row.incident)}</strong><p>{row.location||'Location not recorded'}</p><div><span>{row.agency||'—'} · {historyCallStatus(row)}</span>{row._propertyCall&&<span className="text-amber-300">{row._propertyName||row._propertyAlert?.propertyName||'Property call'}</span>}</div></button>)}
              </div></section>
              <section className="cad-terminal-panel cad-history-detail"><CadPanelBar title="Selected call record">{selectedRecord&&<button type="button" onClick={()=>setExpandedId(null)}>Close record</button>}</CadPanelBar><div className="cad-terminal-scroll">{selectedRecord?<><div className="cad-terminal-record-title"><small>{cadReference(selectedRecord)||'Reference pending'} · {historyCallStatus(selectedRecord)}</small><h2>{sentenceCase(selectedRecord.incident)}</h2><p>{selectedRecord.location||'Location not recorded'} · {fmtDT(selectedRecord.time_received||selectedRecord.created_date)}</p></div>{renderRecordDetail(selectedRecord)}</>:<p className="tac-empty">Select a call to view its narrative, assignments, timeline, disposition and linked records.</p>}</div></section>
            </div>
            {/* Status Bar */}
            <div className="cad-terminal-footer">
                <span>LOADED: <span className="text-white">{sorted.length}</span></span>
                <span>ACTIVE: <span className="text-cyan-300">{activeCount}</span></span>
                <span>ARCHIVED: <span className="text-slate-300">{archivedCount}</span></span>
                <span>PROPERTY CALLS: <span className="text-amber-300">{propertyCount}</span></span>
                <div className="flex-1" />
                <span className="text-green-500">{refreshing?'SYNCING':historyWarning?'CHECK RECORDS':'RECORDS READY'}</span>
            </div>
        </div>
    );
}
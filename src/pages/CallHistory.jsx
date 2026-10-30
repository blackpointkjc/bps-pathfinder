import { addressHistoryPattern } from '../../base44/functions/_shared/addressHistoryMatch.js';
import { isValidCallRecord, isVisibleActiveCall } from '../../base44/functions/_shared/callFeedPolicy.js';
import { cadReference } from '@/lib/cadReference';
import { cadDestination } from '@/lib/cadNavigation';
import PropertyCallLinkControl from '@/components/dispatch/PropertyCallLinkControl';
import { useState, useEffect, useRef } from 'react';
import { base44, clearBase44ReadCacheMatching } from '@/api/base44Client';
import { toast } from 'sonner';
import { RefreshCw, MapPin, ChevronDown, ChevronUp, Radio, Archive, Building2, History, Printer } from 'lucide-react';
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

export default function CallHistory() {
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
    const [linkingCallId,setLinkingCallId]=useState(null);
    const [existingReportNumber,setExistingReportNumber]=useState('');
    const [linkBusy,setLinkBusy]=useState(false);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const intervalRef = useRef(null);
    const realtimeTimerRef = useRef(null);
    const loadInFlightRef = useRef(false);
    const lastServerReadRef=useRef(0);
    const pendingSearchRef=useRef(false);
    const monitoredPropertiesRef = useRef([]);
    const propertyBoundariesReadAtRef = useRef(0);
    const cursorRef = useRef(null);
    const [nextCursor, setNextCursor] = useState(null);
    const [historyWarning, setHistoryWarning] = useState('');
    const pagesLoadedRef = useRef(0);
    const filtersRef = useRef({agency:agencyFilter,status:statusFilter});
    filtersRef.current = {agency:agencyFilter,status:statusFilter};
    const filtersMountedRef = useRef(false);
    useEffect(() => {
      if (!filtersMountedRef.current) { filtersMountedRef.current = true; return; }
      setRefreshing(true);
      void loadAll(true);
    }, [agencyFilter, statusFilter]);

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
            if (user.role !== 'admin' && user.role !== 'dispatch' && !roles.has('dispatch') && !user.dispatch_role && !roles.has('cad_access') && !roles.has('full_access')) {
                toast.error('Access required');
                navigate(createPageUrl('CommandDashboard'));
                return;
            }
        } catch { navigate(createPageUrl('CommandDashboard')); return; }
        await loadAll();
    };

    const loadAll = async (force=false, append=false) => {
        if(loadInFlightRef.current){if(force)pendingSearchRef.current=true;return;}
        if (!force && !append && pagesLoadedRef.current > 1) return;
        if (!force && !append && Date.now()-lastServerReadRef.current<45000) return;
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

            const result = await withRequestTimeout(
                base44.functions.invoke('getCallHistoryFeed', {search:searchRef.current, ...filtersRef.current, since:fromDateRef.current?new Date(fromDateRef.current+'T00:00:00').toISOString():undefined, until:throughDateRef.current?new Date(new Date(throughDateRef.current+'T00:00:00').setDate(new Date(throughDateRef.current+'T00:00:00').getDate()+1)-1).toISOString():undefined, page_size:40, cursor:append?cursorRef.current:null}),
                15000,
                'Call history request'
            );
            let payload = result?.data || result || {};
            if (!Array.isArray(payload.rows) && payload?.data && typeof payload.data === 'object') payload = payload.data;
            if (payload.error) throw new Error(payload.error);
            let feedRows = Array.isArray(payload.rows) ? payload.rows : [];
            let liveFeedRecovered = false;
            // The archived-history query can return a misleading empty page
            // while the operational CAD board has verified current calls.
            // Recover those calls from the SAME shared feed as Dispatch Center,
            // never invent records or silently claim the archive is complete.
            if(!append && !feedRows.length && !searchRef.current.trim()
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
            setNextCursor(cursorRef.current);
            pagesLoadedRef.current = append ? pagesLoadedRef.current + 1 : 1;
            setHistoryWarning(liveFeedRecovered
                ? 'Showing verified live CAD calls. The historical archive feed returned no records; archive details may be incomplete.'
                : (payload.warnings || []).length ? 'Some related details could not be loaded. Refresh to retry.' : '');
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
            setHistoryWarning('Call History service is unavailable or throttled. Previous records remain visible if already loaded; retry after the API cooldown.');
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
        const addressMatches = addressPattern && new RegExp(addressPattern, 'i').test(String(r.location || ''));
        const propertyRows = rows.filter(row => {
            if (!row._propertyCall) return false;
            if (q && !addressMatches && ![
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
        if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" /><p className="text-gold font-mono text-xs tracking-widest">Loading call history…</p></div>
        </div>
    );

    return (
        <div className="min-h-full bg-[#07111d] p-2 font-mono text-white md:p-3">
            <form onSubmit={event=>{event.preventDefault();handleRefresh();}} className="mb-3 flex flex-wrap gap-2"><input aria-label="Search all CAD history" value={search} onChange={e=>setSearch(e.target.value)} placeholder="CAD / BPS number, incident or address" className="min-h-10 min-w-48 flex-1 rounded border border-slate-500 bg-slate-900 px-3 text-sm text-white"/><label className="text-xs text-slate-300">From <input type="date" aria-label="History start date" value={fromDate} onChange={event=>setFromDate(event.target.value)} className="min-h-10 rounded border border-slate-500 bg-slate-900 px-3 text-sm text-white"/></label><label className="text-xs text-slate-300">Through <input type="date" aria-label="History end date" value={throughDate} onChange={event=>setThroughDate(event.target.value)} className="min-h-10 rounded border border-slate-500 bg-slate-900 px-3 text-sm text-white"/></label><button type="submit" disabled={refreshing} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white disabled:opacity-50">{refreshing?'Searching…':'Search active & archived calls'}</button></form>
            {/* Header */}
            <div className="flex flex-col gap-3 rounded-2xl border border-[#2b4258] bg-[#0a1623] p-3 shadow-xl lg:flex-row lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10"><History className="h-5 w-5 text-cyan-300" /></div>
                    <div className="min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-400">CAD Records</div>
                        <h1 className="truncate text-lg font-black tracking-tight text-white">Call History</h1>
                        <div className="text-[9px] text-slate-500">Active and archived calls in one live record stream</div>
                    </div>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:ml-4">
                    <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2"><div className="text-[8px] font-black uppercase text-cyan-300">Showing</div><div className="text-lg font-black">{sorted.length}</div></div>
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2"><div className="flex items-center gap-1 text-[8px] font-black uppercase text-emerald-300"><Radio className="h-3 w-3"/>Active</div><div className="text-lg font-black">{activeCount}</div></div>
                    <div className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2"><div className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400"><Archive className="h-3 w-3"/>Archived</div><div className="text-lg font-black">{archivedCount}</div></div>
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2"><div className="flex items-center gap-1 text-[8px] font-black uppercase text-amber-300"><Building2 className="h-3 w-3"/>Property</div><div className="text-lg font-black">{propertyCount}</div></div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-[9px] text-slate-500 sm:inline">UPDATED {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                    <button onClick={printPropertyAlerts}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-500 bg-white px-3 text-[10px] font-black text-slate-900 transition hover:bg-slate-100">
                        <Printer className="h-3.5 w-3.5" />PRINT PROPERTY PDF
                    </button>
                    <button onClick={handleRefresh} disabled={refreshing}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-cyan-700/60 bg-cyan-950/30 px-3 text-[10px] font-black text-cyan-100 transition hover:border-cyan-400 hover:bg-cyan-900/40 disabled:opacity-50">
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />REFRESH
                    </button>
                </div>
            </div>


            {/* Filter Bar */}
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-[#293f55] bg-[#091522] px-3 py-2 sm:px-4 md:flex-row md:flex-wrap md:items-center">
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

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              <span>Last 90 days · {rows.length} calls loaded · Filters apply to loaded results</span>
              {nextCursor && <button type="button" disabled={refreshing} onClick={()=>{setRefreshing(true);void loadAll(true,true);}} className="min-h-10 rounded border border-cyan-600 bg-cyan-950 px-4 font-bold text-cyan-100 disabled:opacity-50">{refreshing?'Loading…':'Load older calls'}</button>}
              {historyWarning && <span role="status" className="text-amber-300">{historyWarning}</span>}
            </div>
            {/* Table */}
            <div className="mt-2 max-h-[calc(100dvh-265px)] overflow-auto rounded-t-xl border border-[#293f55] bg-[#08131f]">
                {/* Column Headers */}
                <div className="sticky top-0 z-10 hidden items-center border-b-2 border-slate-700 bg-slate-800 px-3 py-1.5 text-[9px] tracking-widest text-slate-500 select-none md:flex">
                    <div className="w-8 flex-shrink-0">#</div>
                    <div className="w-36 flex-shrink-0 cursor-pointer hover:text-slate-300" onClick={() => handleSort('time')}>Date / time <SortIcon field="time" /></div>
                    <div className="flex-1 cursor-pointer hover:text-slate-300" onClick={() => handleSort('incident')}>Incident type <SortIcon field="incident" /></div>
                    <div className="w-56 flex-shrink-0">Location</div>
                    <div className="w-20 flex-shrink-0 cursor-pointer hover:text-slate-300" onClick={() => handleSort('agency')}>Agency <SortIcon field="agency" /></div>
                    <div className="w-24 flex-shrink-0 cursor-pointer hover:text-slate-300" onClick={() => handleSort('status')}>Status <SortIcon field="status" /></div>
                    <div className="w-16 flex-shrink-0 text-center">Units</div>
                    <div className="w-8 flex-shrink-0" />
                </div>

                {sorted.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-600 text-xs tracking-widest">{historyWarning ? '— CALL HISTORY UNAVAILABLE —' : '— NO RECORDS MATCH FILTERS —'}</div>
                ) : sorted.map((row, idx) => {
                    const isActive = row._source === 'active' && isVisibleActiveCall(row);
                    const agKey = agencyKey(row.agency);
                    const agCls = AGENCY_COLORS[agKey] || 'bg-slate-700 text-slate-300 border-slate-600';
                    const stCls = STATUS_COLORS[historyCallStatus(row)] || 'bg-slate-700 text-slate-400 border-slate-600';
                    const isExpanded = expandedId === (row.id);
                    return (
                        <div key={row.id}>
                            <div role="button" tabIndex={0} aria-expanded={isExpanded} aria-label={'Open history call '+(cadReference(row)||'Reference Pending')} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setExpandedId(isExpanded?null:row.id);}}}
                                onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                className={`flex cursor-pointer flex-col gap-2 border-b border-slate-800/70 px-3 py-3 text-[10px] transition-colors md:flex-row md:items-center md:gap-0 md:py-2
                                    ${isActive ? 'bg-blue-950/20 hover:bg-blue-950/40 border-l-2 border-l-blue-500' : 'bg-slate-900 hover:bg-slate-800/50 border-l-2 border-l-transparent'}
                                    ${isExpanded ? 'bg-slate-800/60' : ''}`}> 
                                <div className="hidden w-8 flex-shrink-0 text-slate-600 md:block">{sorted.length - idx}</div>
                                <div className="w-full text-slate-400 lg:w-36 lg:flex-shrink-0"><span className="mr-2 text-[8px] font-bold text-slate-600 lg:hidden">Date / time</span>{fmtDT(row.time_received || row.created_date)}</div>
                                <div className="min-w-0 w-full flex-1 md:pr-2">
                                    <span className={`text-white font-bold ${isActive ? 'text-blue-200' : ''}`}>{sentenceCase(row.incident)}</span><div className="mt-1 text-[10px] font-bold text-cyan-200">CAD / REF: {cadReference(row)||'Assigning CAD Reference…'}</div>
                                    {isActive && <span className="ml-2 text-[8px] bg-blue-500/30 text-blue-300 border border-blue-500/40 px-1 py-0.5 rounded">Active</span>}
                                    {row._propertyCall && <span className="ml-2 text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.5 rounded">Property call</span>}
                                    {row._propertyCall && (row._propertyName || row._propertyAlert?.propertyName) && (
                                        <div className="mt-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                                            <Building2 className="h-3 w-3" />{sentenceCase(row._propertyName || row._propertyAlert?.propertyName)}
                                        </div>
                                    )}
                                </div>
                                <div className="w-full break-words text-slate-400 md:w-56 lg:flex-shrink-0 md:truncate md:pr-2">
                                    <MapPin className="w-2.5 h-2.5 inline mr-1 text-slate-600" />{row.location || '—'}
                                </div>
                                <div className="w-full md:w-20 lg:flex-shrink-0">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${agCls}`}>{row.agency || '—'}</span>
                                </div>
                                <div className="w-full md:w-24 lg:flex-shrink-0">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${stCls}`}>{historyCallStatus(row)}</span>
                                </div>
                                <div className="w-full text-left text-slate-500 md:w-16 lg:flex-shrink-0 md:text-center">
                                    {row._assignedUnitDetails?.length ? <span className="text-green-400 break-words">{row._assignedUnitDetails.map(unit => unit.label).join(', ')}</span> : row.assigned_units?.length ? <span className="text-green-400">{row.assigned_units.length} unit(s)</span> : 'Unassigned'}
                                </div>
                                <div className="absolute right-3 mt-0 w-8 flex-shrink-0 text-center text-slate-600 md:static">
                                    {isExpanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
                                </div>
                            </div>

                            {/* Expanded detail row */}
                            {isExpanded && (
                                <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-slate-700 bg-slate-800/40 px-3 py-3 text-[10px] sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
                                    {row.description && (
                                        <div className="mb-1 sm:col-span-2 lg:col-span-3">
                                            <span className="text-slate-500 tracking-widest">NARRATIVE: </span>
                                            <span className="text-slate-300">{row.description}</span>
                                        </div>
                                    )}
                                    {row.caller_name && <div><span className="text-slate-500">CALLER: </span><span className="text-white">{row.caller_name}</span></div>}
                                    {row.caller_phone && <div><span className="text-slate-500">PHONE: </span><span className="text-white">{row.caller_phone}</span></div>}
                                    {row.zone && <div><span className="text-slate-500">ZONE: </span><span className="text-white">{row.zone}</span></div>}
                                    {row.cross_street && <div><span className="text-slate-500">CROSS ST: </span><span className="text-white">{row.cross_street}</span></div>}
                                    <div className="sm:col-span-2 lg:col-span-3"><span className="text-slate-500">ASSIGNED OFFICERS / UNITS: </span><span className="font-bold text-emerald-300">{row._assignedUnitDetails?.length ? row._assignedUnitDetails.map(unit => unit.label + (unit.role ? ' (' + unit.role + ')' : '')).join(', ') : 'No recorded unit assignment'}</span></div>
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
                                    <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-700 bg-[#0a1320] p-3">
                                      <PropertyCallLinkControl call={row} onLinked={link=>setRows(current=>current.map(item=>item.id===row.id?{...item,_propertyCall:true,_propertyId:link.property_id,_propertyName:link.property_name,_propertyLinks:[...(item._propertyLinks||[]),link]}:item))}/>
                                      <p className="text-[11px] font-bold text-cyan-200">Reports linked to this call ({row._linkedReports?.length||0})</p>
                                      {!row._linkedReports?.length&&<p className="mt-1 text-xs text-slate-400">No report links recorded yet.</p>}
                                      <div className="mt-2 flex flex-wrap gap-2">{(row._linkedReports||[]).map(link=><button key={link.id} type="button" onClick={event=>{event.stopPropagation();openLinkedReport(link);}} className="rounded-md border border-cyan-700 bg-cyan-950/30 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-900/40">Open {sentenceCase(String(link.report_type||'Report').replace(/([a-z])([A-Z])/g,'$1 $2'))} #{link.report_number||link.report_id}</button>)}</div>
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
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Status Bar */}
            <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 rounded-b-xl border border-t-0 border-[#293f55] bg-[#091522] px-3 py-1.5 text-[9px] text-slate-500 sm:px-4">
                <span>LOADED: <span className="text-white">{sorted.length}</span></span>
                <span>ACTIVE: <span className="text-cyan-300">{activeCount}</span></span>
                <span>ARCHIVED: <span className="text-slate-300">{archivedCount}</span></span>
                <span>PROPERTY CALLS: <span className="text-amber-300">{propertyCount}</span></span>
                <div className="flex-1" />
                <span className="text-green-500">● LIVE</span>
            </div>
        </div>
    );
}
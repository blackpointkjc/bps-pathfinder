import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, RefreshCw, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

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

function fmtDT(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
        timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
}

function agencyKey(agency) {
    if (!agency) return '';
    for (const k of Object.keys(AGENCY_COLORS)) {
        if (agency.includes(k)) return k;
    }
    return '';
}

export default function CallHistory() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [agencyFilter, setAgencyFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [propertyFilter, setPropertyFilter] = useState('ALL');
    const [sortField, setSortField] = useState('time');
    const [sortDir, setSortDir] = useState('desc');
    const [expandedId, setExpandedId] = useState(null);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const intervalRef = useRef(null);

    useEffect(() => {
        init();
        intervalRef.current = setInterval(loadAll, 30000);
        return () => clearInterval(intervalRef.current);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
            if (user.role !== 'admin' && !user.dispatch_role && !roles.has('cad_access') && !roles.has('full_access')) {
                toast.error('Access required');
                navigate(createPageUrl('CommandDashboard'));
                return;
            }
        } catch { navigate(createPageUrl('CommandDashboard')); return; }
        await loadAll();
    };

    const loadAll = async () => {
        try {
            await base44.functions.invoke('archiveOldCalls', {}).catch(error => console.warn('[HISTORY] archive pass failed:', error?.message));
            const result = await base44.functions.invoke('getCallHistoryFeed', {});
            const payload = result?.data || result || {};
            if (payload.error) throw new Error(payload.error);
            const feedRows = payload.rows || [];
            const activeRows = feedRows.filter(row => row._source === 'active');
            const archivedRows = feedRows.filter(row => row._source !== 'active');
            const seenIds = new Set(activeRows.map(c => c.call_id || c.id));
            const dedupedArchived = archivedRows.filter(c => !seenIds.has(c.call_id));
            setRows([...activeRows, ...dedupedArchived]);
            setLastRefresh(new Date());
        } catch (e) {
            console.error('[HISTORY] feed load failed:', e);
            toast.error(`Call history could not be loaded: ${e?.message || 'Unknown error'}`);
            setRows([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadAll();
    };

    const openIncidentReport = (row) => {
        const received = new Date(row.time_received || row.created_date || Date.now());
        const params = new URLSearchParams({
            from_call: 'true',
            call_id: row.original_call_id || row.id || '',
            call_number: row.call_id || row.original_call_id || row.id || '',
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

    const agencies = ['ALL', 'RPD', 'CCPD', 'HPD', 'HCPD', 'RFD', 'CCFD', 'EMS', 'BPS'];
    const statuses = ['ALL', 'New', 'Dispatched', 'Enroute', 'On Scene', 'Cleared', 'Closed', 'Cancelled'];

    const filtered = rows.filter(r => {
        const q = search.toLowerCase();
        if (q && !r.incident?.toLowerCase().includes(q) && !r.location?.toLowerCase().includes(q) && !r.agency?.toLowerCase().includes(q)) return false;
        if (agencyFilter !== 'ALL' && !r.agency?.includes(agencyFilter)) return false;
        if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
        const isPropertyCall = Boolean(r._propertyCall);
        if (propertyFilter === 'PROPERTY' && !isPropertyCall) return false;
        if (propertyFilter === 'PUBLIC' && isPropertyCall) return false;
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        let va, vb;
        if (sortField === 'time') { va = new Date(a.time_received || a.created_date); vb = new Date(b.time_received || b.created_date); }
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
        return <span className="text-gold ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" /><p className="text-gold font-mono text-xs tracking-widest">LOADING CALL HISTORY...</p></div>
        </div>
    );

    return (
        <div className="bg-slate-950 min-h-full flex flex-col font-mono">
            {/* Header */}
            <div className="flex-none flex flex-col gap-2 border-b-2 border-gold/50 bg-slate-900 px-3 py-3 sm:px-4 md:flex-row md:items-center md:gap-3 md:py-2">
                <div className="w-1 h-6 bg-gold rounded-sm" />
                <span className="text-white font-bold text-sm tracking-widest">CALL HISTORY LOG</span>
                <span className="text-[10px] text-slate-500 md:ml-2">ACTIVE + ARCHIVED — {sorted.length} RECORDS</span>
                <div className="hidden flex-1 md:block" />
                <span className="text-[10px] text-slate-600">REFRESHED {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                <button onClick={handleRefresh} disabled={refreshing}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-white hover:border-gold transition-all text-[10px]">
                    <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />REFRESH
                </button>
            </div>

            {/* Filter Bar */}
            <div className="flex-none flex flex-col gap-2 border-b border-slate-800 bg-slate-900/60 px-3 py-3 sm:px-4 md:flex-row md:flex-wrap md:items-center md:py-2">
                {/* Search */}
                <div className="relative w-full md:w-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="SEARCH INCIDENT / LOCATION / AGENCY..."
                        className="w-full rounded border border-slate-700 bg-slate-800 py-2 pl-8 pr-3 text-[10px] text-white placeholder-slate-600 focus:border-gold focus:outline-none md:w-64 md:py-1.5" />
                </div>

                <div className="w-px h-5 bg-slate-700" />

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
                    <option value="ALL">ALL CALLS</option><option value="PROPERTY">PROPERTY CALLS</option><option value="PUBLIC">PUBLIC SAFETY CALLS</option>
                </select>

                {/* Status filter */}
                <span className="text-[9px] text-slate-500 tracking-widest">STATUS:</span>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-[10px] text-white px-2 py-1.5 rounded focus:outline-none focus:border-gold">
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {/* Column Headers */}
                <div className="sticky top-0 z-10 hidden items-center border-b-2 border-slate-700 bg-slate-800 px-3 py-1.5 text-[9px] tracking-widest text-slate-500 select-none md:flex">
                    <div className="w-8 flex-shrink-0">#</div>
                    <div className="w-36 flex-shrink-0 cursor-pointer hover:text-slate-300" onClick={() => handleSort('time')}>DATE/TIME <SortIcon field="time" /></div>
                    <div className="flex-1 cursor-pointer hover:text-slate-300" onClick={() => handleSort('incident')}>INCIDENT TYPE <SortIcon field="incident" /></div>
                    <div className="w-56 flex-shrink-0">LOCATION</div>
                    <div className="w-20 flex-shrink-0 cursor-pointer hover:text-slate-300" onClick={() => handleSort('agency')}>AGENCY <SortIcon field="agency" /></div>
                    <div className="w-24 flex-shrink-0 cursor-pointer hover:text-slate-300" onClick={() => handleSort('status')}>STATUS <SortIcon field="status" /></div>
                    <div className="w-16 flex-shrink-0 text-center">UNITS</div>
                    <div className="w-8 flex-shrink-0" />
                </div>

                {sorted.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-600 text-xs tracking-widest">— NO RECORDS MATCH FILTERS —</div>
                ) : sorted.map((row, idx) => {
                    const isActive = row._source === 'active' && !['Cleared', 'Cancelled'].includes(row.status);
                    const agKey = agencyKey(row.agency);
                    const agCls = AGENCY_COLORS[agKey] || 'bg-slate-700 text-slate-300 border-slate-600';
                    const stCls = STATUS_COLORS[row.status] || 'bg-slate-700 text-slate-400 border-slate-600';
                    const isExpanded = expandedId === (row.id);
                    return (
                        <div key={row.id}>
                            <div
                                onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                className={`flex cursor-pointer flex-col gap-2 border-b border-slate-800/70 px-3 py-3 text-[10px] transition-colors md:flex-row md:items-center md:gap-0 md:py-2
                                    ${isActive ? 'bg-blue-950/20 hover:bg-blue-950/40 border-l-2 border-l-blue-500' : 'bg-slate-900 hover:bg-slate-800/50 border-l-2 border-l-transparent'}
                                    ${isExpanded ? 'bg-slate-800/60' : ''}`}> 
                                <div className="hidden w-8 flex-shrink-0 text-slate-600 md:block">{sorted.length - idx}</div>
                                <div className="w-full text-slate-400 md:w-36 md:flex-shrink-0"><span className="mr-2 text-[8px] font-bold text-slate-600 md:hidden">DATE/TIME</span>{fmtDT(row.time_received || row.created_date)}</div>
                                <div className="min-w-0 w-full flex-1 md:pr-2">
                                    <span className={`text-white font-bold ${isActive ? 'text-blue-200' : ''}`}>{row.incident || '—'}</span>
                                    {isActive && <span className="ml-2 text-[8px] bg-blue-500/30 text-blue-300 border border-blue-500/40 px-1 py-0.5 rounded">ACTIVE</span>}
                                    {row._propertyCall && <span className="ml-2 text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.5 rounded">PROPERTY CALL</span>}
                                </div>
                                <div className="w-full break-words text-slate-400 md:w-56 md:flex-shrink-0 md:truncate md:pr-2">
                                    <MapPin className="w-2.5 h-2.5 inline mr-1 text-slate-600" />{row.location || '—'}
                                </div>
                                <div className="w-full md:w-20 md:flex-shrink-0">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${agCls}`}>{row.agency || '—'}</span>
                                </div>
                                <div className="w-full md:w-24 md:flex-shrink-0">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${stCls}`}>{row.status || '—'}</span>
                                </div>
                                <div className="w-full text-left text-slate-500 md:w-16 md:flex-shrink-0 md:text-center">
                                    {row.assigned_units?.length > 0 ? <span className="text-green-400">{row.assigned_units.length}U</span> : '—'}
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
                                    {row.time_dispatched && <div><span className="text-slate-500">DISPATCHED: </span><span className="text-white">{fmtDT(row.time_dispatched)}</span></div>}
                                    {row.time_on_scene && <div><span className="text-slate-500">ON SCENE: </span><span className="text-white">{fmtDT(row.time_on_scene)}</span></div>}
                                    {row.time_cleared && <div><span className="text-slate-500">CLEARED: </span><span className="text-white">{fmtDT(row.time_cleared)}</span></div>}
                                    {row.ai_summary && (
                                        <div className="mt-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 sm:col-span-2 lg:col-span-3">
                                            <span className="text-gold text-[9px] tracking-widest">AI SUMMARY: </span>
                                            <span className="text-slate-300">{row.ai_summary}</span>
                                        </div>
                                    )}
                                    <div className="mt-2 flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap lg:col-span-3">
                                        {isActive && (
                                            <button onClick={() => navigate(`${createPageUrl('Navigation')}?callId=${row.id}${row.latitude ? `&lat=${row.latitude}&lng=${row.longitude}` : ''}`)}
                                                className="rounded border border-blue-600 bg-blue-700 px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-blue-600">
                                                VIEW ON MAP
                                            </button>
                                        )}
                                        <button
                                            onClick={(event) => { event.stopPropagation(); openIncidentReport(row); }}
                                            className="rounded border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
                                        >
                                            CREATE / LINK INCIDENT REPORT
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Status Bar */}
            <div className="flex-none flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 bg-slate-900 px-3 py-1 text-[9px] text-slate-500 sm:px-4">
                <span>TOTAL: <span className="text-white">{sorted.length}</span></span>
                <span>ACTIVE: <span className="text-blue-400">{sorted.filter(r => r._source === 'active' && !['Closed','Cleared','Cancelled'].includes(r.status)).length}</span></span>
                <span>ARCHIVED: <span className="text-slate-400">{sorted.filter(r => r._source === 'archived').length}</span></span>
                <div className="flex-1" />
                <span className="text-green-500">● LIVE</span>
            </div>
        </div>
    );
}
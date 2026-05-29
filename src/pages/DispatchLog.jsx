import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Download } from 'lucide-react';
import { createPageUrl } from '../utils';

function fmtDT(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
        timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
}

export default function DispatchLog() {
    const navigate = useNavigate();
    const [statusLogs, setStatusLogs] = useState([]);
    const [callLogs, setCallLogs] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    useEffect(() => {
        init();
        const interval = setInterval(() => loadLogs(), 10000);
        return () => clearInterval(interval);
    }, []);

    const init = async () => {
        try {
            const user = await base44.auth.me();
            if (user.role !== 'admin') { toast.error('Admin access required'); navigate(createPageUrl('CommandDashboard')); return; }
            await loadLogs();
        } catch { navigate(createPageUrl('CommandDashboard')); }
        finally { setLoading(false); }
    };

    const loadLogs = async () => {
        try {
            const [unitLogs, callStatusLogs] = await Promise.all([
                base44.entities.UnitStatusLog.list('-created_date', 200),
                base44.entities.CallStatusLog.list('-created_date', 200)
            ]);
            setStatusLogs(unitLogs || []);
            setCallLogs(callStatusLogs || []);
            setLastRefresh(new Date());
        } catch (error) { console.error(error); }
        finally { setRefreshing(false); }
    };

    const allLogs = [
        ...statusLogs.map(log => ({ ...log, _type: 'unit', timestamp: log.created_date })),
        ...callLogs.map(log => ({ ...log, _type: 'call', timestamp: log.created_date }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const filteredLogs = allLogs.filter(log => {
        if (filterType !== 'all' && log._type !== filterType) return false;
        const q = searchQuery.toLowerCase();
        if (!q) return true;
        return log.unit_name?.toLowerCase().includes(q) || log.incident_type?.toLowerCase().includes(q) || log.new_status?.toLowerCase().includes(q) || log.location?.toLowerCase().includes(q);
    });

    const exportCSV = () => {
        const rows = [['TIMESTAMP', 'TYPE', 'UNIT/CALL', 'OLD STATUS', 'NEW STATUS', 'LOCATION', 'NOTES']];
        filteredLogs.forEach(log => {
            rows.push([
                fmtDT(log.timestamp),
                log._type.toUpperCase(),
                log._type === 'unit' ? (log.unit_name || '') : (log.incident_type || ''),
                log.old_status || '',
                log.new_status || '',
                log.location || '',
                log.notes || ''
            ]);
        });
        const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `dispatch_log_${Date.now()}.csv`; a.click();
        toast.success('Log exported');
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-gold border-t-transparent mx-auto mb-3" /><p className="text-gold font-mono text-xs tracking-widest">LOADING DISPATCH LOG...</p></div>
        </div>
    );

    return (
        <div className="bg-slate-950 min-h-full flex flex-col font-mono">
            {/* Header */}
            <div className="flex-none bg-slate-900 border-b-2 border-gold/50 px-4 py-2 flex items-center gap-3">
                <div className="w-1 h-6 bg-gold rounded-sm" />
                <span className="text-white font-bold text-sm tracking-widest">DISPATCH LOG</span>
                <span className="text-[10px] text-slate-500 ml-2">{filteredLogs.length} ENTRIES</span>
                <div className="flex-1" />
                <span className="text-slate-600 text-[10px]">REFRESHED {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                <button onClick={exportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-green-400 hover:border-green-600 transition-all text-[10px]">
                    <Download className="w-3 h-3" />EXPORT CSV
                </button>
                <button onClick={() => { setRefreshing(true); loadLogs(); }} disabled={refreshing}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-400 hover:text-white hover:border-gold transition-all text-[10px]">
                    <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />REFRESH
                </button>
            </div>

            {/* Stats bar */}
            <div className="flex-none grid grid-cols-4 border-b border-slate-800">
                {[
                    { label: 'TOTAL ENTRIES', val: allLogs.length, color: 'text-gold' },
                    { label: 'UNIT STATUS CHANGES', val: statusLogs.length, color: 'text-green-400' },
                    { label: 'CALL STATUS CHANGES', val: callLogs.length, color: 'text-blue-400' },
                    { label: 'FILTERED', val: filteredLogs.length, color: 'text-slate-300' },
                ].map(({ label, val, color }) => (
                    <div key={label} className="flex flex-col items-center py-2 border-r last:border-r-0 border-slate-800">
                        <span className={`text-xl font-bold leading-none ${color}`}>{val}</span>
                        <span className="text-[9px] text-slate-500 tracking-wider mt-0.5">{label}</span>
                    </div>
                ))}
            </div>

            {/* Filter Bar */}
            <div className="flex-none flex items-center gap-3 px-4 py-2 bg-slate-900/50 border-b border-slate-800">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="SEARCH LOG ENTRIES..."
                        className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-white placeholder-slate-600 focus:outline-none focus:border-gold w-56" />
                </div>
                <div className="w-px h-5 bg-slate-700" />
                <div className="flex gap-1">
                    {[['all', 'ALL ENTRIES'], ['unit', 'UNIT LOGS'], ['call', 'CALL LOGS']].map(([val, label]) => (
                        <button key={val} onClick={() => setFilterType(val)}
                            className={`px-2.5 py-1 rounded border text-[9px] font-bold transition-all ${filterType === val ? 'bg-gold/20 border-gold/50 text-gold' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Log Table */}
            <div className="flex-1 overflow-auto">
                {/* Headers */}
                <div className="sticky top-0 z-10 flex items-center bg-slate-800 border-b-2 border-slate-700 px-4 py-1.5 text-[9px] text-slate-500 tracking-widest">
                    <div className="w-36 flex-shrink-0">TIMESTAMP</div>
                    <div className="w-20 flex-shrink-0">TYPE</div>
                    <div className="w-32 flex-shrink-0">UNIT / CALL</div>
                    <div className="w-28 flex-shrink-0">OLD STATUS</div>
                    <div className="w-4 flex-shrink-0 text-center">→</div>
                    <div className="w-28 flex-shrink-0">NEW STATUS</div>
                    <div className="flex-1">DETAILS</div>
                </div>

                {filteredLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-slate-600 text-xs tracking-widest">— NO LOG ENTRIES —</div>
                ) : filteredLogs.map((log, idx) => (
                    <div key={idx} className={`flex items-center px-4 py-2 border-b border-slate-800/60 text-[10px] hover:bg-slate-800/30 ${idx % 2 === 0 ? '' : 'bg-slate-900/30'}`}>
                        <div className="w-36 flex-shrink-0 text-slate-400">{fmtDT(log.timestamp)}</div>
                        <div className="w-20 flex-shrink-0">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${log._type === 'unit' ? 'bg-green-900/40 text-green-300 border-green-700/40' : 'bg-blue-900/40 text-blue-300 border-blue-700/40'}`}>
                                {log._type === 'unit' ? 'UNIT' : 'CALL'}
                            </span>
                        </div>
                        <div className="w-32 flex-shrink-0 text-white font-bold truncate pr-2">
                            {log._type === 'unit' ? (log.unit_name || '—') : (log.incident_type || '—')}
                        </div>
                        <div className="w-28 flex-shrink-0">
                            <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded">{log.old_status || 'N/A'}</span>
                        </div>
                        <div className="w-4 flex-shrink-0 text-center text-slate-600">→</div>
                        <div className="w-28 flex-shrink-0">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                                log.new_status === 'Available' ? 'bg-green-900/40 text-green-300 border-green-700/40' :
                                log.new_status === 'Enroute' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/40' :
                                log.new_status === 'On Scene' ? 'bg-blue-900/40 text-blue-300 border-blue-700/40' :
                                log.new_status === 'Dispatched' ? 'bg-gold/20 text-gold border-gold/30' :
                                'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>{log.new_status || '—'}</span>
                        </div>
                        <div className="flex-1 text-slate-500 truncate">
                            {log._type === 'call' && log.location ? log.location : ''}
                            {log.notes ? <span className="text-slate-600 ml-2">{log.notes}</span> : ''}
                            {log._type === 'unit' && log.call_id ? <span className="text-slate-600 ml-2">CALL: {log.call_id.slice(-8).toUpperCase()}</span> : ''}
                        </div>
                    </div>
                ))}
            </div>

            {/* Status Bar */}
            <div className="flex-none h-6 bg-slate-900 border-t border-slate-800 flex items-center px-4 gap-4 text-[9px] text-slate-500">
                <span>SHOWING <span className="text-white">{filteredLogs.length}</span> OF <span className="text-white">{allLogs.length}</span> ENTRIES</span>
                <div className="flex-1" />
                <span className="text-green-500">● LIVE — 10s REFRESH</span>
            </div>
        </div>
    );
}